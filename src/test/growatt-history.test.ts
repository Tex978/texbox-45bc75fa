import { describe, expect, it } from "vitest";
import { historyDate, parsePlantDetail, validHistoryDate } from "@/lib/growatt-history";
describe("growatt history", () => {
  it("formats the date per span", () => {
    expect(historyDate("day", 2026, 3, 5)).toBe("2026-03-05");
    expect(historyDate("month", 2026, 3, 5)).toBe("2026-03");
    expect(historyDate("year", 2026, 3, 5)).toBe("2026");
    expect(historyDate("total", 2026, 3, 5)).toBe("");
  });
  it("rejects a date that does not match the span", () => { expect(validHistoryDate("month", "2026-03-05")).toBe(false); });
  it("keeps empty values as missing instead of zero and sorts labels", () => {
    const r = parsePlantDetail({ back: { success: true, data: { "10": "2.5", "2": "", "1": "1.2" } } });
    expect(r.points).toEqual([{ label: "1", value: 1.2 }, { label: "2", value: null }, { label: "10", value: 2.5 }]);
  });
  it("fails when the provider reports no success", () => { expect(parsePlantDetail({ back: { success: false } }).ok).toBe(false); });
});
