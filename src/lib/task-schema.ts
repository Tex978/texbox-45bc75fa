import { z } from "zod";

export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(`${s}T12:00:00Z`);
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, "Érvénytelen dátum.");
export const taskSchema = z
  .object({
    id: z.string().optional(),
    version: z.number().int().optional(),
    title: z.string().trim().min(1).max(120),
    description: z.string().trim().max(2000).default(""),
    category: z.string().trim().max(60).default("Háztartás"),
    points: z.number().int().min(0).max(100000),
    visibility: z.enum(["personal", "family"]),
    assignee: z.string().nullable(),
    start: dateSchema,
    end: dateSchema.nullable().default(null),
    time: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .default("18:00"),
    priority: z.enum(["low", "normal", "high"]),
    reminder: z.boolean().default(false),
    recurrence: z.enum(["once", "daily", "weekly", "biweekly", "monthly", "dates"]),
    weekdays: z.array(z.number().int().min(0).max(6)).max(7).default([]),
    dates: z.array(dateSchema).max(120).default([]),
  })
  .superRefine((v, ctx) => {
    if ((v.recurrence === "weekly" || v.recurrence === "biweekly") && !v.weekdays.length)
      ctx.addIssue({
        code: "custom",
        message: "Válassz legalább egy hétköznapot.",
        path: ["weekdays"],
      });
    if (v.recurrence === "dates" && !v.dates.length)
      ctx.addIssue({ code: "custom", message: "Adj meg napokat.", path: ["dates"] });
    if (v.end && v.end < v.start)
      ctx.addIssue({ code: "custom", message: "A záró dátum korábbi a kezdésnél.", path: ["end"] });
  });
export type TaskInput = z.infer<typeof taskSchema>;
export type TaskTemplate = TaskInput & {
  id: string;
  version: number;
  owner: string;
  archived: boolean;
};
export type TaskStatus =
  "open" | "claimed" | "pending" | "approved" | "returned" | "rejected" | "cancelled";
export type TaskOccurrence = {
  id: string;
  templateId: string;
  date: string;
  body: TaskInput;
  assignee: string | null;
  status: TaskStatus;
  version: number;
  reason: string;
  events: { actor: string; action: string; reason: string; at: number }[];
};
export const statusLabels: Record<TaskStatus, string> = {
  open: "Nyitott",
  claimed: "Vállalt",
  pending: "Jóváhagyásra vár",
  approved: "Jóváhagyott",
  returned: "Visszaküldött",
  rejected: "Elutasított",
  cancelled: "Törölt",
};
export function budapestToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Budapest",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  return ["year", "month", "day"].map((k) => parts.find((p) => p.type === k)?.value).join("-");
}
export function addDays(date: string, count: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + count);
  return d.toISOString().slice(0, 10);
}
export function occursOn(t: TaskInput, date: string) {
  if (date < t.start || (t.end && date > t.end)) return false;
  const d = new Date(`${date}T12:00:00Z`),
    start = new Date(`${t.start}T12:00:00Z`);
  if (t.recurrence === "once") return date === t.start;
  if (t.recurrence === "daily") return true;
  if (t.recurrence === "dates") return t.dates.includes(date);
  if (t.recurrence === "monthly") {
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    return d.getUTCDate() === Math.min(start.getUTCDate(), last);
  }
  if (!t.weekdays.includes(d.getUTCDay())) return false;
  const monday = (v: Date) => v.getTime() - ((v.getUTCDay() + 6) % 7) * 86400000;
  return t.recurrence === "weekly" || Math.floor((monday(d) - monday(start)) / 604800000) % 2 === 0;
}
