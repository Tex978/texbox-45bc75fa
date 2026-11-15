import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { getRouter } from "@/router";

describe("SSR query snapshot", () => {
  it("restores the exact thermometer snapshot without a second initial fetch", async () => {
    const server = getRouter();
    const snapshot = { sensors: [{ did: "sensor-1", temp: 22.4 }], raw: '{"did":"sensor-1","value":22.4}' };
    server.options.context.queryClient.setQueryData(["thermo"], snapshot);
    const state = await server.options.dehydrate?.();
    if (!state) throw new Error("Missing SSR snapshot");
    const browser = getRouter();
    await browser.options.hydrate?.(state);
    let requests = 0;
    const result = await browser.options.context.queryClient.fetchQuery({
      queryKey: ["thermo"],
      queryFn: async () => { requests++; return { ...snapshot, raw: "different response" }; },
    });
    expect(result).toEqual(snapshot);
    expect(requests).toBe(0);
  });

  it("keeps query data isolated between requests", () => {
    const first = getRouter();
    const second = getRouter();
    expect(first.options.context.queryClient).toBeInstanceOf(QueryClient);
    first.options.context.queryClient.setQueryData(["thermo"], "private snapshot");
    expect(second.options.context.queryClient.getQueryData(["thermo"])).toBeUndefined();
  });
});