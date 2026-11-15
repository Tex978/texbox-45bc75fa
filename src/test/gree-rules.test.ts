import { describe, expect, it } from "vitest";
import { parseGreeUnits, validateGreeCommand } from "@/lib/gree-rules";
describe("Gree setup and controls", () => {
  it("parses five configured climate units", () => {
    const raw = Array.from({ length: 5 }, (_, i) => `192.168.1.${60 + i}=Klíma ${i + 1}`).join(",");
    expect(parseGreeUnits(raw)).toHaveLength(5);
    expect(parseGreeUnits(raw)[4]).toEqual({ ip: "192.168.1.64", name: "Klíma 5" });
  });
  it("rejects invalid addresses and unsupported controls", () => {
    expect(() => parseGreeUnits("192.168.1.999")).toThrow();
    expect(() => validateGreeCommand({ ip: "192.168.1.60", property: "mode", value: "invalid" })).toThrow();
    expect(validateGreeCommand({ ip: "192.168.1.60", property: "temperature", value: 24 }).value).toBe(24);
  });
});