import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gate } from "@/lib/app-gate";
import { createUser, createSession, resetAuthDb, SESSION_COOKIE } from "@/lib/auth.server";

beforeEach(() => {
  process.env["DATA_DIR"] = mkdtempSync(join(tmpdir(), "texbox-gate-"));
  delete process.env["APP_PASSWORD"];
  resetAuthDb();
});
afterEach(() => {
  delete process.env["APP_PASSWORD"];
  vi.unstubAllGlobals();
  resetAuthDb();
});

const get = (path: string, cookie?: string) =>
  gate(new Request("http://nas.local" + path, { headers: cookie ? { cookie } : {} }));

describe("first-admin setup page", () => {
  it("points to the NAS address when this runtime has no account storage", async () => {
    vi.stubGlobal("navigator", { userAgent: "Cloudflare-Workers" });
    const body = await (await get("/__setup")).text();
    expect(body).toContain("a saját NAS-címeden");
    expect(body).not.toContain("Admin létrehozása");
  });

  it("asks for the missing shared password where accounts can be saved", async () => {
    const body = await (await get("/__setup")).text();
    expect(body).toContain("APP_PASSWORD");
    expect(body).not.toContain("Admin létrehozása");
  });

  it("serves the real setup form on the NAS while no accounts exist", async () => {
    process.env["APP_PASSWORD"] = "koszos-jelszo";
    const body = await (await get("/__setup")).text();
    expect(body).toContain("Admin létrehozása");
  });

  it("never serves the setup form once accounts exist", async () => {
    process.env["APP_PASSWORD"] = "koszos-jelszo";
    const admin = createUser({
      username: "admin",
      displayName: "Admin",
      role: "admin",
      password: "jelszo12345",
    });
    const token = createSession(admin.id, "test");

    expect(await (await get("/__setup")).text()).not.toContain("Admin létrehozása");
    // A signed-in user is handed to the router, which has no /__setup page.
    expect(await get("/__setup", `${SESSION_COOKIE}=${token}`)).toBeNull();
  });
});
