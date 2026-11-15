import { describe, expect, it } from "vitest";
import { decodeHistoryValue } from "@/lib/thermo-history";
describe("Xiaomi historical measurements", () => {
  it("decodes signed BLE temperature and combined humidity", () => {
    expect(decodeHistoryValue('["e600f401"]', "4109")).toEqual({ temp: 23, hum: 50 });
    expect(decodeHistoryValue('["ceff"]', "4100")).toEqual({ temp: -5 });
  });
  it("decodes Monitor 3 numeric property history without hex conversion", () => {
    expect(decodeHistoryValue('[23.4]', "2.1001")).toEqual({ temp: 23.4 });
    expect(decodeHistoryValue('[47]', "2.1002")).toEqual({ hum: 47 });
    expect(decodeHistoryValue('invalid', "4100")).toEqual({});
  });
});