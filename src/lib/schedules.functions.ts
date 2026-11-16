import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { z } from "zod";
import { requirePermission, SESSION_COOKIE, isHostedAccountPreview } from "./auth.server";
import { scheduleSchema } from "./schedule-schema";
import {
  deleteSchedule,
  listSchedules,
  saveSchedule,
  schedulerAlive,
  setScheduleEnabled,
} from "./schedules.server";
const actor = () => {
  if (isHostedAccountPreview())
    throw new Error("Az időzítéseket a saját NAS-címeden kezelheted; az előnézet nem ütemez.");
  const u = requirePermission(getCookie(SESSION_COOKIE));
  if (!u) throw new Error("Az időzítésekhez a NAS-on meglévő családi belépés szükséges.");
  return u;
};
const id = z.string().min(1).max(100);
export const schedulesList = createServerFn({ method: "GET" }).handler(async () => {
  const u = actor();
  return {
    rules: listSchedules(u),
    schedulerAlive: schedulerAlive(),
    canCreate: u.role !== "child",
  };
});
export const scheduleSave = createServerFn({ method: "POST" })
  .inputValidator((v) => scheduleSchema.parse(v))
  .handler(async ({ data }) => ({ id: saveSchedule(actor(), data) }));
export const scheduleToggle = createServerFn({ method: "POST" })
  .inputValidator((v) =>
    z
      .object({
        id,
        version: z.number().int(),
        enabled: z.boolean(),
        confirmSceneVersion: z.number().int().optional(),
      })
      .parse(v),
  )
  .handler(async ({ data }) => {
    setScheduleEnabled(actor(), data);
    return { ok: true };
  });
export const scheduleDelete = createServerFn({ method: "POST" })
  .inputValidator((v) => z.object({ id }).parse(v))
  .handler(async ({ data }) => {
    deleteSchedule(actor(), data.id);
    return { ok: true };
  });
