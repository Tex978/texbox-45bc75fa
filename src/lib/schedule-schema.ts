import { z } from "zod";
// Client-safe schedule rules and Europe/Budapest wall-clock maths (2b/1). Never relies on the host TZ.
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const scheduleSchema = z
  .object({
    id: z.string().max(100).optional(),
    version: z.number().int().optional(),
    title: z.string().trim().min(1).max(60),
    sceneId: z.string().min(1).max(100),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    recurrence: z.enum(["daily", "weekdays", "weekly", "once"]),
    weekdays: z.array(z.number().int().min(1).max(7)).max(7).default([]),
    everyWeeks: z.number().int().min(1).max(8).default(1),
    date: date.nullable().default(null),
    startDate: date,
  })
  .superRefine((v, c) => {
    if ((v.recurrence === "weekdays" || v.recurrence === "weekly") && !v.weekdays.length)
      c.addIssue({ code: "custom", message: "Válassz legalább egy napot." });
    if (v.recurrence === "once" && !v.date)
      c.addIssue({ code: "custom", message: "Add meg a dátumot." });
  });
export type ScheduleInput = z.infer<typeof scheduleSchema>;
export const RECURRENCE_LABELS: Record<ScheduleInput["recurrence"], string> = {
  daily: "Naponta",
  weekdays: "Kiválasztott napokon",
  weekly: "N hetente, kiválasztott napokon",
  once: "Egyszer, adott napon",
};
export const WEEKDAY_LABELS = ["H", "K", "Sze", "Cs", "P", "Szo", "V"];
export const DST_NOTE =
  "Tavaszi óraátállításkor a nem létező 02:00–02:59 időpont kimarad; ősszel a kétszer előforduló időpont csak egyszer, az első alkalommal fut.";

const fmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Budapest",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
/** Budapest wall clock of an instant, as YYYY-MM-DD and HH:MM. */
export function budapestParts(ms: number) {
  const p = Object.fromEntries(fmt.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { date: `${p["year"]}-${p["month"]}-${p["day"]}`, time: `${p["hour"]}:${p["minute"]}` };
}
/** First UTC instant whose Budapest wall clock is date+time, or null when it does not exist (spring gap). */
export function budapestInstant(dateStr: string, time: string): number | null {
  const [y, m, d] = dateStr.split("-").map(Number) as [number, number, number];
  const [h, mi] = time.split(":").map(Number) as [number, number];
  const naive = Date.UTC(y, m - 1, d, h, mi);
  const hits = [2, 1]
    .map((off) => naive - off * 3600_000)
    .filter((ms) => {
      const p = budapestParts(ms);
      return p.date === dateStr && p.time === time;
    });
  return hits.length ? Math.min(...hits) : null;
}
export const addDaysStr = (s: string, n: number) => {
  const [y, m, d] = s.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const isoDow = (s: string) => {
  const [y, m, d] = s.split("-").map(Number) as [number, number, number];
  return ((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7) + 1;
};
const dayDiff = (a: string, b: string) => (Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400_000;
/** Does the rule fall on this local calendar date? */
export function occursOn(r: ScheduleInput, day: string) {
  if (day < r.startDate) return false;
  if (r.recurrence === "once") return day === r.date;
  if (r.recurrence === "daily") return true;
  if (!r.weekdays.includes(isoDow(day))) return false;
  if (r.recurrence === "weekdays") return true;
  // Weekly rhythm anchored on the Monday of the start week.
  const anchor = addDaysStr(r.startDate, 1 - isoDow(r.startDate));
  return Math.floor(dayDiff(day, anchor) / 7) % r.everyWeeks === 0;
}
/** Next due instant strictly after `after`, within ~400 days. */
export function nextDue(r: ScheduleInput, after: number): { slot: string; at: number } | null {
  let day = budapestParts(after).date;
  for (let i = 0; i < 400; i++, day = addDaysStr(day, 1)) {
    if (!occursOn(r, day)) continue;
    const at = budapestInstant(day, r.time);
    if (at !== null && at > after) return { slot: `${day}T${r.time}`, at };
  }
  return null;
}
