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
  updateUser,
  type User,
} from "@/lib/auth.server";
import { saveTask, listTasks, actOnTask } from "@/lib/tasks.server";
import { adjustPoints, saveReward, redeem, decideRedemption } from "@/lib/points.server";
import { saveEvent } from "@/lib/calendar.server";
import { shoppingOverview, saveItem } from "@/lib/organizer.server";
import { inbox, markRead, reminderTick, saveSettings } from "@/lib/notifications.server";
import { DEFAULT_SETTINGS } from "@/lib/notification-schema";
import type { TaskInput } from "@/lib/task-schema";
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
import { notificationsList, notificationsMark } from "@/lib/notifications.functions";

let dir: string, dad: User, mom: User, kid: User, profile: string;
const now = new Date("2026-11-16T12:00:00Z");
const task = (p: Partial<TaskInput> = {}): TaskInput => ({
  title: "Mosogatás",
  description: "",
  category: "",
  points: 10,
  visibility: "family",
  assignee: null,
  start: "2026-11-16",
  end: null,
  time: "18:00",
  priority: "normal",
  reminder: false,
  recurrence: "once",
  weekdays: [],
  dates: [],
  ...p,
});
const occ = (u: User, id: string) =>
  listTasks(u, now).occurrences.find((v) => v.templateId === id)!;
const titles = (u: User) => inbox(u).items.map((i) => i.title);
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "texbox-notif-"));
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

describe("7a notification centre", () => {
  it("snapshots before the additive tables", () => {
    expect(existsSync(join(dir, "backups/pre-notifications-phase7a.db"))).toBe(true);
  });
  it("child completion notifies both parents separately, exactly once; decision notifies the child", () => {
    const t = saveTask(mom, task({ assignee: `user:${kid.id}` }));
    let o = occ(kid, t);
    actOnTask(kid, { id: o.id, version: o.version, action: "complete" });
    expect(titles(dad)).toEqual(["Bence teljesítette: Mosogatás"]);
    expect(titles(mom)).toEqual(["Bence teljesítette: Mosogatás"]);
    expect(inbox(kid).items).toEqual([]);
    o = occ(mom, t);
    actOnTask(dad, { id: o.id, version: o.version, action: "approve" });
    // The other parent's stale parallel decision fails and creates nothing.
    expect(() =>
      actOnTask(mom, { id: o.id, version: o.version, action: "reject", reason: "x" }),
    ).toThrow();
    expect(titles(kid)).toEqual(["Mosogatás: jóváhagyva"]);
    resetAuthDb();
    expect(inbox(dad).items).toHaveLength(1);
  });
  it("returned task re-completed notifies again; managed profile decisions go to the other parent", () => {
    const t = saveTask(mom, task({ assignee: `profile:${profile}` }));
    let o = occ(mom, t);
    actOnTask(mom, { id: o.id, version: o.version, action: "complete" });
    expect(titles(dad)).toHaveLength(1);
    expect(titles(mom)).toHaveLength(0);
    o = occ(mom, t);
    actOnTask(dad, { id: o.id, version: o.version, action: "return", reason: "Még poros" });
    expect(titles(mom)).toEqual(["Mosogatás: visszaküldve"]);
    o = occ(mom, t);
    actOnTask(mom, { id: o.id, version: o.version, action: "complete" });
    expect(titles(dad)).toHaveLength(2);
  });
  it("adult completion creates no approval noise", () => {
    const t = saveTask(mom, task({ assignee: `user:${mom.id}` }));
    const o = occ(mom, t);
    actOnTask(mom, { id: o.id, version: o.version, action: "complete" });
    expect(inbox(dad).items).toEqual([]);
  });
  it("child reward request notifies parents; rejection notifies the child", () => {
    adjustPoints(dad, {
      person: `user:${kid.id}`,
      delta: 50,
      reason: "Kezdő pont",
      requestId: "a",
    });
    const r = saveReward(dad, {
      name: "Mozi",
      description: "",
      category: "",
      price: 20,
      stock: null,
      eligible: [],
      image: "",
      active: true,
      archived: false,
    });
    const red = redeem(kid, { rewardId: r, requestId: "q1", expectedPrice: 20 });
    expect(titles(mom)).toEqual(["Bence jutalmat kér: Mozi"]);
    expect(titles(dad)).toEqual(["Bence jutalmat kér: Mozi"]);
    decideRedemption(mom, { id: red.id, version: 1, action: "reject", reason: "Most nem" });
    expect(titles(kid)).toEqual(["Mozi: elutasítva"]);
  });
  it("inbox isolation: foreign IDs cannot be read or marked; opt-out and disabled users get nothing", async () => {
    const t = saveTask(mom, task({ assignee: `user:${kid.id}` }));
    const o = occ(kid, t);
    saveSettings(dad, { version: 0, settings: { ...DEFAULT_SETTINGS, approval: false } });
    updateUser(mom.id, { disabled: true });
    actOnTask(kid, { id: o.id, version: o.version, action: "complete" });
    expect(inbox(dad).items).toEqual([]);
    expect(db()!.prepare("SELECT count(*) c FROM notifications").get()).toEqual({ c: 0 });
    updateUser(mom.id, { disabled: false });
    const t2 = saveTask(dad, task({ assignee: `user:${kid.id}`, title: "Másik" }));
    const o2 = occ(kid, t2);
    actOnTask(kid, { id: o2.id, version: o2.version, action: "complete" });
    const id = inbox(mom).items[0]!.id;
    expect(markRead(kid, { ids: [id] })).toBe(0);
    expect(markRead(dad, { ids: [id] })).toBe(0);
    expect(markRead(mom, { ids: [id] })).toBe(1);
    expect(markRead(mom, { ids: [id] })).toBe(1); // second phone: idempotent
    expect(inbox(mom).unread).toBe(0);
    expect(() => saveSettings(dad, { version: 0, settings: DEFAULT_SETTINGS })).toThrow("máshol");
  });
  it("shopping ticks never notify", () => {
    saveItem(mom, { listId: shoppingOverview(mom).lists[0]!.id, name: "Tej" });
    expect(db()!.prepare("SELECT count(*) c FROM notifications").get()).toEqual({ c: 0 });
  });
  it("calendar reminders fire once in the window, never late, Budapest time", async () => {
    saveEvent(mom, {
      title: "Fogorvos",
      date: "2026-11-17",
      start: "10:00",
      end: "11:00",
      remind: true,
    });
    saveEvent(mom, { title: "Csendes", date: "2026-11-17", start: "10:00", end: "11:00" });
    // 10:00 Budapest = 09:00Z; 1h lead → 08:00Z
    expect(await reminderTick(Date.UTC(2026, 10, 17, 7, 59))).toBe(0);
    const sent = await reminderTick(Date.UTC(2026, 10, 17, 8, 1));
    expect(sent).toBe(3);
    resetAuthDb();
    expect(await reminderTick(Date.UTC(2026, 10, 17, 8, 2))).toBe(0);
    expect(titles(mom)).toEqual(["Közelgő: Fogorvos"]);
    saveEvent(mom, {
      title: "Késő",
      date: "2026-11-18",
      start: "10:00",
      end: "11:00",
      remind: true,
    });
    expect(await reminderTick(Date.UTC(2026, 10, 18, 8, 30))).toBe(0);
  });
  it("DST: summer reminder uses CEST offset", async () => {
    saveEvent(mom, {
      title: "Nyári",
      date: "2026-03-29",
      start: "03:30",
      end: "04:00",
      remind: true,
    });
    expect(await reminderTick(Date.UTC(2026, 2, 29, 0, 31))).toBeGreaterThan(0);
  });
  it("task reminders only for the assignee with reminder on", async () => {
    saveTask(
      mom,
      task({ assignee: `user:${kid.id}`, reminder: true, start: "2026-11-17", time: "18:00" }),
    );
    saveTask(mom, task({ assignee: `user:${kid.id}`, start: "2026-11-17", title: "Nincs" }));
    await reminderTick(Date.UTC(2026, 10, 17, 16, 1));
    expect(titles(kid)).toEqual(["Határidő közeleg: Mosogatás"]);
    expect(titles(mom)).toEqual([]);
  });
  it("RPC requires a session and stays personal", async () => {
    await expect(notificationsList({ data: {} })).rejects.toThrow("Bejelentkezés");
    context.token = createSession(kid.id, "t");
    expect((await notificationsList({ data: {} })).items).toEqual([]);
    expect((await notificationsMark({ data: { all: true } })).changed).toBe(0);
  });
});
