import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { z } from "zod";
import { requirePermission, SESSION_COOKIE, isHostedAccountPreview } from "./auth.server";
import { getDashboard, saveDashboard } from "./dashboard.server";

function access() {
  if (isHostedAccountPreview())
    throw new Error("Az előnézet nem ment személyes főoldalt; a saját NAS-címeden állítható be.");
  const u = requirePermission(getCookie(SESSION_COOKIE));
  if (!u) throw new Error("A személyes főoldalhoz jelentkezz be a saját NAS-címeden.");
  return u;
}
const person = z.string().min(1).max(100).optional();
export const dashboardGet = createServerFn({ method: "GET" })
  .inputValidator((v) => z.object({ person }).parse(v ?? {}))
  .handler(async ({ data }) => getDashboard(access(), data.person));
export const dashboardSave = createServerFn({ method: "POST" })
  .inputValidator((v) =>
    z
      .object({
        person,
        version: z.number().int().min(0),
        reset: z.boolean().optional(),
        prefs: z
          .object({
            order: z.array(z.string().max(40)).max(30),
            hidden: z.array(z.string().max(40)).max(30),
            scenes: z.array(z.string().max(100)).max(30),
          })
          .nullable(),
      })
      .parse(v),
  )
  .handler(async ({ data }) => saveDashboard(access(), data));
