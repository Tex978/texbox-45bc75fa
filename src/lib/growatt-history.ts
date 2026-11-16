/** Growatt ShinePhone plant history (newPlantDetailAPI.do): type 1=day, 2=month, 3=year, 4=total. Parsing only; no synthesis. */
export type HistorySpan = "day" | "month" | "year" | "total";
export const SPAN_TYPE: Record<HistorySpan, number> = { day: 1, month: 2, year: 3, total: 4 };
export type HistoryPoint = { label: string; value: number | null };
const pad = (n: number) => String(n).padStart(2, "0");
/** Date parameter format expected per span, using the given calendar date (already in the plant's local zone). */
export function historyDate(span: HistorySpan, y: number, m: number, d: number) {
  return span === "day" ? `${y}-${pad(m)}-${pad(d)}` : span === "month" ? `${y}-${pad(m)}` : span === "year" ? `${y}` : "";
}
export function validHistoryDate(span: HistorySpan, date: string) {
  return span === "day" ? /^\d{4}-\d{2}-\d{2}$/.test(date) : span === "month" ? /^\d{4}-\d{2}$/.test(date) : span === "year" ? /^\d{4}$/.test(date) : date === "";
}
/** Reads `back.data` (or `data`) as an ordered label→value map; empty or non-numeric values stay null (missing), never zero. */
export function parsePlantDetail(json: unknown): { ok: boolean; points: HistoryPoint[] } {
  const root = (json && typeof json === "object" ? json : {}) as Record<string, any>;
  const back = (root["back"] ?? root) as Record<string, any>;
  if (back["success"] === false) return { ok: false, points: [] };
  const data = back["data"];
  if (!data || typeof data !== "object" || Array.isArray(data)) return { ok: false, points: [] };
  const points = Object.entries(data as Record<string, unknown>).map(([label, raw]) => {
    const s = String(raw ?? "").trim(); const n = s === "" ? NaN : Number(s);
    return { label, value: Number.isFinite(n) ? n : null };
  });
  points.sort((a, b) => a.label.localeCompare(b.label, "en", { numeric: true }));
  return { ok: true, points };
}
