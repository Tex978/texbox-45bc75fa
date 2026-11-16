import { describe, expect, it } from "vitest";
import { selfSufficiency } from "@/components/SmartEnergy";
describe("energy self-sufficiency", () => {
  it("is the share of load not drawn from the grid", () => { expect(selfSufficiency(2000, 500)).toBe(75); });
  it("is unknown when there is no load", () => { expect(selfSufficiency(0, 0)).toBeNull(); });
});
