import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createUser,
  createChildProfile,
  resetAuthDb,
  db,
  updateUser,
  type User,
} from "@/lib/auth.server";
import { saveTask, listTasks, actOnTask } from "@/lib/tasks.server";
import {
  adjustPoints,
  balanceOf,
  decideRedemption,
  pointsOverview,
  redeem,
  saveReward,
  setWish,
} from "@/lib/points.server";
import type { TaskInput } from "@/lib/task-schema";

let dir: string, dad: User, mom: User, kid: User, profile: string;
const now = new Date("2026-11-16T12:00:00Z");
const task = (p: Partial<TaskInput> = {}): TaskInput => ({
  title: "Mosogatás",
  description: "",
  category: "Otthon",
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
function occ(u: User, templateId: string) {
  const o = listTasks(u, now).occurrences.find((v) => v.templateId === templateId);
  if (!o) throw new Error("missing occurrence");
  return o;
}
const reward = (price: number, stock: number | null = null, eligible: string[] = []) =>
  saveReward(dad, {
    name: "Mozi",
    description: "",
    category: "Élmény",
    price,
    stock,
    eligible,
    image: "",
    active: true,
    archived: false,
  });
let n = 0;
const rid = () => `req-${++n}`;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "texbox-points-"));
  process.env["DATA_DIR"] = dir;
  resetAuthDb();
  dad = createUser({ username: "apa", displayName: "Apa", role: "admin" });
  mom = createUser({ username: "anya", displayName: "Anya", role: "adult" });
  kid = createUser({ username: "bence", displayName: "Bence", role: "child" });
  profile = createChildProfile(mom, "Kicsi");
});
afterEach(() => {
  resetAuthDb();
  rmSync(dir, { force: true, recursive: true });
});
const ledgerCount = () =>
  (db()!.prepare("SELECT count(*) c FROM point_ledger").get() as { c: number }).c;

describe("4a personal points", () => {
  it("backs up before migration and has no family pool", () => {
    expect(existsSync(join(dir, "backups/pre-points-phase4.db"))).toBe(true);
    const view = pointsOverview(mom);
    expect(
      view.people.every((p) => p.key.startsWith("user:") || p.key.startsWith("profile:")),
    ).toBe(true);
    expect(view.people.map((p) => p.key)).not.toContain(`user:${dad.id}`);
  });
  it("credits adult completion automatically, exactly once in the same transaction", () => {
    const t = saveTask(mom, task({ assignee: `user:${mom.id}`, visibility: "personal" }));
    const o = occ(mom, t);
    actOnTask(mom, { id: o.id, version: o.version, action: "complete" });
    expect(balanceOf(`user:${mom.id}`)).toMatchObject({ balance: 10, earned: 10, spent: 0 });
    expect(() => actOnTask(mom, { id: o.id, version: o.version, action: "complete" })).toThrow();
    resetAuthDb(); // restart + backfill must not double count
    expect(balanceOf(`user:${mom.id}`).balance).toBe(10);
    expect(balanceOf(`user:${dad.id}`).balance).toBe(0);
  });
  it("child points only after parent approval; returned/rejected give none", () => {
    for (const assignee of [`user:${kid.id}`, `profile:${profile}`]) {
      const a = saveTask(mom, task({ assignee, title: `A ${assignee}` }));
      let o = occ(mom, a);
      actOnTask(mom, { id: o.id, version: o.version, action: "complete" });
      expect(balanceOf(assignee).balance).toBe(0);
      o = occ(mom, a);
      actOnTask(mom, { id: o.id, version: o.version, action: "return", reason: "Még nem kész" });
      o = occ(mom, a);
      actOnTask(mom, { id: o.id, version: o.version, action: "complete" });
      o = occ(mom, a);
      actOnTask(dad, { id: o.id, version: o.version, action: "approve" });
      // The second parent deciding concurrently with a stale version is refused.
      expect(() => actOnTask(mom, { id: o.id, version: o.version, action: "approve" })).toThrow();
      expect(balanceOf(assignee).balance).toBe(10);
      const b = saveTask(mom, task({ assignee, title: `B ${assignee}` }));
      let r = occ(mom, b);
      actOnTask(mom, { id: r.id, version: r.version, action: "complete" });
      r = occ(mom, b);
      actOnTask(mom, { id: r.id, version: r.version, action: "reject", reason: "Nem" });
      expect(balanceOf(assignee).balance).toBe(10);
    }
  });
  it("backfills legacy approvals exactly once with source log; 0 points create no fake row", () => {
    const t = saveTask(
      mom,
      task({ assignee: `user:${mom.id}`, visibility: "personal", points: 0 }),
    );
    const o = occ(mom, t);
    actOnTask(mom, { id: o.id, version: o.version, action: "complete" });
    expect(ledgerCount()).toBe(0);
    const d = db()!;
    const big = saveTask(
      mom,
      task({ assignee: `profile:${profile}`, points: 100000, title: "Nagy" }),
    );
    let b = occ(mom, big);
    actOnTask(mom, { id: b.id, version: b.version, action: "complete" });
    b = occ(mom, big);
    actOnTask(dad, { id: b.id, version: b.version, action: "approve" });
    d.prepare("DELETE FROM point_ledger").run(); // simulate a pre-phase-4 database
    resetAuthDb();
    resetAuthDb();
    expect(balanceOf(`profile:${profile}`).balance).toBe(100000);
    const rows = db()!.prepare("SELECT source,reason FROM point_ledger").all() as {
      source: string;
      reason: string;
    }[];
    expect(rows).toHaveLength(1);
    expect(rows[0]?.source).toBe(`task:${b.id}`);
  });
  it("adjustments need reason, ACL, allow negative balance and are audited", () => {
    expect(() =>
      adjustPoints(mom, { person: `profile:${profile}`, delta: -5, reason: "", requestId: rid() }),
    ).toThrow("indoklás");
    expect(() =>
      adjustPoints(kid, {
        person: `profile:${profile}`,
        delta: 5,
        reason: "csal",
        requestId: rid(),
      }),
    ).toThrow("szülő");
    expect(() =>
      adjustPoints(mom, { person: `user:${mom.id}`, delta: 5, reason: "saját", requestId: rid() }),
    ).toThrow("saját");
    expect(() =>
      adjustPoints(mom, {
        person: `user:${dad.id}`,
        delta: 5,
        reason: "felnőtt",
        requestId: rid(),
      }),
    ).toThrow("admin");
    const same = rid();
    adjustPoints(mom, {
      person: `profile:${profile}`,
      delta: -5,
      reason: "Rossz könyvelés",
      requestId: same,
    });
    adjustPoints(mom, {
      person: `profile:${profile}`,
      delta: -5,
      reason: "Rossz könyvelés",
      requestId: same,
    });
    expect(balanceOf(`profile:${profile}`).balance).toBe(-5);
    expect(
      db()!.prepare("SELECT count(*) c FROM audit_log WHERE action='points-adjust'").get(),
    ).toEqual({ c: 2 });
  });
  it("children see only their own balance; disabled users are refused", () => {
    const view = pointsOverview(kid);
    expect(view.people.map((p) => p.key)).toEqual([`user:${kid.id}`]);
    updateUser(kid.id, { disabled: true });
    expect(() => pointsOverview(kid)).toThrow("Bejelentkezés");
  });
});

describe("4b reward shop", () => {
  it("adult redeems instantly with atomic deduction, stock and idempotent double click", () => {
    adjustPoints(dad, { person: `user:${mom.id}`, delta: 30, reason: "Kezdő", requestId: rid() });
    const r = reward(20, 1);
    const req = rid();
    expect(redeem(mom, { rewardId: r, requestId: req, expectedPrice: 20 }).status).toBe("awaiting");
    redeem(mom, { rewardId: r, requestId: req, expectedPrice: 20 });
    expect(balanceOf(`user:${mom.id}`)).toMatchObject({ balance: 10, spent: 20 });
    expect(() => redeem(mom, { rewardId: r, requestId: rid(), expectedPrice: 20 })).toThrow();
    const r2 = reward(5);
    expect(() => redeem(mom, { rewardId: r2, requestId: rid(), expectedPrice: 4 })).toThrow("ára");
    expect(() =>
      redeem(mom, { rewardId: reward(50), requestId: rid(), expectedPrice: 50 }),
    ).toThrow("elég");
  });
  it("child request reserves, approval deducts once, rejection releases, stock restored", () => {
    const key = `profile:${profile}`;
    adjustPoints(mom, { person: key, delta: 30, reason: "Kezdő", requestId: rid() });
    const r = reward(20, 2);
    const a = redeem(mom, { rewardId: r, requestId: rid(), expectedPrice: 20, person: key });
    expect(a.status).toBe("reserved");
    expect(balanceOf(key)).toMatchObject({ balance: 30, reserved: 20, available: 10 });
    expect(() =>
      redeem(mom, { rewardId: r, requestId: rid(), expectedPrice: 20, person: key }),
    ).toThrow("elég");
    const row = pointsOverview(mom).redemptions[0]!;
    decideRedemption(dad, { id: row.id, version: row.version, action: "approve" });
    expect(() =>
      decideRedemption(mom, { id: row.id, version: row.version, action: "approve" }),
    ).toThrow();
    expect(balanceOf(key)).toMatchObject({ balance: 10, reserved: 0, spent: 20 });
    adjustPoints(mom, { person: key, delta: 20, reason: "Plusz", requestId: rid() });
    const b = redeem(mom, { rewardId: r, requestId: rid(), expectedPrice: 20, person: key });
    const rowB = pointsOverview(mom).redemptions.find((x) => x.id === b.id)!;
    expect(() =>
      decideRedemption(mom, { id: rowB.id, version: rowB.version, action: "reject" }),
    ).toThrow("indok");
    decideRedemption(mom, {
      id: rowB.id,
      version: rowB.version,
      action: "reject",
      reason: "Most nem",
    });
    expect(balanceOf(key)).toMatchObject({ balance: 30, reserved: 0 });
    expect(pointsOverview(dad).rewards.find((x) => x.id === r)?.stock).toBe(1);
  });
  it("child-login user cannot approve or act for others; archived history is kept", () => {
    const key = `user:${kid.id}`;
    adjustPoints(dad, { person: key, delta: 10, reason: "Kezdő", requestId: rid() });
    const r = reward(10, null, [key]);
    const req = redeem(kid, { rewardId: r, requestId: rid(), expectedPrice: 10 });
    const row = pointsOverview(kid).redemptions[0]!;
    expect(() =>
      decideRedemption(kid, { id: row.id, version: row.version, action: "approve" }),
    ).toThrow("szülő");
    expect(() =>
      redeem(kid, {
        rewardId: r,
        requestId: rid(),
        expectedPrice: 10,
        person: `profile:${profile}`,
      }),
    ).toThrow();
    expect(() => redeem(mom, { rewardId: r, requestId: rid(), expectedPrice: 10 })).toThrow(
      "nem érhető el",
    );
    expect(() => saveReward(kid, { name: "x", price: 1 })).toThrow("szülő");
    decideRedemption(kid, { id: req.id, version: 1, action: "cancel" });
    expect(balanceOf(key).available).toBe(10);
    const v = pointsOverview(dad).rewards.find((x) => x.id === r)!;
    saveReward(dad, { ...v, archived: true });
    expect(pointsOverview(kid).rewards).toHaveLength(0);
    expect(pointsOverview(kid).redemptions[0]?.rewardName).toBe("Mozi");
    setWish(kid, { person: key, rewardId: r, wish: true, goal: true });
    expect(() =>
      setWish(kid, { person: `profile:${profile}`, rewardId: r, wish: true, goal: false }),
    ).toThrow();
  });
  it("persists across DB restart", () => {
    adjustPoints(dad, { person: `user:${mom.id}`, delta: 7, reason: "Teszt", requestId: rid() });
    reward(3);
    resetAuthDb();
    expect(balanceOf(`user:${mom.id}`).balance).toBe(7);
    expect(pointsOverview(dad).rewards).toHaveLength(1);
  });
});
