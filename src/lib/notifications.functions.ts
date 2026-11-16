import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { z } from "zod";
import { requirePermission, SESSION_COOKIE, isHostedAccountPreview } from "./auth.server";
import { NOTIFICATION_KINDS, settingsSchema } from "./notification-schema";
import { inbox, markRead, saveSettings, settingsOf, unreadCount } from "./notifications.server";
import { schedulerAlive } from "./schedules.server";
const actor = () => {
  if (isHostedAccountPreview())
    throw new Error(
      "Az értesítések a saját NAS-címeden érhetők el; az előnézet nem mutat értesítést.",
    );
  const u = requirePermission(getCookie(SESSION_COOKIE));
  if (!u) throw new Error("Az értesítésekhez jelentkezz be a saját NAS-címeden.");
  return u;
};
export const notificationsList = createServerFn({ method: "GET" })
  .inputValidator((v) =>
    z
      .object({ filter: z.enum(["all", "unread", ...NOTIFICATION_KINDS]).default("all") })
      .parse(v ?? {}),
  )
  .handler(async ({ data }) => {
    const u = actor();
    return {
      ...inbox(u, data.filter),
      settings: settingsOf(u.id),
      schedulerAlive: schedulerAlive(),
    };
  });
export const notificationsUnread = createServerFn({ method: "GET" }).handler(async () => ({
  unread: unreadCount(actor()),
}));
export const notificationsMark = createServerFn({ method: "POST" })
  .inputValidator((v) =>
    z
      .object({
        ids: z.array(z.number().int().positive()).max(200).optional(),
        all: z.boolean().optional(),
        read: z.boolean().optional(),
      })
      .parse(v),
  )
  .handler(async ({ data }) => ({ changed: markRead(actor(), data) }));
export const notificationSettingsSave = createServerFn({ method: "POST" })
  .inputValidator((v) =>
    z.object({ version: z.number().int().min(0), settings: settingsSchema }).parse(v),
  )
  .handler(async ({ data }) => ({ version: saveSettings(actor(), data) }));
