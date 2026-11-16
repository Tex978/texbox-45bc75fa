/** Growatt history parsing only; no synthesis.
 * Plant level (newPlantDetailAPI.do): type 1=day, 2=month, 3=year, 4=total, production only.
 * Inverter level (SPH/"mix", newMixApi.do op=getEnergyProdAndCons_KW): type 0=day (5-minute kW), 1=month (daily kWh),
 * 2=year (monthly kWh), 3=total (yearly kWh, ending at obj.date); series ppv, sysOut, pacToUser, pacToGrid, pcharge, pdischarge. */
export type HistorySpan = "day" | "week" | "month" | "year" | "total";
export const SPAN_TYPE: Record<HistorySpan, number> = { day: 1, week: 2, month: 2, year: 3, total: 4 };
export const MIX_TYPE: Record<Exclude<HistorySpan, "week">, number> = { day: 0, month: 1, year: 2, total: 3 };
export type HistoryPoint = { label: string; value: number | null };
export const SERIES = ["pv", "load", "fromGrid", "toGrid", "charge", "discharge"] as const;
export type SeriesKey = (typeof SERIES)[number];
export type MixRow = { label: string } & Record<SeriesKey, number | null>;
const MIX_KEYS: Record<SeriesKey, string> = { pv: "ppv", load: "sysOut", fromGrid: "pacToUser", toGrid: "pacToGrid", charge: "pcharge", discharge: "pdischarge" };
const pad = (n: number) => String(n).padStart(2, "0");
const toNum = (raw: unknown) => { const s = String(raw ?? "").trim(); const n = s === "" ? NaN : Number(s); return Number.isFinite(n) ? n : null; };

/** Date parameter per span; week uses its Monday. */
export function historyDate(span: HistorySpan, y: number, m: number, d: number) {
  if (span === "week") { const t = new Date(Date.UTC(y, m - 1, d)); t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7)); return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`; }
  return span === "day" ? `${y}-${pad(m)}-${pad(d)}` : span === "month" ? `${y}-${pad(m)}` : span === "year" ? `${y}` : "";
}
export function validHistoryDate(span: HistorySpan, date: string) {
  return span === "day" || span === "week" ? /^\d{4}-\d{2}-\d{2}$/.test(date) : span === "month" ? /^\d{4}-\d{2}$/.test(date) : span === "year" ? /^\d{4}$/.test(date) : date === "";
}
/** The seven calendar days (YYYY-MM-DD) of the week starting at the given Monday. */
export function weekDays(monday: string) {
  const [y, m, d] = monday.split("-").map(Number);
  return Array.from({ length: 7 }, (_, i) => { const t = new Date(Date.UTC(y!, m! - 1, d! + i)); return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`; });
}
/** Reads `back.data` (or `data`) as an ordered label→value map; empty or non-numeric values stay null (missing), never zero. */
export function parsePlantDetail(json: unknown): { ok: boolean; points: HistoryPoint[] } {
  const root = (json && typeof json === "object" ? json : {}) as Record<string, any>;
  const back = (root["back"] ?? root) as Record<string, any>;
  if (back["success"] === false) return { ok: false, points: [] };
  const data = back["data"];
  if (!data || typeof data !== "object" || Array.isArray(data)) return { ok: false, points: [] };
  const points = Object.entries(data as Record<string, unknown>).map(([label, raw]) => ({ label, value: toNum(raw) }));
  points.sort((a, b) => a.label.localeCompare(b.label, "en", { numeric: true }));
  return { ok: true, points };
}
/** Inverter-level energy history. Labels: day "HH:MM", month day number, year month number, total year. */
export function parseMixHistory(span: Exclude<HistorySpan, "week">, json: unknown): { ok: boolean; rows: MixRow[] } {
  const root = (json && typeof json === "object" ? json : {}) as Record<string, any>;
  const obj = root["obj"]; const cd = obj?.["chartData"];
  if (String(root["result"]) !== "1" || !cd || typeof cd !== "object") return { ok: false, rows: [] };
  const row = (label: string, get: (k: string) => unknown): MixRow => ({ label, ...Object.fromEntries(SERIES.map((s) => [s, toNum(get(MIX_KEYS[s]))])) } as MixRow);
  if (span === "day") {
    const rows = Object.entries(cd as Record<string, any>).filter(([, v]) => v && typeof v === "object" && !Array.isArray(v)).map(([t, v]) => row(t, (k) => v[k]));
    rows.sort((a, b) => a.label.localeCompare(b.label)); return { ok: true, rows };
  }
  const len = Math.max(0, ...Object.values(cd as Record<string, unknown>).map((v) => Array.isArray(v) ? v.length : 0));
  const lastYear = Number(obj["date"]);
  const label = (i: number) => span === "total" ? String((Number.isFinite(lastYear) ? lastYear : new Date().getFullYear()) - len + 1 + i) : String(i + 1);
  return { ok: true, rows: Array.from({ length: len }, (_, i) => row(label(i), (k) => (cd as any)[k]?.[i])) };
}
/** Periods after `now` (local calendar) carry no measurement yet: mark them missing instead of zero. */
export function maskFuture(span: HistorySpan, date: string, rows: MixRow[], now: Date): MixRow[] {
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const future = (r: MixRow) => span === "day" ? date > today || (date === today && r.label > time)
    : span === "week" ? r.label > today
    : span === "month" ? `${date}-${pad(Number(r.label))}` > today
    : span === "year" ? `${date}-${pad(Number(r.label))}` > today.slice(0, 7)
    : Number(r.label) > now.getFullYear();
  return rows.map((r) => future(r) ? { label: r.label, pv: null, load: null, fromGrid: null, toGrid: null, charge: null, discharge: null } : r);
}
