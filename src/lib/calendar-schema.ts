import { z } from "zod";
import { dateSchema } from "./task-schema";

export const EVENT_TYPES = ["program", "orvos", "szuletesnap", "fizetes", "karbantartas", "ugyintezes"] as const;
export const eventTypeLabels: Record<(typeof EVENT_TYPES)[number], string> = {
  program: "Program",
  orvos: "Orvosi időpont",
  szuletesnap: "Születésnap / évforduló",
  fizetes: "Fizetési határidő",
  karbantartas: "Karbantartás",
  ugyintezes: "Ügyintézés",
};
export const RECURRENCES = ["once", "daily", "weekly", "monthly", "yearly"] as const;
export const recurrenceLabels: Record<(typeof RECURRENCES)[number], string> = {
  once: "Egyszeri",
  daily: "Naponta",
  weekly: "Hetente (kiválasztott napokon)",
  monthly: "Havonta",
  yearly: "Évente",
};
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Érvénytelen időpont.");
// Times are Budapest civil (wall-clock) values, never UTC instants, so DST never shifts an event.
export const eventSchema = z
  .object({
    id: z.string().max(100).optional(),
    version: z.number().int().optional(),
    title: z.string().trim().min(1, "Adj címet az eseménynek.").max(120),
    description: z.string().trim().max(2000).default(""),
    type: z.enum(EVENT_TYPES).default("program"),
    location: z.string().trim().max(200).default(""),
    allDay: z.boolean().default(false),
    date: dateSchema,
    endDate: dateSchema.nullable().default(null),
    start: time.default("09:00"),
    end: time.default("10:00"),
    people: z.array(z.string().max(80)).max(30).default([]),
    visibility: z.enum(["family", "private"]).default("family"),
    remind: z.boolean().default(false),
    recurrence: z.enum(RECURRENCES).default("once"),
    interval: z.number().int().min(1).max(52).default(1),
    weekdays: z.array(z.number().int().min(0).max(6)).max(7).default([]),
    until: dateSchema.nullable().default(null),
  })
  .refine((e) => !e.endDate || e.endDate >= e.date, "A befejezés nem lehet a kezdés előtt.")
  .refine((e) => e.allDay || e.endDate || e.end >= e.start, "A befejező idő nem lehet a kezdés előtt.")
  .refine((e) => !e.until || e.until >= e.date, "Az ismétlés vége nem lehet a kezdés előtt.");
export type EventInput = z.input<typeof eventSchema>;
export type CalEvent = z.output<typeof eventSchema>;

const day = (s: string) => Date.parse(`${s}T12:00:00Z`) / 86400000;
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
/** Deterministic: does a recurring series fall on this civil date? */
export function occursOn(e: CalEvent, date: string) {
  if (date < e.date || (e.until && date > e.until)) return false;
  const diff = Math.round(day(date) - day(e.date));
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const [, sm, sd] = e.date.split("-").map(Number) as [number, number, number];
  switch (e.recurrence) {
    case "once":
      return diff === 0;
    case "daily":
      return diff % e.interval === 0;
    case "weekly": {
      const wd = new Date(`${date}T12:00:00Z`).getUTCDay();
      const days = e.weekdays.length ? e.weekdays : [new Date(`${e.date}T12:00:00Z`).getUTCDay()];
      const weekOf = (s: string) => Math.floor((day(s) + 3) / 7); // Monday-based week index
      return days.includes(wd) && (weekOf(date) - weekOf(e.date)) % e.interval === 0;
    }
    case "monthly": {
      const months = (y - Number(e.date.slice(0, 4))) * 12 + (m - sm);
      // 31st falls on the month's last day in shorter months.
      return months % e.interval === 0 && d === Math.min(sd, lastDay(y, m));
    }
    case "yearly":
      // 29 Feb birthdays appear on 28 Feb in non-leap years.
      return (y - Number(e.date.slice(0, 4))) % e.interval === 0 && m === sm && d === Math.min(sd, lastDay(y, m));
  }
}
