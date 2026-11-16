import { describe, expect, it } from "vitest";
import { applyPref, parsePrefs, PREF_KEYS, isPrefKey } from "@/lib/shared-prefs";

describe("shared prefs", () => {
  it("rejects inherited property names", () => {
    expect(isPrefKey("constructor")).toBe(false);
    expect(isPrefKey("toString")).toBe(false);
  });
  it("drops unknown keys", () => {
    expect(parsePrefs(JSON.stringify({ "home-theme": "dark", evil: 1 }))).toEqual({
      "home-theme": "dark",
    });
  });
  it("migration never overwrites an existing shared value", () => {
    const cur = { "home-theme": "dark" };
    expect(applyPref(cur, "home-theme", "light", true)).toBe(cur);
    expect(applyPref(cur, "home-favorites", ["sensors"], true)).toEqual({
      "home-theme": "dark",
      "home-favorites": ["sensors"],
    });
  });
  it("children cannot edit rooms", () => {
    expect(PREF_KEYS["home-gree-rooms"]).toBe("rooms");
  });
  it("rejects oversized values", () => {
    expect(() => applyPref({}, "hc-meta", "x".repeat(40_000), false)).toThrow();
  });
});
