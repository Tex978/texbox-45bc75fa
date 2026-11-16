import { describe, expect, it, vi, beforeEach } from "vitest";
const mock = vi.hoisted(() => ({ guard: vi.fn(), cookie: vi.fn(), write: vi.fn(), get: vi.fn(), set: vi.fn(() => true) }));
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => ({ inputValidator() { return this; }, handler(fn: (input: unknown) => unknown) { return fn; } }) }));
vi.mock("@tanstack/react-start/server", () => ({ getCookie: mock.cookie, setCookie: mock.write, getRequest: () => new Request("https://texbox.example.test") }));
vi.mock("@/lib/auth.server", () => ({ requirePermission: mock.guard, SESSION_COOKIE: "texbox-session" }));
vi.mock("@/lib/shared-store.server", () => ({ storeGet: mock.get, storeSet: mock.set, storeAvailable: () => true, readStoredCookie: () => undefined }));
import { getLocks, getStatus, saveConfig } from "@/lib/nas.functions";
beforeEach(() => { vi.clearAllMocks(); mock.get.mockReturnValue(undefined); mock.set.mockReturnValue(true); });
describe("NAS security boundaries", () => {
  it("checks lock permission before accessing lock data", async () => {
    mock.guard.mockImplementationOnce(() => { throw new Error("forbidden"); });
    await expect(getLocks()).rejects.toThrow("forbidden");
    expect(mock.guard).toHaveBeenCalledWith(undefined, "locks");
    expect(mock.get).not.toHaveBeenCalled();
  });
  it("checks settings permission before connection tests", async () => {
    mock.guard.mockImplementationOnce(() => { throw new Error("forbidden"); });
    await expect(getStatus()).rejects.toThrow("forbidden");
    expect(mock.guard).toHaveBeenCalledWith(undefined, "settings");
  });
  it("persists configuration but only expires the browser cookie", async () => {
    await saveConfig({ data: { PLEX_TOKEN: "test-private-token" } });
    expect(mock.set).toHaveBeenCalledWith("nas-cfg", expect.stringContaining("test-private-token"));
    expect(mock.write).toHaveBeenCalledWith("nas-cfg", "", expect.objectContaining({ maxAge: 0 }));
    expect(mock.write.mock.calls.some((call) => String(call[1]).includes("test-private-token"))).toBe(false);
  });
});