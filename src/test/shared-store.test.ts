import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

const realModule = process.getBuiltinModule.bind(process);
async function setup(failWrite = false) {
  const files: Record<string, string> = {};
  const fs = {
    readFileSync: vi.fn((path: string) => {
      if (!(path in files)) throw Object.assign(new Error("missing"), { code: "ENOENT" });
      return files[path];
    }),
    mkdirSync: vi.fn(),
    statSync: vi.fn((path: string) => {
      if (path === "/data" || path in files) return { isDirectory: () => path === "/data" };
      throw Object.assign(new Error("missing"), { code: "ENOENT" });
    }),
    readdirSync: vi.fn(() => []),
    writeFileSync: vi.fn((path: string, value: string) => {
      if (failWrite && path.includes("nas-state")) throw new Error("denied");
      files[path] = value;
    }),
    renameSync: vi.fn((from: string, to: string) => {
      const value = files[from];
      if (value === undefined) throw new Error("missing temporary file");
      files[to] = value;
      delete files[from];
    }),
  };
  vi.stubGlobal("process", {
    ...process,
    getBuiltinModule: (n: string) => (n === "node:fs" ? fs : realModule(n)),
    env: { ...process.env, DATA_FILE: "/data/nas-state.json" },
  });
  return { store: await import("../lib/shared-store.server"), files, fs };
}

describe("shared Synology settings", () => {
  it("migrates an existing browser cookie when the shared file has no value", async () => {
    const { store, files } = await setup();
    const config = JSON.stringify({ GREE_USER: "test-account" });
    expect(store.readStoredCookie("nas-cfg", () => config)).toBe(config);
    const saved = files["/data/nas-state.json"];
    expect(saved).toBeDefined();
    expect(JSON.parse(saved ?? "{}")["nas-cfg"]).toBe(config);
    expect(store.readStoredCookie("nas-cfg", () => undefined)).toBe(config);
  });
  it("does not replace shared settings with a different browser's old cookie", async () => {
    const { store } = await setup();
    store.storeSet("nas-cfg", "shared-value");
    expect(store.readStoredCookie("nas-cfg", () => "old-value")).toBe("shared-value");
  });
  it("does not report a failed disk write as an in-memory save", async () => {
    const { store } = await setup(true);
    expect(store.storeSet("nas-cfg", "new-value")).toBe(false);
    expect(store.storeGet("nas-cfg")).toBeUndefined();
    expect(() => store.readStoredCookie("nas-cfg", () => "old-value")).toThrow("nem menthetők");
  });
  it("does not silently replace unreadable saved settings with an empty file", async () => {
    const { store, fs } = await setup();
    fs.readFileSync.mockImplementation(() => {
      throw Object.assign(new Error("denied"), { code: "EACCES" });
    });
    expect(() => store.storeGet("nas-cfg")).toThrow("nem olvashatók");
    expect(fs.writeFileSync).not.toHaveBeenCalledWith(
      "/data/nas-state.json.tmp",
      expect.anything(),
      expect.anything(),
    );
  });
  it("retains browser fallback when filesystem persistence is unavailable", async () => {
    vi.stubGlobal("process", { ...process, getBuiltinModule: () => undefined });
    const store = await import("../lib/shared-store.server");
    expect(store.storeAvailable()).toBe(false);
    expect(store.readStoredCookie("nas-cfg", () => "browser-value")).toBe("browser-value");
  });
});
