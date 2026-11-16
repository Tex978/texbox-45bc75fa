import { z } from "zod";
export const rewardSchema = z.object({
  id: z.string().optional(),
  version: z.number().int().optional(),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(1000).default(""),
  category: z.string().trim().max(40).default("Élmény"),
  price: z.number().int().min(0).max(100000),
  stock: z.number().int().min(0).max(100000).nullable().default(null),
  eligible: z.array(z.string().max(80)).max(50).default([]),
  // Only plain https image links; rendered with no-referrer and never fetched by the server.
  image: z
    .string()
    .trim()
    .max(500)
    .refine(
      (v) => v === "" || /^https:\/\/[^\s"'<>]+$/i.test(v),
      "A kép csak https:// hivatkozás lehet.",
    )
    .default(""),
  active: z.boolean().default(true),
  archived: z.boolean().default(false),
});
export type RewardInput = z.input<typeof rewardSchema>;
export type RedemptionStatus = "reserved" | "awaiting" | "handed" | "rejected" | "cancelled";
export const redemptionLabels: Record<RedemptionStatus, string> = {
  reserved: "Szülői jóváhagyásra vár (pont foglalva)",
  awaiting: "Átadásra vár",
  handed: "Átadva",
  rejected: "Elutasítva",
  cancelled: "Visszavonva",
};
