// Family accounts on the NAS: SQLite in the data folder, scrypt password hashes, hashed random session tokens.
import { can, ROLES, PERMISSIONS, type Permission, type Role } from "./permissions";
type Sqlite = typeof import("node:sqlite");
type Crypto = typeof import("node:crypto");
const mod = <T>(name: string): T | null => {
  try {
    return (globalThis as any).process?.getBuiltinModule?.(name) ?? null;
  } catch {
    return null;
  }
};
const crypto = () => {
  const c = mod<Crypto>("node:crypto");
  if (!c) throw new Error("A biztonságos fiókkezelés itt nem elérhető.");
  return c;
};
const accountDb = () => {
  const d = db();
  if (!d) throw new Error("A NAS fióktárolója nem elérhető.");
  return d;
};
export const SESSION_COOKIE = "texbox-session";
// Hosted Workers have a virtual filesystem, not the NAS's persistent account database.
export function isHostedAccountPreview() {
  return globalThis.navigator?.userAgent === "Cloudflare-Workers";
}
const dataDir = () =>
  ((globalThis as any).process?.env?.DATA_DIR as string) ||
  (((globalThis as any).process?.env?.DATA_FILE as string) || "/data/nas-state.json").replace(
    /\/[^/]*$/,
    "",
  ) ||
  "/data";
let conn: import("node:sqlite").DatabaseSync | null | undefined;
export function resetAuthDb() {
  try {
    conn?.close();
  } catch {
    /* ignore */
  }
  conn = undefined;
  attempts.clear();
}
export function db() {
  if (isHostedAccountPreview()) return null;
  if (conn !== undefined) return conn;
  const sqlite = mod<Sqlite>("node:sqlite");
  const fs = mod<typeof import("node:fs")>("node:fs");
  if (!sqlite || !fs) return (conn = null);
  try {
    fs.mkdirSync(dataDir(), { recursive: true });
    const d = new sqlite.DatabaseSync(`${dataDir()}/texbox.db`);
    d.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, display_name TEXT NOT NULL, password_hash TEXT, role TEXT NOT NULL, disabled INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions(id_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL, user_agent TEXT, created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS invites(token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS permissions(user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, key TEXT NOT NULL, allowed INTEGER NOT NULL, PRIMARY KEY(user_id, key));
      CREATE TABLE IF NOT EXISTS audit_log(id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, action TEXT NOT NULL, target TEXT, at INTEGER NOT NULL);`);
    // Snapshot the existing database before adding new, independent family tables.
    snapshot(fs, d);
    d.exec(`BEGIN IMMEDIATE;
      CREATE TABLE IF NOT EXISTS family_meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS child_profiles(id TEXT PRIMARY KEY, display_name TEXT NOT NULL, icon TEXT NOT NULL DEFAULT 'child', created_by TEXT NOT NULL REFERENCES users(id), disabled INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
      INSERT OR IGNORE INTO family_meta(key,value) SELECT 'owner',id FROM users WHERE role='admin' AND disabled=0 ORDER BY created_at,id LIMIT 1;
      COMMIT;`);
    conn = d;
    return d;
  } catch (e) {
    console.error("texbox.db unavailable", (e as Error).message);
    return (conn = null);
  }
}
const sha = (s: string) => crypto().createHash("sha256").update(s).digest("hex");
const token = () => crypto().randomBytes(32).toString("base64url");
export function hashPassword(pw: string): string {
  const salt = crypto().randomBytes(16);
  return `scrypt$${salt.toString("hex")}$${crypto().scryptSync(pw, salt, 64).toString("hex")}`;
}
export function verifyPassword(pw: string, stored: string | null): boolean {
  const [kind, salt, hash] = (stored || "").split("$");
  if (kind !== "scrypt" || !salt || !hash) return false;
  const got = crypto().scryptSync(pw, Buffer.from(salt, "hex"), 64);
  const expected = Buffer.from(hash, "hex");
  return got.length === expected.length && crypto().timingSafeEqual(got, expected);
}
export function validPassword(pw: string) {
  return typeof pw === "string" && pw.length >= 8 && pw.length <= 200;
}
export const normUser = (u: string) =>
  String(u || "")
    .trim()
    .toLowerCase();
const validUsername = (u: string) => /^[a-z0-9._-]{2,32}$/.test(u);

export type User = {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  disabled: boolean;
  hasPassword: boolean;
  permissions: Partial<Record<Permission, boolean>>;
};
function rowToUser(r: any): User {
  const perms: Partial<Record<Permission, boolean>> = {};
  for (const p of accountDb()
    .prepare("SELECT key, allowed FROM permissions WHERE user_id=?")
    .all(r.id) as any[])
    if ((PERMISSIONS as readonly string[]).includes(p.key))
      perms[p.key as Permission] = !!p.allowed;
  return {
    id: r.id,
    username: r.username,
    displayName: r.display_name,
    role: r.role,
    disabled: !!r.disabled,
    hasPassword: !!r.password_hash,
    permissions: perms,
  };
}
export const authStorageUnavailable = () =>
  !isHostedAccountPreview() && db() === null && mod<typeof import("node:fs")>("node:fs") !== null;
export function userCount(): number {
  const d = db();
  return d ? Number((d.prepare("SELECT count(*) c FROM users").get() as any).c) : 0;
}
export function listUsers(): User[] {
  return (accountDb().prepare("SELECT * FROM users ORDER BY created_at").all() as any[]).map(
    rowToUser,
  );
}
export function getUser(id: string): User | null {
  const r = accountDb().prepare("SELECT * FROM users WHERE id=?").get(id);
  return r ? rowToUser(r) : null;
}
export function audit(userId: string | null, action: string, target = "") {
  db()
    ?.prepare("INSERT INTO audit_log(user_id,action,target,at) VALUES(?,?,?,?)")
    .run(userId, action, target, Date.now());
}

export function createUser(input: {
  username: string;
  displayName: string;
  role: Role;
  password?: string;
}): User {
  const username = normUser(input.username);
  if (!validUsername(username))
    throw new Error("A felhasználónév 2–32 karakter: kisbetű, szám, pont, kötőjel.");
  if (!ROLES.includes(input.role)) throw new Error("Érvénytelen szerepkör.");
  if (input.password !== undefined && !validPassword(input.password))
    throw new Error("A jelszó legalább 8 karakter.");
  const d = accountDb();
  if (d.prepare("SELECT 1 FROM users WHERE username=?").get(username))
    throw new Error("Ez a felhasználónév már foglalt.");
  const id = crypto().randomUUID();
  d.prepare(
    "INSERT INTO users(id,username,display_name,password_hash,role,disabled,created_at) VALUES(?,?,?,?,?,0,?)",
  ).run(
    id,
    username,
    (input.displayName || username).trim().slice(0, 60),
    input.password ? hashPassword(input.password) : null,
    input.role,
    Date.now(),
  );
  const result = getUser(id);
  if (!result) throw new Error("A mentett fiók nem olvasható.");
  if (input.role === "admin")
    d.prepare("INSERT OR IGNORE INTO family_meta(key,value) VALUES('owner',?)").run(id);
  return result;
}
function adminCount(exceptId?: string) {
  return Number(
    (
      accountDb()
        .prepare("SELECT count(*) c FROM users WHERE role='admin' AND disabled=0 AND id<>?")
        .get(exceptId ?? "") as any
    ).c,
  );
}
export function updateUser(
  id: string,
  patch: {
    displayName?: string;
    role?: Role;
    disabled?: boolean;
    permissions?: Partial<Record<Permission, boolean>>;
  },
) {
  const d = accountDb();
  const u = getUser(id);
  if (!u) throw new Error("Nincs ilyen felhasználó.");
  if (isOwner(id) && ((patch.role && patch.role !== "admin") || patch.disabled))
    throw new Error(
      "Legalább egy aktív adminnak maradnia kell; a tulajdonosi fiók nem tiltható le és nem fokozható le.",
    );
  const demoting = (patch.role && patch.role !== "admin") || patch.disabled;
  if (u.role === "admin" && demoting && adminCount(id) === 0)
    throw new Error("Legalább egy aktív adminnak maradnia kell.");
  if (patch.role && !ROLES.includes(patch.role)) throw new Error("Érvénytelen szerepkör.");
  d.prepare("UPDATE users SET display_name=?, role=?, disabled=? WHERE id=?").run(
    (patch.displayName ?? u.displayName).trim().slice(0, 60) || u.username,
    patch.role ?? u.role,
    (patch.disabled ?? u.disabled) ? 1 : 0,
    id,
  );
  if (patch.disabled) d.prepare("DELETE FROM sessions WHERE user_id=?").run(id);
  if (patch.permissions) {
    d.prepare("DELETE FROM permissions WHERE user_id=?").run(id);
    for (const [k, v] of Object.entries(patch.permissions))
      if ((PERMISSIONS as readonly string[]).includes(k) && typeof v === "boolean")
        d.prepare("INSERT INTO permissions(user_id,key,allowed) VALUES(?,?,?)").run(
          id,
          k,
          v ? 1 : 0,
        );
  }
  const result = getUser(id);
  if (!result) throw new Error("A mentett fiók nem olvasható.");
  return result;
}
export function deleteUser(id: string) {
  const u = getUser(id);
  if (!u) return;
  if (isOwner(id)) throw new Error("A tulajdonosi fiók nem törölhető.");
  if (u.role === "admin" && adminCount(id) === 0) throw new Error("Az utolsó admin nem törölhető.");
  accountDb().prepare("DELETE FROM users WHERE id=?").run(id);
}
/** One-time link for first password or reset; returns the raw token (only shown once to the admin). */
export function createInviteToken(userId: string, hours = 72): string {
  const t = token();
  const d = accountDb();
  d.prepare("DELETE FROM invites WHERE user_id=?").run(userId);
  d.prepare("INSERT INTO invites(token_hash,user_id,expires_at) VALUES(?,?,?)").run(
    sha(t),
    userId,
    Date.now() + hours * 3600_000,
  );
  return t;
}
export function inviteUser(t: string): User | null {
  const r = db()
    ?.prepare("SELECT user_id FROM invites WHERE token_hash=? AND expires_at>?")
    .get(sha(t), Date.now()) as any;
  return r ? getUser(r.user_id) : null;
}
export function acceptInvite(t: string, pw: string): string {
  const u = inviteUser(t);
  if (!u || u.disabled) throw new Error("A link lejárt vagy érvénytelen.");
  if (!validPassword(pw)) throw new Error("A jelszó legalább 8 karakter.");
  const d = accountDb();
  d.prepare("UPDATE users SET password_hash=? WHERE id=?").run(hashPassword(pw), u.id);
  d.prepare("DELETE FROM invites WHERE user_id=?").run(u.id);
  d.prepare("DELETE FROM sessions WHERE user_id=?").run(u.id);
  audit(u.id, "password-set");
  return createSession(u.id, "");
}

const sessionDays = () =>
  Math.min(365, Math.max(1, Number((globalThis as any).process?.env?.SESSION_DAYS) || 30));
export const sessionMaxAge = () => sessionDays() * 86400;
export function createSession(userId: string, ua: string): string {
  const t = token();
  const d = accountDb();
  const now = Date.now();
  d.prepare("DELETE FROM sessions WHERE expires_at<?").run(now);
  d.prepare(
    "INSERT INTO sessions(id_hash,user_id,expires_at,user_agent,created_at) VALUES(?,?,?,?,?)",
  ).run(sha(t), userId, now + sessionMaxAge() * 1000, ua.slice(0, 200), now);
  return t;
}
export function sessionUser(t: string | undefined): User | null {
  if (!t) return null;
  const d = db();
  if (!d) return null;
  const r = d
    .prepare(
      "SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id_hash=? AND s.expires_at>? AND u.disabled=0",
    )
    .get(sha(t), Date.now());
  return r ? rowToUser(r) : null;
}
export function endSession(t: string | undefined) {
  if (t) db()?.prepare("DELETE FROM sessions WHERE id_hash=?").run(sha(t));
}

// Brute-force protection: 5 failures per username+IP lock for 5 minutes (per process).
const attempts = new Map<string, { n: number; until: number }>();
export function login(
  username: string,
  pw: string,
  ip: string,
  ua: string,
): { token: string } | { error: string } {
  const key = normUser(username); // A changed forwarded IP must not bypass the account lock.
  const a = attempts.get(key);
  const now = Date.now();
  if (a && a.until > now) return { error: "Túl sok hibás próbálkozás. Várj 5 percet." };
  const r = accountDb()
    .prepare("SELECT * FROM users WHERE username=?")
    .get(normUser(username)) as any;
  if (!r || r.disabled || !verifyPassword(pw, r.password_hash)) {
    const n = (a && a.until <= now && a.n >= 5 ? 0 : (a?.n ?? 0)) + 1;
    if (attempts.size > 10000) attempts.delete(attempts.keys().next().value ?? "");
    attempts.set(key, { n, until: n >= 5 ? now + 300_000 : 0 });
    return { error: "Hibás felhasználónév vagy jelszó." };
  }
  attempts.delete(key);
  audit(r.id, "login");
  return { token: createSession(r.id, ua) };
}
export function userCan(u: User, p: Permission) {
  return can(u.role, p, u.permissions);
}

/** Server-function guard. Legacy mode (no family accounts yet) keeps the old open/shared-password behaviour. */
export function requirePermission(
  sessionToken: string | undefined,
  perm?: Permission,
): User | null {
  if (authStorageUnavailable())
    throw new Error("A fiókok tárolója nem elérhető. A belépés biztonsági okból szünetel.");
  if (db() === null || userCount() === 0) return null;
  const u = sessionUser(sessionToken);
  if (!u) throw new Error("Bejelentkezés szükséges.");
  if (perm && !userCan(u, perm)) throw new Error("Ehhez nincs jogosultságod. Kérd meg az admint.");
  return u;
}

// Daily snapshot of texbox.db in <data>/backups, keeping the newest 14 (Hyper Backup should also cover /data).
function snapshot(fs: typeof import("node:fs"), d: import("node:sqlite").DatabaseSync) {
  try {
    const dir = `${dataDir()}/backups`;
    fs.mkdirSync(dir, { recursive: true });
    const name = `texbox-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}.db`;
    if (!fs.existsSync(`${dir}/${name}`)) d.exec(`VACUUM INTO '${dir}/${name}'`);
    fs.readdirSync(dir)
      .filter((f) => /^texbox-\d{8}\.db$/.test(f))
      .sort()
      .slice(0, -14)
      .forEach((f) => fs.unlinkSync(`${dir}/${f}`));
  } catch (e) {
    console.error("texbox.db snapshot failed", (e as Error).message);
  }
}

export function isOwner(id: string) {
  const row = accountDb().prepare("SELECT value FROM family_meta WHERE key='owner'").get() as
    { value: string } | undefined;
  return row?.value === id;
}
export type ChildProfile = {
  id: string;
  displayName: string;
  icon: string;
  disabled: boolean;
  createdBy: string;
};
export function listChildProfiles(): ChildProfile[] {
  const rows = accountDb()
    .prepare("SELECT * FROM child_profiles ORDER BY created_at,id")
    .all() as unknown as {
    id: string;
    display_name: string;
    icon: string;
    disabled: number;
    created_by: string;
  }[];
  return rows.map((r) => ({
    id: r.id,
    displayName: r.display_name,
    icon: r.icon,
    disabled: !!r.disabled,
    createdBy: r.created_by,
  }));
}
export function createChildProfile(parent: User, name: string, icon = "child") {
  if (!userCan(parent, "family") || parent.role === "child")
    throw new Error("Csak szülő kezelhet gyermekprofilt.");
  const displayName = name.trim();
  if (!displayName || displayName.length > 60)
    throw new Error("A gyermek neve 1–60 karakter lehet.");
  if (!["child", "star", "cat"].includes(icon)) throw new Error("Érvénytelen profilikon.");
  const id = crypto().randomUUID();
  accountDb()
    .prepare(
      "INSERT INTO child_profiles(id,display_name,icon,created_by,created_at) VALUES(?,?,?,?,?)",
    )
    .run(id, displayName, icon, parent.id, Date.now());
  audit(parent.id, "child-create", id);
  return id;
}
export function updateChildProfile(
  parent: User,
  id: string,
  name: string,
  icon: string,
  disabled: boolean,
) {
  if (!userCan(parent, "family") || parent.role === "child")
    throw new Error("Csak szülő kezelhet gyermekprofilt.");
  if (!name.trim() || name.trim().length > 60 || !["child", "star", "cat"].includes(icon))
    throw new Error("Érvénytelen gyermekprofil.");
  const r = accountDb()
    .prepare("UPDATE child_profiles SET display_name=?,icon=?,disabled=? WHERE id=?")
    .run(name.trim(), icon, disabled ? 1 : 0, id);
  if (!r.changes) throw new Error("Nincs ilyen gyermekprofil.");
  audit(parent.id, "child-update", id);
}
export function revokeUserSessions(id: string) {
  accountDb().prepare("DELETE FROM sessions WHERE user_id=?").run(id);
}
export function familyAccountStatus(id: string) {
  const d = accountDb();
  const invite = d.prepare("SELECT expires_at FROM invites WHERE user_id=?").get(id) as
    { expires_at: number } | undefined;
  const sessions = d
    .prepare("SELECT count(*) count FROM sessions WHERE user_id=? AND expires_at>?")
    .get(id, Date.now()) as { count: number };
  return {
    owner: isOwner(id),
    inviteExpiresAt: invite?.expires_at ?? null,
    sessions: Number(sessions.count),
  };
}
