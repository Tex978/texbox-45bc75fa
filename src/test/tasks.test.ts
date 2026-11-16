import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createUser,
  createChildProfile,
  createSession,
  sessionUser,
  resetAuthDb,
  updateUser,
  db,
  type User,
} from "@/lib/auth.server";
import { saveTask, listTasks, actOnTask, archiveTask } from "@/lib/tasks.server";
import { taskSchema, occursOn, budapestToday, type TaskInput } from "@/lib/task-schema";
let dir: string, dad: User, mom: User, child: User, profile: string;
function first<T>(items: T[]): T {
  const item = items[0];
  if (!item) throw new Error("Missing expected test row");
  return item;
}
const now = new Date("2026-03-28T12:00:00Z");
const input = (patch: Partial<TaskInput> = {}): TaskInput => ({
  title: "Rendrakás",
  description: "",
  category: "Otthon",
  points: 10,
  visibility: "family",
  assignee: null,
  start: "2026-03-28",
  end: null,
  time: "18:00",
  priority: "normal",
  reminder: false,
  recurrence: "once",
  weekdays: [],
  dates: [],
  ...patch,
});
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "texbox-tasks-"));
  process.env["DATA_DIR"] = dir;
  resetAuthDb();
  dad = createUser({ username: "apa", displayName: "Apa", role: "admin" });
  mom = createUser({ username: "anya", displayName: "Anya", role: "adult" });
  child = createUser({ username: "bence", displayName: "Bence", role: "child" });
  profile = createChildProfile(mom, "Kicsi");
});
afterEach(() => {
  resetAuthDb();
  rmSync(dir, { force: true, recursive: true });
});
describe("family tasks on real isolated SQLite", () => {
  it("backs up before additive tables and preserves accounts/session/task across restart", () => {
    const token = createSession(dad.id, "test");
    const id = saveTask(mom, input());
    expect(existsSync(join(dir, "backups/pre-tasks-phase3.db"))).toBe(true);
    resetAuthDb();
    expect(sessionUser(token)?.id).toBe(dad.id);
    expect(first(listTasks(mom, now).templates)?.id).toBe(id);
  });
  it("CRUD revision prevents overwrite and archive retains audit and history", () => {
    const id = saveTask(dad, input());
    const t = first(listTasks(dad, now).templates);
    saveTask(mom, { ...t, title: "Új név" });
    expect(() => saveTask(dad, { ...t, title: "Elavult" })).toThrow("közben");
    const latest = first(listTasks(dad, now).templates);
    archiveTask(mom, id, latest.version);
    expect(first(listTasks(dad, now).occurrences).status).toBe("cancelled");
    expect(first(listTasks(dad, now).occurrences).events).toHaveLength(1);
  });
  it("personal task is not exposed to unrelated adults or children", () => {
    saveTask(dad, input({ visibility: "personal", assignee: `user:${dad.id}` }));
    expect(listTasks(mom, now).occurrences).toHaveLength(0);
    expect(listTasks(child, now).templates).toHaveLength(0);
  });
  it("children cannot change templates or points even with family override", () => {
    updateUser(child.id, { permissions: { family: true } });
    expect(() => saveTask(child, input({ points: 100000 }))).toThrow("szülő");
    expect(taskSchema.safeParse(input({ points: -1 })).success).toBe(false);
    expect(taskSchema.safeParse(input({ points: 1.5 })).success).toBe(false);
  });
  it("unknown household person is rejected", () => {
    expect(() => saveTask(dad, input({ assignee: "profile:other-family" }))).toThrow("Ismeretlen");
  });
  it("daily recurrence appears automatically across DST and repeated reads never duplicate", () => {
    saveTask(dad, input({ recurrence: "daily" }));
    listTasks(dad, now);
    const rows = listTasks(dad, new Date("2026-03-30T12:00Z")).occurrences;
    expect(rows.filter((o) => o.date === "2026-03-29")).toHaveLength(1);
    expect(rows.some((o) => o.date === "2026-03-30")).toBe(true);
    expect(new Set(rows.map((o) => o.date)).size).toBe(rows.length);
  });
  it("preserves overdue occurrences and bounded horizon", () => {
    saveTask(dad, input({ recurrence: "daily" }));
    const result = listTasks(dad, new Date("2026-04-02T12:00Z"));
    expect(first(result.occurrences).date).toBe("2026-03-28");
    expect(result.occurrences.at(-1)?.date).toBe("2026-04-09");
  });
  it("parallel claim and double click have only one winner", async () => {
    saveTask(dad, input());
    const o = first(listTasks(dad, now).occurrences);
    const results = await Promise.allSettled(
      [dad, mom].map((u) =>
        Promise.resolve().then(() =>
          actOnTask(u, { id: o.id, version: o.version, action: "claim" }),
        ),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(first(listTasks(dad, now).occurrences).events).toHaveLength(1);
  });
  it("adult completion auto approves but does not create a point ledger", () => {
    saveTask(mom, input({ assignee: `user:${mom.id}` }));
    const o = first(listTasks(mom, now).occurrences);
    expect(actOnTask(mom, { id: o.id, version: o.version, action: "complete" }).status).toBe(
      "approved",
    );
    expect(db()?.prepare("SELECT points FROM task_approvals").get()).toMatchObject({ points: 10 });
    expect(
      db()?.prepare("SELECT 1 FROM sqlite_master WHERE name='point_ledger'").get(),
    ).toBeUndefined();
    expect(() => actOnTask(mom, { id: o.id, version: o.version, action: "complete" })).toThrow();
  });
  it("managed child completion by parent needs either parent's single approval", async () => {
    saveTask(dad, input({ assignee: `profile:${profile}` }));
    const o = first(listTasks(dad, now).occurrences);
    const pending = actOnTask(mom, { id: o.id, version: o.version, action: "complete" });
    expect(pending.status).toBe("pending");
    const outcomes = await Promise.allSettled(
      [dad, mom].map((u) =>
        Promise.resolve().then(() =>
          actOnTask(u, { id: o.id, version: pending.version, action: "approve" }),
        ),
      ),
    );
    expect(outcomes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(db()?.prepare("SELECT count(*) n FROM task_approvals").get()).toMatchObject({ n: 1 });
  });
  it("legacy child login can submit but not approve, return needs reason and resubmission works", () => {
    saveTask(dad, input({ assignee: `user:${child.id}` }));
    const o = first(listTasks(child, now).occurrences);
    const pending = actOnTask(child, { id: o.id, version: o.version, action: "complete" });
    expect(() =>
      actOnTask(child, { id: o.id, version: pending.version, action: "approve" }),
    ).toThrow("szülő");
    expect(() => actOnTask(mom, { id: o.id, version: pending.version, action: "return" })).toThrow(
      "indok",
    );
    const returned = actOnTask(mom, {
      id: o.id,
      version: pending.version,
      action: "return",
      reason: "A játékokat is tedd el",
    });
    const retry = actOnTask(child, { id: o.id, version: returned.version, action: "complete" });
    const rejected = actOnTask(dad, {
      id: o.id,
      version: retry.version,
      action: "reject",
      reason: "Nem készült el",
    });
    expect(rejected.status).toBe("rejected");
    expect(rejected.events).toHaveLength(4);
  });
  it("child cannot complete someone else's assigned family task", () => {
    saveTask(dad, input({ assignee: `user:${mom.id}` }));
    const o = first(listTasks(dad, now).occurrences);
    expect(() => actOnTask(child, { id: o.id, version: o.version, action: "complete" })).toThrow();
  });
});
describe("Budapest civil recurrence", () => {
  it("SQLite generates weekly and monthly occurrences exactly once after reopening", () => {
    const weekly = saveTask(
      dad,
      input({ start: "2026-02-01", recurrence: "weekly", weekdays: [1] }),
    );
    const monthly = saveTask(dad, input({ start: "2026-01-31", recurrence: "monthly" }));
    listTasks(dad, new Date("2026-03-01T12:00Z"));
    resetAuthDb();
    const result = listTasks(dad, new Date("2026-03-01T12:00Z"));
    expect(
      result.occurrences.filter((o) => o.templateId === monthly && o.date === "2026-02-28"),
    ).toHaveLength(1);
    expect(
      result.occurrences.filter((o) => o.templateId === weekly && o.date === "2026-03-02"),
    ).toHaveLength(1);
    expect(
      result.occurrences.filter((o) => o.templateId === weekly && o.date === "2026-03-03"),
    ).toHaveLength(0);
  });
  it("either parent sees and approves a personal task assigned to a managed child", () => {
    saveTask(dad, input({ visibility: "personal", assignee: `profile:${profile}` }));
    const o = first(listTasks(mom, now).occurrences);
    const pending = actOnTask(mom, { id: o.id, version: o.version, action: "complete" });
    expect(actOnTask(dad, { id: o.id, version: pending.version, action: "approve" }).status).toBe(
      "approved",
    );
  });
  it("weekly only selected weekdays", () => {
    const t = input({ recurrence: "weekly", weekdays: [1] });
    expect(occursOn(t, "2026-03-30")).toBe(true);
    expect(occursOn(t, "2026-03-31")).toBe(false);
  });
  it("biweekly uses calendar week anchored to start", () => {
    const t = input({ start: "2026-03-23", recurrence: "biweekly", weekdays: [1] });
    expect(occursOn(t, "2026-03-30")).toBe(false);
    expect(occursOn(t, "2026-04-06")).toBe(true);
  });
  it("monthly 31st falls on last available day and returns to 31st", () => {
    const t = input({ start: "2026-01-31", recurrence: "monthly" });
    expect(occursOn(t, "2026-02-28")).toBe(true);
    expect(occursOn(t, "2026-03-31")).toBe(true);
    expect(occursOn(t, "2026-03-28")).toBe(false);
  });
  it("DST spring and autumn retain Budapest date", () => {
    expect(budapestToday(new Date("2026-03-28T23:30Z"))).toBe("2026-03-29");
    expect(budapestToday(new Date("2026-10-25T23:30Z"))).toBe("2026-10-26");
  });
  it("explicit dates and end date are enforced", () => {
    const t = input({
      recurrence: "dates",
      dates: ["2026-03-29", "2026-04-03"],
      end: "2026-03-31",
    });
    expect(occursOn(t, "2026-03-29")).toBe(true);
    expect(occursOn(t, "2026-04-03")).toBe(false);
    expect(taskSchema.safeParse(input({ start: "2026-02-30" })).success).toBe(false);
  });
});
