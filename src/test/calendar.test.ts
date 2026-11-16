import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createUser, createChildProfile, resetAuthDb, db, type User } from "@/lib/auth.server";
import * as C from "@/lib/calendar.server";
import { listTasks } from "@/lib/tasks.server";
import { balanceOf } from "@/lib/points.server";
import { eventSchema, occursOn, type EventInput } from "@/lib/calendar-schema";

let dir: string, dad: User, mom: User, kid: User, kid2: User, profile: string;
const ev = (p: Partial<EventInput> = {}): EventInput => ({
  title: "Edzés",
  date: "2026-11-16",
  start: "17:00",
  end: "18:00",
  ...p,
});
const range = (u: User, from: string, to: string, person?: string) =>
  C.calendarRange(u, { from, to, person }).occurrences;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "texbox-cal-"));
  process.env["DATA_DIR"] = dir;
  resetAuthDb();
  dad = createUser({ username: "apa", displayName: "Apa", role: "admin" });
  mom = createUser({ username: "anya", displayName: "Anya", role: "adult" });
  kid = createUser({ username: "bence", displayName: "Bence", role: "child" });
  kid2 = createUser({ username: "lili", displayName: "Lili", role: "child" });
  profile = createChildProfile(mom, "Kicsi");
});
afterEach(() => {
  resetAuthDb();
  rmSync(dir, { force: true, recursive: true });
});

describe("recurrence rules (pure)", () => {
  const p = (x: Partial<EventInput>) => eventSchema.parse(ev(x));
  it("daily/every N, weekly days, monthly last-day, yearly 29 Feb, until", () => {
    expect(occursOn(p({ recurrence: "daily", interval: 3 }), "2026-11-19")).toBe(true);
    expect(occursOn(p({ recurrence: "daily", interval: 3 }), "2026-11-18")).toBe(false);
    const w = p({ recurrence: "weekly", weekdays: [1, 3], interval: 2 });
    expect(
      ["2026-11-16", "2026-11-18", "2026-11-23", "2026-11-30"].map((d) => occursOn(w, d)),
    ).toEqual([true, true, false, true]);
    const m = p({ recurrence: "monthly", date: "2026-01-31" });
    expect(occursOn(m, "2026-02-28")).toBe(true);
    expect(occursOn(m, "2026-04-30")).toBe(true);
    const y = p({ recurrence: "yearly", date: "2024-02-29", type: "szuletesnap", allDay: true });
    expect(occursOn(y, "2025-02-28")).toBe(true);
    expect(occursOn(y, "2028-02-29")).toBe(true);
    expect(occursOn(p({ recurrence: "daily", until: "2026-11-20" }), "2026-11-21")).toBe(false);
    expect(() => p({ end: "16:00" })).toThrow();
  });
});

describe("family calendar on real SQLite", () => {
  it("backs up, keeps earlier data, survives restart", () => {
    expect(existsSync(join(dir, "backups/pre-calendar-phase5b.db"))).toBe(true);
    C.saveEvent(mom, ev({ type: "orvos", location: "Rendelő" }));
    resetAuthDb();
    expect(range(dad, "2026-11-16", "2026-11-16")[0]).toMatchObject({
      title: "Edzés",
      location: "Rendelő",
      type: "orvos",
    });
    expect(db()!.prepare("SELECT count(*) c FROM users").get()).toEqual({ c: 4 });
  });
  it("keeps Budapest wall-clock time across DST changes, no duplicates", () => {
    C.saveEvent(mom, ev({ date: "2026-03-27", start: "10:00", end: "11:00", recurrence: "daily" }));
    const o = range(dad, "2026-03-27", "2026-03-30");
    expect(o.map((x) => `${x.date} ${x.start}`)).toEqual([
      "2026-03-27 10:00",
      "2026-03-28 10:00",
      "2026-03-29 10:00",
      "2026-03-30 10:00",
    ]);
    expect(new Set(o.map((x) => x.key)).size).toBe(4);
    const oct = range(dad, "2026-10-24", "2026-10-26");
    expect(oct.map((x) => x.start)).toEqual(["10:00", "10:00", "10:00"]);
    expect(
      C.calendarRange(
        dad,
        { from: "2026-11-16", to: "2026-11-16" },
        new Date("2026-11-15T23:30:00Z"),
      ).today,
    ).toBe("2026-11-16");
  });
  it("ACL: child sees own and whole-family only; private hidden; children cannot write", () => {
    C.saveEvent(mom, ev({ title: "Közös" }));
    C.saveEvent(mom, ev({ title: "Bence orvos", people: [`user:${kid.id}`] }));
    C.saveEvent(mom, ev({ title: "Lili úszás", people: [`user:${kid2.id}`] }));
    C.saveEvent(mom, ev({ title: "Anya titok", visibility: "private" }));
    expect(
      range(kid, "2026-11-16", "2026-11-16")
        .map((o) => o.title)
        .sort(),
    ).toEqual(["Bence orvos", "Közös"]);
    expect(range(dad, "2026-11-16", "2026-11-16").map((o) => o.title)).not.toContain("Anya titok");
    expect(range(mom, "2026-11-16", "2026-11-16")).toHaveLength(4);
    expect(
      range(dad, "2026-11-16", "2026-11-16", `user:${kid2.id}`)
        .map((o) => o.title)
        .sort(),
    ).toEqual(["Közös", "Lili úszás"]);
    expect(() => C.saveEvent(kid, ev())).toThrow("felnőtt");
    expect(() => C.saveEvent(mom, ev({ people: ["user:nope"] }))).toThrow("Ismeretlen");
    expect(() => C.calendarRange(dad, { from: "2026-01-01", to: "2026-12-31" })).toThrow("62");
    const priv = C.calendarRange(mom, { from: "2026-11-16", to: "2026-11-16" }).occurrences.find(
      (o) => o.title === "Anya titok",
    )!;
    expect(() =>
      C.changeOccurrence(dad, { id: priv.eventId, date: "2026-11-16", action: "skip" }),
    ).toThrow("nem szerkesztheted");
  });
  it("two adults editing concurrently: second stale save is refused; archive hides but keeps", () => {
    const id = C.saveEvent(mom, ev());
    C.saveEvent(dad, ev({ id, version: 1, title: "Apa módosította" }));
    expect(() => C.saveEvent(mom, ev({ id, version: 1, title: "Anya" }))).toThrow("közben");
    C.saveEvent(mom, { ...ev({ id, version: 2 }), archived: true });
    expect(range(dad, "2026-11-16", "2026-11-16")).toHaveLength(0);
    expect(db()!.prepare("SELECT archived FROM calendar_events WHERE id=?").get(id)).toEqual({
      archived: 1,
    });
    expect(
      (
        db()!.prepare("SELECT count(*) c FROM audit_log WHERE action LIKE 'calendar-%'").get() as {
          c: number;
        }
      ).c,
    ).toBe(3);
  });
  it("skip, move and restore a single occurrence", () => {
    const id = C.saveEvent(mom, ev({ recurrence: "weekly" }));
    C.changeOccurrence(mom, { id, date: "2026-11-23", action: "skip" });
    C.changeOccurrence(dad, { id, date: "2026-11-30", action: "move", newDate: "2026-12-01" });
    expect(range(dad, "2026-11-16", "2026-12-07").map((o) => o.date)).toEqual([
      "2026-11-16",
      "2026-12-01",
      "2026-12-07",
    ]);
    C.changeOccurrence(mom, { id, date: "2026-11-23", action: "restore" });
    expect(range(dad, "2026-11-23", "2026-11-23")).toHaveLength(1);
    expect(() => C.changeOccurrence(mom, { id, date: "2026-11-24", action: "skip" })).toThrow(
      "nincs",
    );
  });
  it("event to task: once per occurrence, 0 points, no credit", () => {
    const id = C.saveEvent(mom, ev({ recurrence: "weekly", type: "fizetes", title: "Csekk" }));
    const a = C.eventToTask(mom, { id, date: "2026-11-23", assignee: `profile:${profile}` });
    const b = C.eventToTask(dad, { id, date: "2026-11-23", assignee: null });
    expect(a.created).toBe(true);
    expect(b).toEqual({ taskId: a.taskId, created: false });
    const t = listTasks(mom, new Date("2026-11-20T10:00:00Z")).templates.filter(
      (x) => x.title === "Csekk",
    );
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ points: 0, start: "2026-11-23", assignee: `profile:${profile}` });
    expect(range(mom, "2026-11-23", "2026-11-23")[0]?.taskId).toBe(a.taskId);
    expect(balanceOf(`profile:${profile}`).balance).toBe(0);
    expect(() => C.eventToTask(kid, { id, date: "2026-11-30", assignee: null })).toThrow();
  });
});
