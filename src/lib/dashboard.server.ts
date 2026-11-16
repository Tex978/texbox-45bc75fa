import { db, getUser, listChildProfiles, userCan, type User } from "./auth.server";
import { listScenes } from "./scenes.server";
import { CARD_IDS, normalizePrefs, type CardId, type DashKind } from "./dashboard-schema";

// Personal dashboard preferences: one row per user:<id> or profile:<id>; never the shared household store.
const store = () => {
  const d = db();
  if (!d)
    throw new Error(
      "A személyes főoldal csak a saját Synology NAS-on mentődik; az előnézet nem ment beállítást.",
    );
  return d;
};
function current(u: User) {
  const v = getUser(u.id);
  if (!v || v.disabled) throw new Error("Bejelentkezés szükséges.");
  return v;
}
const isParent = (u: User) => u.role !== "child" && userCan(u, "family");
type Target = { key: string; name: string; kind: DashKind; user: User | null };
function targets(u: User): Target[] {
  const self: Target = {
    key: `user:${u.id}`,
    name: u.displayName,
    kind: u.role === "child" ? "child" : "adult",
    user: u,
  };
  if (!isParent(u)) return [self];
  return [
    self,
    ...listChildProfiles()
      .filter((p) => !p.disabled)
      .map((p) => ({ key: `profile:${p.id}`, name: p.displayName, kind: "child" as const, user: null })),
  ];
}
function target(u: User, key?: string) {
  const t = targets(u).find((x) => x.key === (key ?? `user:${u.id}`));
  if (!t) throw new Error("Ehhez a főoldalhoz nincs jogosultságod.");
  return t;
}
/** Cards a person may see: media needs a media permission for child logins; managed profiles never get media. */
function allowedCards(t: Target): CardId[] {
  return CARD_IDS.filter((c) => {
    if (c !== "media") return true;
    if (!t.user) return false;
    return t.user.role !== "child" || userCan(t.user, "request") || userCan(t.user, "downloads");
  });
}
const sceneIds = (t: Target) => (t.user ? listScenes(t.user).map((s) => s.id) : []);
type Row = { body: string; version: number; updated_at: number };
export function getDashboard(user: User, key?: string) {
  const u = current(user);
  const t = target(u, key);
  const row = store()
    .prepare("SELECT body,version,updated_at FROM dashboard_prefs WHERE person_key=?")
    .get(t.key) as Row | undefined;
  let raw: unknown = null;
  try {
    raw = row ? JSON.parse(row.body) : null;
  } catch {
    raw = null;
  }
  return {
    person: t.key,
    kind: t.kind,
    saved: !!row,
    version: row?.version ?? 0,
    updatedAt: row?.updated_at ?? null,
    allowed: allowedCards(t),
    prefs: normalizePrefs(raw, t.kind, allowedCards(t), sceneIds(t)),
    targets: targets(u).map(({ key, name, kind }) => ({ key, name, kind })),
  };
}
/** Optimistic concurrency: version 0 creates, otherwise it must equal the stored version. */
export function saveDashboard(
  user: User,
  input: { person?: string; version: number; prefs: unknown; reset?: boolean },
) {
  const u = current(user);
  const t = target(u, input.person);
  const prefs = normalizePrefs(input.reset ? null : input.prefs, t.kind, allowedCards(t), sceneIds(t));
  const d = store();
  d.exec("BEGIN IMMEDIATE");
  try {
    const row = d
      .prepare("SELECT version FROM dashboard_prefs WHERE person_key=?")
      .get(t.key) as { version: number } | undefined;
    if ((row?.version ?? 0) !== input.version)
      throw new Error(
        "A főoldalt közben egy másik eszközön módosították. Töltsd újra, és próbáld meg ismét.",
      );
    const version = input.version + 1,
      now = Date.now();
    d.prepare(
      `INSERT INTO dashboard_prefs(person_key,body,version,updated_by,updated_at) VALUES(?,?,?,?,?)
       ON CONFLICT(person_key) DO UPDATE SET body=excluded.body,version=excluded.version,updated_by=excluded.updated_by,updated_at=excluded.updated_at`,
    ).run(t.key, JSON.stringify(prefs), version, u.id, now);
    d.prepare("INSERT INTO audit_log(user_id,action,target,at) VALUES(?,?,?,?)").run(
      u.id,
      input.reset ? "dashboard.reset" : "dashboard.save",
      t.key,
      now,
    );
    d.exec("COMMIT");
    return { version, prefs };
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
}
