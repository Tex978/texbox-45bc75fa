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
import { maskFuture, parseMixHistory, weekDays } from "@/lib/growatt-history";
describe("growatt inverter history", () => {
  it("maps inverter series to production, load, grid and battery", () => {
    const r = parseMixHistory("month", { result: 1, obj: { chartData: { ppv: [6.6, 2.5], sysOut: [26.7, 20.2], pacToUser: [20, 18], pacToGrid: [0, 0.1], pcharge: [1.4, 0], pdischarge: [0, 1] } } });
    expect(r.rows[0]).toEqual({ label: "1", pv: 6.6, load: 26.7, fromGrid: 20, toGrid: 0, charge: 1.4, discharge: 0 });
  });
  it("labels total history by year ending at the reported year", () => {
    expect(parseMixHistory("total", { result: 1, obj: { date: 2026, chartData: { ppv: [1, 2, 3] } } }).rows.map((x) => x.label)).toEqual(["2024", "2025", "2026"]);
  });
  it("fails when the inverter returns no data", () => { expect(parseMixHistory("day", { result: 0, obj: null }).ok).toBe(false); });
  it("a week starts on Monday and spans seven days across months", () => {
    expect(historyDate("week", 2026, 11, 1)).toBe("2026-10-26");
    expect(weekDays("2026-10-26").at(-1)).toBe("2026-11-01");
  });
  it("marks days after today as missing, not zero", () => {
    const rows = [{ label: "15", pv: 1, load: 1, fromGrid: 0, toGrid: 0, charge: 0, discharge: 0 }, { label: "16", pv: 0, load: 0, fromGrid: 0, toGrid: 0, charge: 0, discharge: 0 }];
    const m = maskFuture("month", "2026-11", rows, new Date(2026, 10, 15, 12));
    expect(m[0]!.pv).toBe(1); expect(m[1]!.pv).toBeNull();
  });
});
