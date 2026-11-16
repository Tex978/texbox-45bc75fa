import { beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createUser, createSession, resetAuthDb } from "@/lib/auth.server";
const context = vi.hoisted(() => ({
  token: undefined as string | undefined,
  execute: vi.fn(async () => {}),
}));
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
vi.mock("@/lib/scene-devices.server", () => ({
  sceneDevices: async () => ({
    devices: [{ key: "gree:192.168.1.2", name: "Klíma", online: true, actions: ["power"] }],
    errors: [],
  }),
  executeSceneStep: context.execute,
}));
import { scenesSave, scenesRun, scenesAcl } from "@/lib/scenes.functions";
beforeEach(() => {
  process.env["DATA_DIR"] = mkdtempSync(join(tmpdir(), "scene-rpc-"));
  resetAuthDb();
  context.token = undefined;
  context.execute.mockClear();
});
const input = {
  name: "Este",
  icon: "moon" as const,
  color: "primary" as const,
  visibility: "family" as const,
  allowedUsers: [],
  steps: [{ device: "gree:192.168.1.2", action: "power" as const, value: "off" }],
};
describe("direct scene endpoint authorization", () => {
  it("rejects signed-out direct save and run calls", async () => {
    createUser({ username: "apa", displayName: "Apa", role: "admin" });
    await expect(scenesSave({ data: input })).rejects.toThrow("Bejelentkezés szükséges");
    await expect(
      scenesRun({ data: { id: "unknown", requestId: crypto.randomUUID() } }),
    ).rejects.toThrow("Bejelentkezés szükséges");
    expect(context.execute).not.toHaveBeenCalled();
  });
  it("adult can save own scene but cannot give device grants", async () => {
    const u = createUser({ username: "anya", displayName: "Anya", role: "adult" });
    context.token = createSession(u.id, "test");
    const s = await scenesSave({ data: input });
    expect(s.ownerId).toBe(u.id);
    await expect(
      scenesAcl({ data: { userId: u.id, device: "gree:192.168.1.2", allowed: true } }),
    ).rejects.toThrow("csak admin");
  });
});
