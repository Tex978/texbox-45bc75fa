import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { z } from "zod";
import { requirePermission, SESSION_COOKIE } from "./auth.server";
import { calendarRange, changeOccurrence, eventToTask, saveEvent } from "./calendar.server";
import { eventSchema } from "./calendar-schema";

function access() {
  const user = requirePermission(getCookie(SESSION_COOKIE));
  if (!user)
    throw new Error("A naptárhoz jelentkezz be a saját NAS-címeden. Az előnézet nem ment eseményt.");
  return user;
}
const id = z.string().min(1).max(100),
  date = z.string().max(10);
export const calendarGet = createServerFn({ method: "GET" })
  .inputValidator((v) => z.object({ from: date, to: date, person: z.string().max(80).optional() }).parse(v))
  .handler(async ({ data }) => calendarRange(access(), data));
export const calendarSave = createServerFn({ method: "POST" })
  .inputValidator((v) => z.intersection(eventSchema, z.object({ archived: z.boolean().optional() })).parse(v))
  .handler(async ({ data }) => ({ id: saveEvent(access(), data) }));
export const calendarOccurrence = createServerFn({ method: "POST" })
  .inputValidator((v) => z.object({ id, date, action: z.enum(["skip", "move", "restore"]), newDate: date.optional() }).parse(v))
  .handler(async ({ data }) => {
    changeOccurrence(access(), data);
    return { ok: true };
  });
export const calendarToTask = createServerFn({ method: "POST" })
  .inputValidator((v) => z.object({ id, date, assignee: z.string().max(80).nullable() }).parse(v))
  .handler(async ({ data }) => eventToTask(access(), data));
