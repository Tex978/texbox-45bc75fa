import { describe, it, expect, beforeEach, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createUser,
  login,
  sessionUser,
  requirePermission,
  resetAuthDb,
  hashPassword,
  verifyPassword,
  createInviteToken,
  acceptInvite,
  updateUser,
  endSession,
  db,
  authStorageUnavailable,
  createChildProfile,
  listChildProfiles,
  updateChildProfile,
  isOwner,
  getUser,
  revokeUserSessions,
} from "@/lib/auth.server";
import { can } from "@/lib/permissions";

beforeEach(() => {
  process.env["DATA_DIR"] = mkdtempSync(join(tmpdir(), "texbox-"));
  resetAuthDb();
});

describe("family accounts", () => {
  it("keeps the existing admin and session after restarting the account store", () => {
    const a = createUser({ username: "apa", displayName: "Apa", role: "admin", password: "jelszo123" });
    const r = login("apa", "jelszo123", "local", "test");
    if (!("token" in r)) throw new Error(r.error);
    resetAuthDb();
    expect(getUser(a.id)?.username).toBe("apa");
    expect(sessionUser(r.token)?.id).toBe(a.id);
    expect(isOwner(a.id)).toBe(true);
  });
  it("a parent can create a child profile without email, username or password", () => {
    const parent = createUser({ username: "anya", displayName: "Anya", role: "adult" });
    const id = createChildProfile(parent, "Bence", "star");
    resetAuthDb();
    expect(listChildProfiles()).toContainEqual({ id, displayName: "Bence", icon: "star", disabled: false, createdBy: parent.id });
    expect(getUser(id)).toBeNull();
  });
  it("both parents can edit a child profile", () => {
    const a = createUser({ username: "apa", displayName: "Apa", role: "admin" });
    const b = createUser({ username: "anya", displayName: "Anya", role: "adult" });
    const id = createChildProfile(a, "Bence");
    updateChildProfile(b, id, "Benci", "cat", true);
    expect(listChildProfiles()[0]).toMatchObject({ displayName: "Benci", icon: "cat", disabled: true });
  });
  it("a child cannot create child profiles even with a family override", () => {
    const c = createUser({ username: "gyerek", displayName: "Gyerek", role: "child" });
    expect(can("child", "family", { family: true })).toBe(false);
    expect(() => createChildProfile({ ...c, permissions: { family: true } }, "Test")).toThrow("Csak szülő");
  });
  it("replacing and expiring invite links prevents activation", () => {
    const u = createUser({ username: "anya", displayName: "Anya", role: "adult" });
    const first = createInviteToken(u.id);
    createInviteToken(u.id);
    expect(() => acceptInvite(first, "jelszo123")).toThrow("lejárt");
    const expired = createInviteToken(u.id, -1);
    expect(() => acceptInvite(expired, "jelszo123")).toThrow("lejárt");
  });
  it("revoking sessions closes all of the selected account's logins", () => {
    const u = createUser({ username: "anya", displayName: "Anya", role: "adult" });
    const t = acceptInvite(createInviteToken(u.id), "jelszo123");
    revokeUserSessions(u.id);
    expect(sessionUser(t)).toBeNull();
  });
  it("does not mistake the hosted preview virtual filesystem for broken NAS storage", () => {
    vi.stubGlobal("navigator", { userAgent: "Cloudflare-Workers" });
    try {
      expect(db()).toBeNull();
      expect(authStorageUnavailable()).toBe(false);
      expect(requirePermission(undefined, "home")).toBeNull();
    } finally { vi.unstubAllGlobals(); }
  });
  it("does not open permissions when NAS account storage is unavailable", () => {
    const old = process.env["DATA_DIR"];
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      process.env["DATA_DIR"] = "/dev/null/texbox-unwritable";
      resetAuthDb();
      expect(() => requirePermission(undefined, "settings")).toThrow(
        "A fiókok tárolója nem elérhető",
      );
    } finally {
      process.env["DATA_DIR"] = old;
      resetAuthDb();
      log.mockRestore();
    }
  });
  it("stores scrypt hashes, never the raw password", () => {
    const h = hashPassword("titok12345");
    expect(h).not.toContain("titok12345");
    expect(verifyPassword("titok12345", h)).toBe(true);
    expect(verifyPassword("rossz-jelszo", h)).toBe(false);
  });
  it("rejects a wrong password and locks after 5 failures", () => {
    createUser({ username: "apa", displayName: "Apa", role: "admin", password: "jelszo123" });
    for (let i = 0; i < 5; i++)
      expect(login("apa", "rossz", "1.1.1.1", "")).toHaveProperty("error");
    expect(login("apa", "jelszo123", "1.1.1.1", "")).toEqual({
      error: "Túl sok hibás próbálkozás. Várj 5 percet.",
    });
  });
  it("logout ends the session", () => {
    createUser({ username: "apa", displayName: "Apa", role: "admin", password: "jelszo123" });
    const r = login("apa", "jelszo123", "x", "") as { token: string };
    expect(sessionUser(r.token)?.username).toBe("apa");
    endSession(r.token);
    expect(sessionUser(r.token)).toBeNull();
  });
  it("changing the forwarded IP cannot bypass five failed logins", () => {
    createUser({ username: "apa", displayName: "Apa", role: "admin", password: "jelszo123" });
    for (let i = 0; i < 5; i++) login("apa", "rossz", `ip-${i}`, "");
    expect(login("apa", "jelszo123", "another-ip", "")).toEqual({
      error: "Túl sok hibás próbálkozás. Várj 5 percet.",
    });
  });
  it("child cannot reach connections, downloads or locks; admin can", () => {
    expect(can("child", "settings")).toBe(false);
    expect(can("child", "downloads")).toBe(false);
    expect(can("child", "locks")).toBe(false);
    expect(can("child", "home")).toBe(true);
    expect(can("admin", "settings")).toBe(true);
    expect(can("adult", "settings")).toBe(false);
    expect(can("adult", "users", { users: true })).toBe(false);
  });
  it("server guard: open before the first account, 401/403 afterwards", () => {
    expect(requirePermission(undefined, "settings")).toBeNull();
    const kid = createUser({ username: "bence", displayName: "Bence", role: "child" });
    expect(() => requirePermission(undefined, "home")).toThrow("Bejelentkezés szükséges.");
    const t = acceptInvite(createInviteToken(kid.id), "gyerek1234");
    expect(() => requirePermission(t, "settings")).toThrow("Ehhez nincs jogosultságod");
    expect(requirePermission(t, "home")?.username).toBe("bence");
  });
  it("invite links are single use and disabling a user ends their sessions", () => {
    const u = createUser({ username: "anya", displayName: "Anya", role: "adult" });
    createUser({ username: "apa", displayName: "Apa", role: "admin", password: "jelszo123" });
    const link = createInviteToken(u.id);
    const t = acceptInvite(link, "anya12345");
    expect(() => acceptInvite(link, "masik12345")).toThrow("A link lejárt");
    updateUser(u.id, { disabled: true });
    expect(sessionUser(t)).toBeNull();
  });
  it("keeps at least one admin", () => {
    const a = createUser({
      username: "apa",
      displayName: "Apa",
      role: "admin",
      password: "jelszo123",
    });
    expect(() => updateUser(a.id, { role: "adult" })).toThrow("Legalább egy aktív admin");
  });
});
