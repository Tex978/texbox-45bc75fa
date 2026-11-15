import { describe, expect, it } from "vitest";
import { mergeThermometerMeta, visibleThermometers } from "@/lib/thermometer-meta";
describe("thermometer visibility", () => {
  const sensors = [{ did: "one", temp: 18 }, { did: "two", temp: 24 }];
  it("excludes hidden thermometers from tiles and summary inputs", () => {
    expect(visibleThermometers(sensors, { one: { hidden: true } })).toEqual([{ did: "two", temp: 24 }]);
  });
  it("restores a hidden device without losing its name and room", () => {
    const meta = mergeThermometerMeta({ one: { hidden: true, name: "Háló", room: "Emelet" } }, { one: { hidden: false } });
    expect(meta["one"]).toEqual({ hidden: false, name: "Háló", room: "Emelet" });
    expect(visibleThermometers(sensors, meta)).toHaveLength(2);
  });
  it("does not overwrite shared visibility with migrated browser names", () => {
    expect(mergeThermometerMeta({ one: { hidden: true } }, { one: { name: "Old" }, two: { name: "New" } }, true)).toEqual({ one: { hidden: true }, two: { name: "New" } });
  });
});