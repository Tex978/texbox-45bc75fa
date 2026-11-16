import { z } from "zod";
// Client-safe notification kinds and per-account settings (7a, in-app only — no push/e-mail).
export const NOTIFICATION_KINDS = ["approval", "task", "calendar", "reward"] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];
export const KIND_LABELS: Record<NotificationKind, string> = {
  approval: "Jóváhagyások",
  task: "Feladatok és határidők",
  calendar: "Naptár-emlékeztetők",
  reward: "Jutalmak",
};
export const LEAD_OPTIONS = [15, 60, 180, 1440] as const;
export const LEAD_LABELS: Record<number, string> = {
  15: "15 perccel előtte",
  60: "1 órával előtte",
  180: "3 órával előtte",
  1440: "1 nappal előtte",
};
export const settingsSchema = z.object({
  approval: z.boolean(),
  task: z.boolean(),
  calendar: z.boolean(),
  reward: z.boolean(),
  leadMinutes: z.union([z.literal(15), z.literal(60), z.literal(180), z.literal(1440)]),
});
export type NotificationSettings = z.infer<typeof settingsSchema>;
export const DEFAULT_SETTINGS: NotificationSettings = {
  approval: true,
  task: true,
  calendar: true,
  reward: true,
  leadMinutes: 60,
};
export const LINKS = ["/tasks", "/rewards", "/organizer", "/notifications"] as const;
