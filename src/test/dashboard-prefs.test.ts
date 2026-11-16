import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createUser,
  createChildProfile,
  createSession,
  resetAuthDb,
  db,
  type User,
} from "@/lib/auth.server";
import { getDashboard, saveDashboard } from "@/lib/dashboard.server";
import { normalizePrefs, moveCard, CARD_IDS } from "@/lib/dashboard-schema";
import { readFileSync } from "node:fs";
const context = vi.hoisted(() => ({ token: undefined as string | undefined }));
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
vi.mock("@tanstack/react-start/server", () => ({ getCookie: () => context.token }));
import { dashboardGet, dashboardSave } from "@/lib/dashboard.functions";

let dir: string, dad: User, mom: User, kid: User, profile: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "texbox-dash-"));
  process.env["DATA_DIR"] = dir;
  resetAuthDb();
  context.token = undefined;
  dad = createUser({ username: "apa", displayName: "Apa", role: "admin" });
  mom = createUser({ username: "anya", displayName: "Anya", role: "adult" });
  kid = createUser({ username: "bence", displayName: "Bence", role: "child" });
  profile = createChildProfile(mom, "Kicsi");
});
afterEach(() => {
  resetAuthDb();
  rmSync(dir, { force: true, recursive: true });
});
const order = ["points", "tasks", "home", "event", "shopping", "menu", "media"];

describe("6b personal dashboard", () => {
  it("snapshots before the additive table and starts unsaved with defaults", () => {
    expect(existsSync(join(dir, "backups/pre-dashboard-phase6b.db"))).toBe(true);
    const a = getDashboard(mom);
    expect(a).toMatchObject({ saved: false, version: 0, person: `user:${mom.id}` });
    expect(a.prefs.order).toEqual([...CARD_IDS]);
    expect(getDashboard(kid).prefs.order[0]).toBe("tasks");
  });
  it("keeps user A and B independent and persists across restart", () => {
    saveDashboard(mom, { version: 0, prefs: { order, hidden: ["media"], scenes: [] } });
    saveDashboard(dad, {
      version: 0,
      prefs: { order: ["media"], hidden: ["shopping"], scenes: [] },
    });
    resetAuthDb();
    const a = getDashboard(mom),
      b = getDashboard(dad);
    expect(a.prefs.order.slice(0, 2)).toEqual(["points", "tasks"]);
    expect(a.prefs.hidden).toEqual(["media"]);
    expect(b.prefs.order[0]).toBe("media");
    expect(b.prefs.hidden).toEqual(["shopping"]);
    expect(a.version).toBe(1);
  });
  it("refuses stale versions (second device) instead of silently overwriting", () => {
    saveDashboard(mom, { version: 0, prefs: { order, hidden: [], scenes: [] } });
    expect(() =>
      saveDashboard(mom, { version: 0, prefs: { order: [], hidden: ["tasks"], scenes: [] } }),
    ).toThrow("másik eszközön");
    expect(getDashboard(mom).prefs.hidden).toEqual([]);
  });
  it("filters unknown cards, duplicates and unknown scene IDs", () => {
    saveDashboard(mom, {
      version: 0,
      prefs: { order: ["x", "tasks", "tasks", "<script>"], hidden: ["nope"], scenes: ["ghost"] },
    });
    const p = getDashboard(mom).prefs;
    expect(p.order[0]).toBe("tasks");
    expect(new Set(p.order).size).toBe(p.order.length);
    expect(p.hidden).toEqual([]);
    expect(p.scenes).toEqual([]);
  });
  it("parents manage managed child profiles; children and others cannot", () => {
    const key = `profile:${profile}`;
    saveDashboard(dad, { person: key, version: 0, prefs: { order, hidden: [], scenes: [] } });
    expect(getDashboard(mom, key).prefs.order[0]).toBe("points");
    expect(getDashboard(mom, key).allowed).not.toContain("media");
    expect(() => getDashboard(kid, key)).toThrow("jogosultság");
    expect(() => getDashboard(mom, `user:${dad.id}`)).toThrow("jogosultság");
    expect(() => saveDashboard(kid, { person: `user:${mom.id}`, version: 0, prefs: null })).toThrow(
      "jogosultság",
    );
  });
  it("child login without media permission cannot enable the media card", () => {
    saveDashboard(kid, {
      version: 0,
      prefs: { order: ["media", "tasks"], hidden: [], scenes: [] },
    });
    expect(getDashboard(kid).prefs.order).not.toContain("media");
  });
  it("reset restores defaults with a new version and keeps shared household prefs", async () => {
    const state = () =>
      existsSync(join(dir, "nas-state.json"))
        ? readFileSync(join(dir, "nas-state.json"), "utf8")
        : null;
    const before = state();
    saveDashboard(mom, { version: 0, prefs: { order, hidden: ["tasks"], scenes: [] } });
    const r = saveDashboard(mom, { version: 1, prefs: null, reset: true });
    expect(r.version).toBe(2);
    expect(r.prefs.hidden).toEqual([]);
    expect(state()).toBe(before);
    expect(
      (
        db()!.prepare("SELECT count(*) c FROM audit_log WHERE action LIKE 'dashboard.%'").get() as {
          c: number;
        }
      ).c,
    ).toBe(2);
  });
  it("RPC rejects signed-out calls and works for a session", async () => {
    await expect(dashboardGet({ data: {} })).rejects.toThrow("Bejelentkezés");
    await expect(
      dashboardSave({ data: { version: 0, prefs: { order: [], hidden: [], scenes: [] } } }),
    ).rejects.toThrow("Bejelentkezés");
    context.token = createSession(mom.id, "t");
    await dashboardSave({ data: { version: 0, prefs: { order, hidden: [], scenes: [] } } });
    context.token = createSession(mom.id, "phone");
    expect((await dashboardGet({ data: {} })).prefs.order[0]).toBe("points");
  });
  it("schema helpers", () => {
    expect(normalizePrefs(null, "adult").order).toEqual([...CARD_IDS]);
    expect(moveCard(["home", "tasks"], "tasks", -1)).toEqual(["tasks", "home"]);
    expect(moveCard(["home", "tasks"], "home", -1)).toEqual(["home", "tasks"]);
  });
});
