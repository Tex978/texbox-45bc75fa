import { describe, expect, it } from "vitest";
import { parseGreeRooms, renameGreeRoom } from "@/lib/gree-rooms";
describe("browser climate rooms", () => {
  it("does not invent rooms for missing or corrupted storage", () => {
    expect(parseGreeRooms(null)).toEqual({ rooms: [], assignments: {} });
    expect(parseGreeRooms("broken")).toEqual({ rooms: [], assignments: {} });
  });
  it("retains assignments by stable IP even if a unit disappears or is renamed", () => {
    expect(
      parseGreeRooms(
        JSON.stringify({
          rooms: ["Nappali"],
          assignments: { "192.168.1.60": "Nappali", gone: "Nappali", invalid: "Kitalált" },
        }),
      ).assignments,
    ).toEqual({ "192.168.1.60": "Nappali", gone: "Nappali" });
  });
  it("renames a custom room and its unit assignments together", () => {
    expect(
      renameGreeRoom({ rooms: ["Háló"], assignments: { a: "Háló" } }, "Háló", "Hálószoba"),
    ).toEqual({ rooms: ["Hálószoba"], assignments: { a: "Hálószoba" } });
  });
});
