import { webcrypto } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { listThermometers, restoreSession } from "@/lib/xiaomi.server";

afterEach(() => vi.unstubAllGlobals());

describe("Xiaomi thermometer model-specific reads", () => {
  it("reads Monitor 3 temperature, humidity and battery without changing older sensor reads", async () => {
    vi.stubGlobal("crypto", webcrypto);
    restoreSession("test-user", "test-pass", JSON.stringify({ userId: "test", ssecurity: btoa("test-security"), serviceToken: "test-token", at: Date.now() }));
    const devices = [
      { did: "monitor3", name: "Gergő", model: "xiaomi.sensor_ht.o3", isOnline: true },
      { did: "older", name: "Older", model: "miaomiaoce.sensor_ht.t2", isOnline: true },
    ];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/home/device_list")) return Response.json({ result: { list: devices } });
      const data = new URLSearchParams(String(init?.body)).get("data");
      const params = JSON.parse(data ?? "{}").params;
      expect(params.filter((p: { did: string }) => p.did === "monitor3")).toEqual([
        { did: "monitor3", siid: 2, piid: 1001 },
        { did: "monitor3", siid: 2, piid: 1002 },
        { did: "monitor3", siid: 3, piid: 1003 },
      ]);
      expect(params).toContainEqual({ did: "older", siid: 2, piid: 1 });
      return Response.json({ result: [
        { did: "monitor3", siid: 2, piid: 1001, code: 0, value: 23.4 },
        { did: "monitor3", siid: 2, piid: 1002, code: 0, value: 47 },
        { did: "monitor3", siid: 3, piid: 1003, code: 0, value: 85 },
        { did: "older", siid: 2, piid: 1, code: 0, value: 22 },
        { did: "older", siid: 2, piid: 2, code: 0, value: 54.5 },
      ] });
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await listThermometers("test-user", "test-pass", "de");
    expect(result.sensors[0]).toMatchObject({ temp: 23.4, hum: 47, battery: 85 });
    expect(result.sensors[1]).toMatchObject({ temp: 22, hum: 54.5 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});