import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ user: { id: "adult" }, store: new Map<string, string>() }));
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => ({ inputValidator() { return this; }, handler(fn: (input: unknown) => unknown) { return fn; } }) }));
vi.mock("@tanstack/react-start/server", () => ({ getCookie: () => "test-session" }));
vi.mock("@/lib/auth.server", () => ({ requirePermission: () => m.user, SESSION_COOKIE: "texbox-session" }));
vi.mock("@/lib/shared-store.server", () => ({ storeGet: (key: string) => m.store.get(key), storeSet: (key: string, value: string) => { m.store.set(key, value); return true; } }));
import { getMediaPrefs, saveMediaPref } from "@/lib/media-prefs.functions";
beforeEach(() => { m.store.clear(); m.user = { id: "adult" }; });
describe("Personal filters server persistence", () => {
  it("reads saved filters across requests without exposing another user's preferences", async () => {
    await saveMediaPref({ data: { key: "streaming-state", value: JSON.stringify({ provider: 8, days: 7 }) } });
    expect(JSON.parse((await getMediaPrefs()).prefs)["streaming-state"]).toMatchObject({ provider: 8, days: 7 });
    m.user = { id: "child" };
    expect(JSON.parse((await getMediaPrefs()).prefs)).toEqual({});
  });
  it("does not overwrite existing personal filters with a legacy browser migration", async () => {
    await saveMediaPref({ data: { key: "streaming-state", value: JSON.stringify({ provider: 8 }) } });
    await saveMediaPref({ data: { key: "streaming-state", value: JSON.stringify({ provider: 9 }), onlyMissing: true } });
    expect(JSON.parse((await getMediaPrefs()).prefs)["streaming-state"].provider).toBe(8);
  });
});