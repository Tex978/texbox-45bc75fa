import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createUser,
  createSession,
  resetAuthDb,
  db,
  updateUser,
  type User,
} from "@/lib/auth.server";
import { saveScene, deleteScene, listScenes, setDeviceAcl } from "@/lib/scenes.server";
import {
  acquireLease,
  listSchedules,
  saveSchedule,
  setScheduleEnabled,
  tick,
  LEASE_MS,
} from "@/lib/schedules.server";
import { budapestInstant, nextDue, type ScheduleInput } from "@/lib/schedule-schema";
import type { DeviceCapability, SceneInput } from "@/lib/scene-schema";
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
import { schedulesList, scheduleSave, scheduleToggle } from "@/lib/schedules.functions";

const devices: DeviceCapability[] = [
  { key: "gree:192.168.1.2", name: "Klíma", online: true, actions: ["power", "temperature"] },
];
const scene = (): SceneInput => ({
  name: "Reggel",
  icon: "sun",
  color: "primary",
  visibility: "family",
  allowedUsers: [],
  steps: [{ device: "gree:192.168.1.2", action: "power", value: "on" }],
});
const rule = (p: Partial<ScheduleInput> = {}): ScheduleInput => ({
  title: "Hétköznap reggel",
  sceneId: "",
  time: "07:00",
  recurrence: "daily",
  weekdays: [],
  everyWeeks: 1,
  date: null,
  startDate: "2026-01-01",
  ...p,
});
// 2026-11-16 (Monday) 07:00 Budapest = 06:00Z
const T = Date.UTC(2026, 10, 16, 6, 0, 30);
let dir: string, mom: User, dad: User, kid: User, sceneId: string;
const exec = vi.fn(async () => {});
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "texbox-sched-"));
  process.env["DATA_DIR"] = dir;
  resetAuthDb();
  exec.mockClear();
  context.token = undefined;
  dad = createUser({ username: "apa", displayName: "Apa", role: "admin" });
  mom = createUser({ username: "anya", displayName: "Anya", role: "adult" });
  kid = createUser({ username: "bence", displayName: "Bence", role: "child" });
  sceneId = saveScene(mom, scene(), devices).id;
});
afterEach(() => {
  resetAuthDb();
  rmSync(dir, { recursive: true, force: true });
});
function enabled(p: Partial<ScheduleInput> = {}, at = T - 3600_000) {
  const id = saveSchedule(mom, rule({ sceneId, ...p }));
  acquireLease("w1", at);
  const r = listSchedules(mom).find((x) => x.id === id)!;
  setScheduleEnabled(
    mom,
    { id, version: r.version, enabled: true, confirmSceneVersion: r.sceneVersion! },
    at,
  );
  return id;
}
const runs = () =>
  db()!.prepare("SELECT rule_id,slot,status FROM schedule_runs").all() as {
    slot: string;
    status: string;
  }[];

describe("2b/1 timed scenes", () => {
  it("snapshots before the additive tables; new rules start disabled", () => {
    expect(existsSync(join(dir, "backups/pre-automation-phase2b.db"))).toBe(true);
    const id = saveSchedule(mom, rule({ sceneId }));
    expect(listSchedules(mom).find((r) => r.id === id)?.enabled).toBe(false);
    expect(listScenes(mom)).toHaveLength(1);
  });
  it("runs a due slot exactly once, even with concurrent workers and restarts", async () => {
    enabled();
    const [a, b] = await Promise.all([tick("w1", exec, T), tick("w2", exec, T)]);
    expect(a.ran + b.ran).toBe(1);
    expect(exec).toHaveBeenCalledTimes(1);
    resetAuthDb();
    await tick("w1", exec, T + 1000);
    expect(exec).toHaveBeenCalledTimes(1);
    expect(runs()).toEqual([
      expect.objectContaining({ slot: "2026-11-16T07:00", status: "accepted" }),
    ]);
  });
  it("does not catch up missed slots and never repeats an interrupted claim", async () => {
    enabled();
    await tick("w1", exec, T + 2 * 3600_000);
    expect(exec).not.toHaveBeenCalled();
    expect(runs()[0]?.status).toBe("missed");
    db()!
      .prepare(
        "INSERT INTO schedule_runs(rule_id,slot,due_at,status,worker,at) SELECT id,'2026-11-17T07:00',0,'claimed','dead',0 FROM scene_schedules",
      )
      .run();
    await tick("w1", exec, T + 86400_000);
    expect(exec).not.toHaveBeenCalled();
    expect(runs().find((r) => r.slot === "2026-11-17T07:00")?.status).toBe("interrupted");
  });
  it("lease keeps a second live process from running", async () => {
    enabled();
    expect(acquireLease("w1", T)).toBe(true);
    expect((await tick("w2", exec, T)).leader).toBe(false);
    expect(acquireLease("w2", T + LEASE_MS + 1)).toBe(true);
  });
  it("weekdays, weekly rhythm and once", () => {
    const wd = rule({ recurrence: "weekdays", weekdays: [6] });
    expect(nextDue(wd, T)?.slot).toBe("2026-11-21T07:00");
    const wk = rule({
      recurrence: "weekly",
      weekdays: [1],
      everyWeeks: 2,
      startDate: "2026-11-09",
    });
    expect(nextDue(wk, T)?.slot).toBe("2026-11-23T07:00");
    expect(nextDue(rule({ recurrence: "once", date: "2026-11-15" }), T)).toBeNull();
  });
  it("Budapest DST: spring gap skipped, autumn repeat only first", () => {
    expect(budapestInstant("2026-03-29", "02:30")).toBeNull();
    expect(budapestInstant("2026-10-25", "02:30")).toBe(Date.UTC(2026, 9, 25, 0, 30));
    expect(budapestInstant("2026-07-01", "07:00")).toBe(Date.UTC(2026, 6, 1, 5, 0));
    const r = rule({ time: "02:30" });
    expect(nextDue(r, Date.UTC(2026, 2, 28, 12))?.slot).toBe("2026-03-30T02:30");
  });
  it("autumn repeated hour runs once", async () => {
    enabled({ time: "02:30" }, Date.UTC(2026, 9, 24, 12));
    await tick("w1", exec, Date.UTC(2026, 9, 25, 0, 31));
    await tick("w1", exec, Date.UTC(2026, 9, 25, 1, 31));
    expect(exec).toHaveBeenCalledTimes(1);
  });
  it("deleted or changed scene stops the rule with a clear error", async () => {
    const id = enabled();
    saveScene(mom, { ...listScenes(mom)[0]!, name: "Új" }, devices);
    await tick("w1", exec, T);
    expect(exec).not.toHaveBeenCalled();
    const r = listSchedules(mom).find((x) => x.id === id)!;
    expect(r).toMatchObject({ enabled: false, lastStatus: "blocked" });
    expect(r.lastMessage).toMatch(/megváltozott/);
    const id2 = enabled({ title: "Másik" }, T);
    deleteScene(mom, sceneId);
    await tick("w1", exec, T + 86400_000);
    expect(listSchedules(mom).find((x) => x.id === id2)?.lastMessage).toMatch(/törölték/);
  });
  it("disabled user or revoked device access blocks the run", async () => {
    enabled();
    setDeviceAcl(dad, mom.id, devices[0]!.key, false);
    await tick("w1", exec, T);
    expect(exec).not.toHaveBeenCalled();
    expect(runs()[0]?.status).toBe("blocked");
    setDeviceAcl(dad, mom.id, devices[0]!.key, true);
    enabled({ title: "B" }, T);
    updateUser(mom.id, { disabled: true });
    await tick("w1", exec, T + 86400_000);
    expect(exec).not.toHaveBeenCalled();
  });
  it("mid-run revocation fails the step via reauthorize", async () => {
    enabled();
    const midExec = vi.fn(async (_s: unknown, re: () => void) => {
      setDeviceAcl(dad, mom.id, devices[0]!.key, false);
      re();
    });
    await tick("w1", midExec, T);
    expect(runs()[0]?.status).toBe("failed");
  });
  it("children cannot create; enabling needs a live scheduler and confirmed scene version", () => {
    expect(() => saveSchedule(kid, rule({ sceneId }))).toThrow("felnőtt");
    const id = saveSchedule(mom, rule({ sceneId }));
    const r = listSchedules(mom)[0]!;
    expect(() =>
      setScheduleEnabled(
        mom,
        { id, version: r.version, enabled: true, confirmSceneVersion: r.sceneVersion! },
        T,
      ),
    ).toThrow("nem fut");
    acquireLease("w1", T);
    expect(() =>
      setScheduleEnabled(
        mom,
        { id, version: r.version, enabled: true, confirmSceneVersion: 99 },
        T,
      ),
    ).toThrow("változott");
    expect(() =>
      setScheduleEnabled(
        dad,
        { id, version: r.version, enabled: true, confirmSceneVersion: r.sceneVersion! },
        T,
      ),
    ).toThrow("saját");
    expect(listSchedules(kid)).toEqual([]);
  });
  it("RPC requires a session", async () => {
    await expect(schedulesList()).rejects.toThrow("Bejelentkezés");
    context.token = createSession(kid.id, "t");
    await expect(scheduleSave({ data: rule({ sceneId }) })).rejects.toThrow("felnőtt");
    await expect(
      scheduleToggle({ data: { id: "x", version: 1, enabled: true } }),
    ).rejects.toThrow();
    context.token = createSession(mom.id, "t");
    expect((await schedulesList()).canCreate).toBe(true);
  });
});
