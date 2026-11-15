import { describe, expect, it } from "vitest";
import { createSolarCache, SOLAR_SESSION_MS } from "@/lib/growatt-cache";
describe("Growatt request protection", () => {
  it("reuses readings for five minutes including simultaneous refreshes", async () => {
    let time = 0, calls = 0;
    const cache = createSolarCache<number>(() => time);
    const load = async () => ++calls;
    expect(await Promise.all([cache("account", load), cache("account", load)])).toEqual([1, 1]);
    time = 299999;
    expect(await cache("account", load)).toBe(1);
    time = 300000;
    expect(await cache("account", load)).toBe(2);
    expect(calls).toBe(2);
  });
  it("does not retry failures for one hour", async () => {
    let time = 0, calls = 0;
    const cache = createSolarCache<number>(() => time);
    const load = async () => { calls++; throw new Error("blocked"); };
    await expect(cache("account", load)).rejects.toThrow("blocked");
    time = 3599999;
    await expect(cache("account", load)).rejects.toThrow("egy órára");
    expect(calls).toBe(1);
    time = 3600000;
    await expect(cache("account", load)).rejects.toThrow("blocked");
    expect(calls).toBe(2);
  });
  it("reuses a session on the next reading and isolates accounts", async () => {
    let time = 0, logins = 0;
    const cache = createSolarCache<number>(() => time);
    const load = async (session: unknown, save: (s: {cookie: string; userId: string; expiresAt: number}) => void) => {
      if (!session) { logins++; save({ cookie: "test-session", userId: "account", expiresAt: time + SOLAR_SESSION_MS }); }
      return logins;
    };
    await cache("first", load); time = 300000; await cache("first", load);
    expect(logins).toBe(1);
    await cache("second", load); expect(logins).toBe(2);
  });
});