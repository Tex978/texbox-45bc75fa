import { describe, it, expect, beforeEach, afterEach } from "vitest";
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
  resetAuthDb();
});

const get = (path: string, cookie?: string) =>
  gate(new Request("http://nas.local" + path, { headers: cookie ? { cookie } : {} }));

describe("first-admin setup page", () => {
  it("explains NAS-only setup instead of a dead end when no account storage is configured", async () => {
    const r = await get("/__setup");
    const body = await r.text();
    expect(r.status).toBe(200);
    expect(body).toContain("a saját NAS-címeden");
    expect(body).not.toContain("Admin létrehozása");
  });

  it("serves the real setup form on the NAS while no accounts exist", async () => {
    process.env["APP_PASSWORD"] = "koszos-jelszo";
    const r = await get("/__setup");
    const body = await r.text();
    expect(r.status).toBe(200);
    expect(body).toContain("Admin létrehozása");
  });

  it("never serves the setup form once accounts exist, even for a signed-in user", async () => {
    process.env["APP_PASSWORD"] = "koszos-jelszo";
    const admin = createUser({
      username: "admin",
      displayName: "Admin",
      role: "admin",
      password: "jelszo12345",
    });
    const token = createSession(admin.id, "test");

    const signedOut = await get("/__setup");
    expect(await signedOut.text()).not.toContain("Admin létrehozása");

    const signedIn = await get("/__setup", `${SESSION_COOKIE}=${token}`);
    // Signed-in users are handed to the router, which has no /__setup page: the form is never served.
    expect(signedIn).toBeNull();
  });
});
