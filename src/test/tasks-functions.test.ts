import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createUser, createSession, resetAuthDb } from "@/lib/auth.server";
const context = vi.hoisted(() => ({ token: undefined as string | undefined }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    inputValidator() {
      return this;
    },
    handler(fn: unknown) {
      return fn;
    },
  }),
}));
vi.mock("@tanstack/react-start/server", () => ({ getCookie: () => context.token }));
import { tasksList, tasksSave, tasksArchive, tasksAct } from "@/lib/tasks.functions";
let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "task-rpc-"));
  process.env["DATA_DIR"] = dir;
  resetAuthDb();
  context.token = undefined;
});
afterEach(() => {
  resetAuthDb();
  rmSync(dir, { recursive: true, force: true });
});
describe("direct task RPC authorization", () => {
  it("rejects signed-out reads and every mutation", async () => {
    createUser({ username: "apa", displayName: "Apa", role: "admin" });
    await expect(tasksList()).rejects.toThrow("Bejelentkezés szükséges");
    await expect(tasksSave({ data: {} })).rejects.toThrow("Bejelentkezés szükséges");
    await expect(tasksArchive({ data: { id: "unknown", version: 1 } })).rejects.toThrow(
      "Bejelentkezés szükséges",
    );
    await expect(
      tasksAct({ data: { id: "unknown", version: 1, action: "approve" } }),
    ).rejects.toThrow("Bejelentkezés szükséges");
  });
  it("rejects child direct template mutation", async () => {
    const child = createUser({ username: "gyerek", displayName: "Gyerek", role: "child" });
    context.token = createSession(child.id, "test");
    await expect(
      tasksSave({
        data: {
          title: "Tiltott",
          description: "",
          category: "",
          points: 500,
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
        },
      }),
    ).rejects.toThrow("szülő");
  });
});
