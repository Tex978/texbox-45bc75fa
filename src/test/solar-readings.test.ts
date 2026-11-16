import { describe, expect, it } from "vitest";
import { parseSolarFlow } from "@/lib/solar-readings";
describe("Real solar readings", () => {
  it("keeps missing readings unknown instead of manufacturing zeroes", () => {
    expect(parseSolarFlow({ ppv: 2 })).toEqual({
      pv: 2000,
      soc: null,
      charge: null,
      discharge: null,
      load: null,
      toGrid: null,
      fromGrid: null,
    });
  });
  it("preserves measured zero and existing kilowatt units", () => {
    expect(parseSolarFlow({ pactouser: 0, pLocalLoad: "1.5", SOC: 0 })).toMatchObject({
      fromGrid: 0,
      load: 1500,
      soc: 0,
    });
  });
});
