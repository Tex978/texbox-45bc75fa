import { describe, expect, it } from "vitest";
import { buildHomeDevices, groupByRoom, type HomeSources } from "@/lib/home-devices";
const base: HomeSources = { sensors: [], sensorMeta: {}, gree: [], purifiers: [], blinds: [], tuya: [], tuyaMeta: {}, appliances: [], locks: [] };
describe("home device grouping", () => {
  it("never invents rooms: devices without a stored room stay in the general list", () => {
    const d = buildHomeDevices({ ...base, sensors: [{ did: "a", name: "A", online: true, temp: 21 }, { did: "b", name: "B", online: true }], sensorMeta: { a: { room: "Nappali" } }, gree: [{ ip: "1", name: "Klíma", online: true, properties: { power: "on" } }] });
    const g = groupByRoom(d);
    expect(g.rooms.map(([r]) => r)).toEqual(["Nappali"]);
    expect(g.other.map((x) => x.name)).toEqual(["B", "Klíma"]);
  });
  it("hides Tuya devices marked hidden", () => {
    const d = buildHomeDevices({ ...base, tuya: [{ id: "x", name: "Lámpa", online: true, status: [] }], tuyaMeta: { x: { hidden: true } } });
    expect(d).toHaveLength(0);
  });
});
