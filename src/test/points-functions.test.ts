import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createUser, createSession, createChildProfile, resetAuthDb } from "@/lib/auth.server";
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
import {
  pointsList,
  pointsAdjust,
  rewardSave,
  rewardRedeem,
  redemptionDecide,
} from "@/lib/points.functions";
let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "points-rpc-"));
  process.env["DATA_DIR"] = dir;
  resetAuthDb();
  context.token = undefined;
});
afterEach(() => {
  resetAuthDb();
  rmSync(dir, { recursive: true, force: true });
});
describe("direct points RPC authorization", () => {
  it("rejects signed-out calls and child privilege escalation", async () => {
    const mom = createUser({ username: "anya", displayName: "Anya", role: "adult" });
    const kid = createUser({ username: "kid", displayName: "Kid", role: "child" });
    const p = createChildProfile(mom, "Kicsi");
    await expect(pointsList()).rejects.toThrow("Bejelentkezés");
    await expect(
      pointsAdjust({ data: { person: `profile:${p}`, delta: 5, reason: "x y z", requestId: "a" } }),
    ).rejects.toThrow("Bejelentkezés");
    context.token = createSession(kid.id, "t");
    await expect(
      pointsAdjust({
        data: { person: `user:${kid.id}`, delta: 500, reason: "magamnak", requestId: "b" },
      }),
    ).rejects.toThrow();
    await expect(rewardSave({ data: { name: "x", price: 1 } })).rejects.toThrow("szülő");
    await expect(
      rewardRedeem({
        data: { rewardId: "nope", requestId: "c", expectedPrice: 0, person: `profile:${p}` },
      }),
    ).rejects.toThrow();
    await expect(
      redemptionDecide({ data: { id: "nope", version: 1, action: "approve" } }),
    ).rejects.toThrow();
    const view = await pointsList();
    expect(view.people).toHaveLength(1);
    expect(view.people[0]?.balance).toBe(0);
  });
});
