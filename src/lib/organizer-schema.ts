import { z } from "zod";
import { dateSchema } from "./task-schema";

const text = (max: number) => z.string().trim().max(max).default("");
export const httpsImage = z
  .string()
  .trim()
  .max(500)
  .refine(
    (v) => v === "" || /^https:\/\/[^\s"'<>]+$/i.test(v),
    "A kép csak https:// hivatkozás lehet.",
  )
  .default("");
export const itemSchema = z.object({
  id: z.string().max(100).optional(),
  version: z.number().int().optional(),
  listId: z.string().min(1).max(100),
  name: z.string().trim().min(1, "Adj nevet a terméknek.").max(80),
  qty: z.number().positive().max(100000).nullable().default(null),
  unit: text(16),
  store: text(40),
  category: text(40),
  note: text(200),
});
export type ItemInput = z.input<typeof itemSchema>;
export const ingredientSchema = z.object({
  name: z.string().trim().min(1).max(80),
  qty: z.number().positive().max(100000).nullable().default(null),
  unit: text(16),
});
export const recipeSchema = z.object({
  id: z.string().max(100).optional(),
  version: z.number().int().optional(),
  title: z.string().trim().min(1, "Adj címet a receptnek.").max(100),
  description: text(1000),
  category: text(40),
  servings: z.number().int().min(1).max(50),
  minutes: z.number().int().min(0).max(2000).default(0),
  ingredients: z.array(ingredientSchema).max(80).default([]),
  steps: z.array(z.string().trim().min(1).max(1000)).max(60).default([]),
  image: httpsImage,
});
export type RecipeInput = z.input<typeof recipeSchema>;
export const MEALS = ["reggeli", "ebed", "vacsora", "egyeb"] as const;
export const mealLabels: Record<(typeof MEALS)[number], string> = {
  reggeli: "Reggeli",
  ebed: "Ebéd",
  vacsora: "Vacsora",
  egyeb: "Egyéb",
};
export const menuSchema = z.object({
  day: dateSchema,
  meal: z.enum(MEALS),
  recipeId: z.string().max(100).nullable().default(null),
  title: text(100),
  servings: z.number().int().min(1).max(50).default(4),
});
/** Lowercase, accent-insensitive name used only to match identical products. */
export const normName = (s: string) =>
  s
    .trim()
    .toLocaleLowerCase("hu-HU")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
export const normUnit = (s: string) => s.trim().toLocaleLowerCase("hu-HU").replace(/\.$/, "");
/** Monday (Budapest civil date) of the week containing `date`. */
export function weekStart(date: string) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
export const scaleQty = (qty: number | null, from: number, to: number) =>
  qty === null ? null : Math.round((qty * to * 100) / from) / 100;
