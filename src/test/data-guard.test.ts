import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chmodSync, existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createUser, db, resetAuthDb, userCount, authStorageUnavailable } from "@/lib/auth.server";
import { ensureReady, initializeNewInstall, inspectGuard, mountOf, storageReport, MARKER_NAME } from "@/lib/data-guard.server";
import { gate } from "@/lib/app-gate";

let dir: string;
const req = (path: string, init: RequestInit = {}) => new Request(`http://nas.local${path}`, init);
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "guard-"));
  process.env["DATA_DIR"] = dir;
  process.env["DATA_FILE"] = `${dir}/nas-state.json`;
  process.env["TEXBOX_TEST_REQUIRE_INIT"] = "1";
  process.env["APP_PASSWORD"] = "regi-jelszo";
  delete process.env["TEXBOX_INSTANCE_ID"];
  resetAuthDb();
  vi.resetModules();
});
afterEach(() => {
  for (const k of ["TEXBOX_TEST_REQUIRE_INIT", "APP_PASSWORD", "DATA_FILE", "TEXBOX_INSTANCE_ID"]) delete process.env[k];
  resetAuthDb();
  vi.unstubAllGlobals();
});
const freshInstall = () => {
  initializeNewInstall("UJ TELEPITES");
  resetAuthDb();
  createUser({ username: "apa", displayName: "Apa", role: "admin", password: "jelszo123" });
};

describe("data folder guard", () => {
  it("an empty data folder never becomes a working instance without explicit confirmation", async () => {
    expect(inspectGuard().status).toBe("new-install");
    expect(db()).toBeNull();
    expect(existsSync(`${dir}/texbox.db`)).toBe(false);
    const page = await gate(req("/"));
    expect(page?.status).toBe(503);
    expect(await page!.text()).toContain("Új TexBox-telepítés");
    expect(readdirSync(dir)).toEqual([]);
  });
  it("explicit first install needs the shared password and the typed phrase", async () => {
    const form = (pw: string, confirm: string) =>
      gate(req("/__init", { method: "POST", body: new URLSearchParams({ legacy: pw, confirm }) }));
    expect((await form("rossz", "UJ TELEPITES"))!.status).toBe(400);
    expect((await form("regi-jelszo", "igen"))!.status).toBe(400);
    expect(existsSync(join(dir, MARKER_NAME))).toBe(false);
    const ok = await form("regi-jelszo", "UJ TELEPITES");
    expect(ok!.headers.get("location")).toBe("/__setup");
    resetAuthDb();
    expect(db()).not.toBeNull();
    expect(userCount()).toBe(0);
  });
  it("adopts an existing pre-guard installation without touching its accounts", () => {
    process.env["TEXBOX_TEST_REQUIRE_INIT"] = "";
    createUser({ username: "apa", displayName: "Apa", role: "admin", password: "jelszo123" });
    rmSync(join(dir, MARKER_NAME)); // simulate an installation from before this guard
    process.env["TEXBOX_TEST_REQUIRE_INIT"] = "1";
    resetAuthDb();
    expect(inspectGuard().status).toBe("adoptable");
    expect(userCount()).toBe(1);
    expect(inspectGuard().status).toBe("ready");
  });
  it("a missing texbox.db is reported, not recreated empty", async () => {
    freshInstall();
    resetAuthDb();
    for (const f of readdirSync(dir)) if (f.startsWith("texbox.db")) rmSync(join(dir, f));
    expect(inspectGuard()).toMatchObject({ status: "blocked", code: "db-missing" });
    expect(db()).toBeNull();
    expect(existsSync(`${dir}/texbox.db`)).toBe(false);
    expect(authStorageUnavailable()).toBe(true);
    const page = await gate(req("/__setup"));
    expect(page!.status).toBe(503);
    expect(await page!.text()).not.toContain("Admin létrehozása");
  });
  it("a missing nas-state.json fails closed instead of returning empty settings", async () => {
    freshInstall();
    const store = await import("@/lib/shared-store.server");
    expect(store.storeSet("nas-cfg", "{}")).toBe(true);
    rmSync(`${dir}/nas-state.json`);
    vi.resetModules();
    const again = await import("@/lib/shared-store.server");
    expect(() => again.storeGet("nas-cfg")).toThrow("nas-state.json");
    expect(again.storeSet("nas-cfg", "x")).toBe(false);
    expect(existsSync(`${dir}/nas-state.json`)).toBe(false);
  });
  it("a different (missing) DATA_DIR is blocked and is not created", () => {
    freshInstall();
    process.env["DATA_DIR"] = join(dir, "masik");
    resetAuthDb();
    expect(inspectGuard()).toMatchObject({ status: "blocked", code: "dir-missing" });
    expect(db()).toBeNull();
    expect(existsSync(join(dir, "masik"))).toBe(false);
  });
  it("a folder bound to another TEXBOX_INSTANCE_ID is refused", () => {
    process.env["TEXBOX_INSTANCE_ID"] = "otthon-1";
    freshInstall();
    process.env["TEXBOX_INSTANCE_ID"] = "masik";
    resetAuthDb();
    expect(inspectGuard()).toMatchObject({ status: "blocked", code: "instance-mismatch" });
    expect(db()).toBeNull();
  });
  it("a read-only data folder is reported instead of silently starting empty", () => {
    if (process.getuid?.() === 0) return; // root ignores permission bits
    chmodSync(dir, 0o500);
    try {
      expect(ensureReady()).toMatchObject({ status: "blocked", code: "not-writable" });
    } finally {
      chmodSync(dir, 0o700);
    }
  });
  it("restarts keep the same accounts", () => {
    freshInstall();
    resetAuthDb();
    expect(userCount()).toBe(1);
    resetAuthDb();
    expect(userCount()).toBe(1);
  });
  it("hosted preview is not treated as NAS storage", () => {
    vi.stubGlobal("navigator", { userAgent: "Cloudflare-Workers" });
    expect(inspectGuard().status).toBe("preview");
    expect(db()).toBeNull();
  });
  it("diagnostics are read-only and contain no secret values", () => {
    process.env["TEXBOX_SECRET_KEY"] = "titkos-kulcs-ertek";
    const before = readdirSync(dir);
    const r = storageReport();
    expect(readdirSync(dir)).toEqual(before);
    expect(r.guard).toBe("new-install");
    expect(JSON.stringify(r)).not.toContain("titkos-kulcs-ertek");
    expect(JSON.stringify(r)).not.toContain("regi-jelszo");
    delete process.env["TEXBOX_SECRET_KEY"];
  });
  it("mount detection distinguishes a bind mount from the container layer", () => {
    const mi = "22 1 0:1 / / rw - overlay overlay rw\n30 22 0:2 /volume1/docker/texbox/data /data rw - btrfs /dev/md2 rw";
    expect(mountOf("/data", mi).status).toBe("separate-mount");
    expect(mountOf("/data", "22 1 0:1 / / rw - overlay overlay rw").status).toBe("container-filesystem");
    expect(mountOf("/data", null).status).toBe("unknown");
  });
});
