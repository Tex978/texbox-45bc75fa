import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createUser, createSession, resetAuthDb } from "@/lib/auth.server";
const context = vi.hoisted(() => ({ token: undefined as string | undefined }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    v: (x: unknown) => x,
    inputValidator(v: (x: unknown) => unknown) {
      this.v = v;
      return this;
    },
    handler(fn: (a: { data: unknown }) => unknown) {
      const v = this.v;
      return async (a?: { data: unknown }) => fn({ data: v(a?.data) });
    },
  }),
}));
vi.mock("@tanstack/react-start/server", () => ({ getCookie: () => context.token }));
import * as F from "@/lib/calendar.functions";
let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "cal-rpc-"));
  process.env["DATA_DIR"] = dir;
  resetAuthDb();
  context.token = undefined;
});
afterEach(() => {
  resetAuthDb();
  rmSync(dir, { recursive: true, force: true });
});
it("rejects signed-out, malformed and child writes on every calendar RPC", async () => {
  createUser({ username: "anya", displayName: "Anya", role: "adult" });
  const kid = createUser({ username: "kid", displayName: "Kid", role: "child" });
  const r = { from: "2026-11-16", to: "2026-11-20" };
  await expect(F.calendarGet({ data: r })).rejects.toThrow("Bejelentkezés");
  await expect(F.calendarSave({ data: { title: "x", date: "2026-11-16" } })).rejects.toThrow(
    "Bejelentkezés",
  );
  context.token = createSession(kid.id, "t");
  await expect(F.calendarSave({ data: { title: "x", date: "2026-11-16" } })).rejects.toThrow(
    "felnőtt",
  );
  await expect(F.calendarSave({ data: { title: "x", date: "2026-13-01" } })).rejects.toThrow();
  await expect(
    F.calendarOccurrence({ data: { id: "nope", date: "2026-11-16", action: "skip" } }),
  ).rejects.toThrow();
  await expect(
    F.calendarToTask({ data: { id: "nope", date: "2026-11-16", assignee: null } }),
  ).rejects.toThrow();
  await expect(F.calendarGet({ data: { from: "x", to: "y" } })).rejects.toThrow();
  expect((await F.calendarGet({ data: r })).canCreate).toBe(false);
});
