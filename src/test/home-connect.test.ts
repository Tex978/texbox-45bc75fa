import { describe, expect, it, vi } from "vitest";
import { homeConnectFailure } from "@/lib/home-connect";

describe("Home Connect recovery", () => {
  it("requires reconnect for an expired or rejected authorization", () => {
    expect(homeConnectFailure(401).reconnect).toBe(true);
    expect(homeConnectFailure(403).reconnect).toBe(true);
  });
  it("does not require reconnect for throttling or a provider outage", () => {
    expect(homeConnectFailure(429).reconnect).toBe(false);
    expect(homeConnectFailure(503).reconnect).toBe(false);
  });
});