import { beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createInviteToken,
  acceptInvite,
  createSession,
  createUser,
  db,
  getUser,
  listOwnSessions,
  login,
  resetAuthDb,
  sessionUser,
  updateUser,
  type User,
} from "@/lib/auth.server";
import { describeUserAgent, passwordProblem } from "@/lib/profile-schema";

const ctx = vi.hoisted(() => ({ token: undefined as string | undefined }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    inputValidator(v: (x: unknown) => unknown) {
      this.v = v;
      return this;
    },
    v: (x: unknown) => x,
    handler(fn: (a: { data: unknown }) => unknown) {
      const v = this.v;
      return (a?: { data: unknown }) => fn({ data: v(a?.data) });
    },
  }),
}));
vi.mock("@tanstack/react-start/server", () => ({
  getCookie: () => ctx.token,
  getRequest: () => new Request("http://nas.local/"),
}));
import {
  auditList,
  familyUpdate,
  getMe,
  passwordChange,
  profileGet,
  profileUpdate,
  sessionRevoke,
  sessionsList,
  sessionsRevokeOthers,
} from "@/lib/auth.functions";

const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel) AppleWebKit Chrome/120 Mobile Safari/537.36";
const PC = "Mozilla/5.0 (Windows NT 10.0) AppleWebKit Chrome/120 Safari/537.36 Edg/120";
let dir: string, owner: User, anna: User, kid: User;
const tok = (u: string, pw: string, ua: string) => {
  const r = login(u, pw, "lan", ua);
  if (!("token" in r)) throw new Error(r.error);
  return r.token;
};
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "texbox-1b-"));
  process.env["DATA_DIR"] = dir;
  resetAuthDb();
  owner = createUser({ username: "apa", displayName: "Apa", role: "admin", password: "jelszo123" });
  anna = createUser({ username: "anna", displayName: "Anna", role: "adult", password: "jelszo123" });
  kid = createUser({ username: "bence", displayName: "Bence", role: "child", password: "jelszo123" });
  ctx.token = undefined;
});

describe("1b own profile", () => {
  it("creates the pre-profile snapshot and keeps old password hashes and sessions", () => {
    const before = (db()!.prepare("SELECT password_hash FROM users WHERE id=?").get(owner.id) as { password_hash: string }).password_hash;
    const t = tok("apa", "jelszo123", PC);
    resetAuthDb();
    expect(existsSync(join(dir, "backups", "pre-profile-phase1b.db"))).toBe(true);
    expect((db()!.prepare("SELECT password_hash FROM users WHERE id=?").get(owner.id) as { password_hash: string }).password_hash).toBe(before);
    expect(sessionUser(t)?.id).toBe(owner.id);
    expect(getUser(owner.id)?.avatar).toEqual({ icon: "initials", color: "c1" });
  });
  it("saves name/avatar for the caller only, visible from a second browser and after restart", async () => {
    const pc = tok("anna", "jelszo123", PC), phone = tok("anna", "jelszo123", ANDROID);
    ctx.token = pc;
    const p = await profileGet();
    await profileUpdate({ data: { displayName: "Anna Néni", icon: "cat", color: "c4", version: p.version } });
    resetAuthDb();
    ctx.token = phone;
    const me = await getMe();
    expect(me.user?.displayName).toBe("Anna Néni");
    expect(me.user?.avatar).toEqual({ icon: "cat", color: "c4" });
    expect(getUser(owner.id)?.displayName).toBe("Apa");
  });
  it("rejects stale versions, bad icons and works only with a session", async () => {
    ctx.token = tok("anna", "jelszo123", PC);
    await profileUpdate({ data: { displayName: "A", icon: "sun", color: "c2", version: 0 } });
    await expect(profileUpdate({ data: { displayName: "B", icon: "sun", color: "c2", version: 0 } })).rejects.toThrow("másik eszközön");
    await expect(profileUpdate({ data: { displayName: "B", icon: "<script>", color: "c2", version: 1 } })).rejects.toThrow("Érvénytelen");
    ctx.token = undefined;
    await expect(profileGet()).rejects.toThrow("Bejelentkezés");
    ctx.token = "forged";
    await expect(sessionsList()).rejects.toThrow("Bejelentkezés");
  });
  it("child login edits only itself and cannot raise its own permissions", async () => {
    ctx.token = tok("bence", "jelszo123", ANDROID);
    await profileUpdate({ data: { displayName: "Bence", icon: "rocket", color: "c3", version: 0 } });
    await expect(familyUpdate({ data: { id: kid.id, permissions: { users: true, settings: true } } })).rejects.toThrow();
    await expect(auditList({ data: { scope: "family" } })).rejects.toThrow();
    ctx.token = tok("anna", "jelszo123", PC);
    await expect(familyUpdate({ data: { id: anna.id, role: "admin" } })).rejects.toThrow();
    expect(getUser(anna.id)?.role).toBe("adult");
  });
});

describe("1b password", () => {
  it("requires the current password, validates strength and can sign out other devices", async () => {
    const pc = tok("anna", "jelszo123", PC), phone = tok("anna", "jelszo123", ANDROID);
    const other = tok("apa", "jelszo123", PC);
    ctx.token = pc;
    await expect(passwordChange({ data: { current: "rossz", next: "Uj-Jelszo-2026", signOutOthers: true } })).rejects.toThrow("jelenlegi");
    await expect(passwordChange({ data: { current: "jelszo123", next: "rovid", signOutOthers: true } })).rejects.toThrow("10");
    await expect(passwordChange({ data: { current: "jelszo123", next: "annaanna2026", signOutOthers: true } })).rejects.toThrow("nevedet");
    const r = await passwordChange({ data: { current: "jelszo123", next: "Kek-Hegy-2026", signOutOthers: true } });
    expect(r.signedOut).toBe(1);
    expect(sessionUser(pc)?.id).toBe(anna.id);
    expect(sessionUser(phone)).toBeNull();
    expect(sessionUser(other)?.id).toBe(owner.id);
    expect("token" in login("anna", "Kek-Hegy-2026", "lan", PC)).toBe(true);
    expect("token" in login("anna", "jelszo123", "lan", PC)).toBe(false);
  });
  it("locks after 5 wrong current passwords", async () => {
    ctx.token = tok("anna", "jelszo123", PC);
    for (let i = 0; i < 5; i++)
      await expect(passwordChange({ data: { current: "x", next: "Kek-Hegy-2026", signOutOthers: false } })).rejects.toThrow();
    await expect(passwordChange({ data: { current: "jelszo123", next: "Kek-Hegy-2026", signOutOthers: false } })).rejects.toThrow("Túl sok");
  });
  it("invite/reset links keep working unchanged", () => {
    const u = createUser({ username: "nagyi", displayName: "Nagyi", role: "adult" });
    const t = acceptInvite(createInviteToken(u.id), "jelszo123");
    expect(sessionUser(t)?.id).toBe(u.id);
  });
  it("rule helper", () => {
    expect(passwordProblem("aaaaaaaaaaaa")).toBeTruthy();
    expect(passwordProblem("Kek-Hegy-2026")).toBeNull();
  });
});

describe("1b sessions", () => {
  it("lists only own sessions with plain device labels and no hashes", async () => {
    const pc = tok("anna", "jelszo123", PC);
    tok("anna", "jelszo123", ANDROID);
    tok("apa", "jelszo123", PC);
    ctx.token = pc;
    const list = await sessionsList();
    expect(list).toHaveLength(2);
    expect(list.filter((s) => s.current)).toHaveLength(1);
    expect(list.map((s) => s.device).sort()).toEqual(["Chrome · Android (telefon)", "Edge · Windows (számítógép)"]);
    const hashes = (db()!.prepare("SELECT id_hash FROM sessions").all() as { id_hash: string }[]).map((r) => r.id_hash);
    for (const s of list) expect(hashes).not.toContain(s.id);
    expect(JSON.stringify(list)).not.toContain("Mozilla");
  });
  it("revokes a single other device immediately, protects the current one and others' sessions", async () => {
    const pc = tok("anna", "jelszo123", PC), phone = tok("anna", "jelszo123", ANDROID);
    const apa = tok("apa", "jelszo123", PC);
    ctx.token = apa;
    const apaSession = (await sessionsList())[0]!;
    ctx.token = pc;
    const list = await sessionsList();
    const cur = list.find((s) => s.current)!, other = list.find((s) => !s.current)!;
    await expect(sessionRevoke({ data: { id: cur.id } })).rejects.toThrow("jelenlegi");
    await expect(sessionRevoke({ data: { id: apaSession.id } })).rejects.toThrow();
    expect(sessionUser(apa)?.id).toBe(owner.id);
    await sessionRevoke({ data: { id: other.id } });
    expect(sessionUser(phone)).toBeNull();
    expect(sessionUser(pc)?.id).toBe(anna.id);
  });
  it("signs out every other own device", async () => {
    const pc = tok("anna", "jelszo123", PC);
    tok("anna", "jelszo123", ANDROID);
    tok("anna", "jelszo123", ANDROID);
    ctx.token = pc;
    expect((await sessionsRevokeOthers()).count).toBe(2);
    expect(listOwnSessions(anna.id, pc)).toHaveLength(1);
  });
  it("disabled accounts lose sessions; owner/last admin guards stay", () => {
    const t = createSession(anna.id, PC);
    updateUser(anna.id, { disabled: true });
    expect(sessionUser(t)).toBeNull();
    expect(() => updateUser(owner.id, { role: "adult" })).toThrow();
    expect(() => updateUser(owner.id, { disabled: true })).toThrow();
  });
  it("ua labels", () => {
    expect(describeUserAgent("")).toBe("Ismeretlen eszköz");
  });
});

describe("1b audit", () => {
  it("shows own events to everyone, family events only to admins, never raw secrets", async () => {
    ctx.token = tok("anna", "jelszo123", PC);
    await passwordChange({ data: { current: "jelszo123", next: "Kek-Hegy-2026", signOutOthers: false } });
    const mine = await auditList({ data: { scope: "me" } });
    expect(mine.map((a) => a.action)).toContain("password-change");
    expect(mine.every((a) => a.actor === "Anna" || a.target === "Anna")).toBe(true);
    await expect(auditList({ data: { scope: "family" } })).rejects.toThrow("admin");
    ctx.token = tok("apa", "jelszo123", PC);
    const fam = await auditList({ data: { scope: "family" } });
    expect(fam.some((a) => a.actor === "Anna" && a.action === "password-change")).toBe(true);
    expect(JSON.stringify(fam)).not.toMatch(/scrypt|Kek-Hegy/);
  });
});
