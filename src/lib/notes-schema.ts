import { z } from "zod";
// Client-safe family notes & matters (8a). Plain text only; links must be HTTPS.
export const NOTE_CATEGORIES = ["Otthon", "Gyerekek", "Bevásárlási információ", "Fontos", "Karbantartás", "Ügyintézés", "Egyéb"] as const;
export const MATTER_STATUS = { planned: "Tervezett", progress: "Folyamatban", done: "Kész" } as const;
export const PRIORITY = { low: "Alacsony", normal: "Normál", high: "Magas" } as const;
const text = (max: number) => z.string().trim().max(max).default("");
export const httpsUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => {
    if (!v) return true;
    try {
      const u = new URL(v);
      return u.protocol === "https:" && !u.username && !u.password;
    } catch {
      return false;
    }
  }, "Csak https:// kezdetű hivatkozás adható meg.")
  .default("");
const base = {
  id: z.string().max(100).optional(),
  version: z.number().int().optional(),
  title: z.string().trim().min(1, "Adj címet.").max(120),
  content: text(5000),
  category: z.enum(NOTE_CATEGORIES).default("Egyéb"),
  visibility: z.enum(["personal", "family"]).default("personal"),
  childVisible: z.boolean().default(false),
  pinned: z.boolean().default(false),
};
export const noteSchema = z.object({
  ...base,
  kind: z.literal("note"),
  url: httpsUrl,
  checklist: z
    .array(z.object({ text: z.string().trim().min(1).max(200), done: z.boolean() }))
    .max(30)
    .default([]),
});
export const matterSchema = z.object({
  ...base,
  kind: z.literal("matter"),
  url: httpsUrl,
  assignee: z.string().max(100).nullable().default(null),
  due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
  status: z.enum(["planned", "progress", "done"]).default("planned"),
  priority: z.enum(["low", "normal", "high"]).default("normal"),
});
export const itemInput = z.discriminatedUnion("kind", [noteSchema, matterSchema]);
export type NoteInput = z.infer<typeof noteSchema>;
export type MatterInput = z.infer<typeof matterSchema>;
export type FamilyItemInput = z.infer<typeof itemInput>;
export const SECRET_HINT = "Jelszót, PIN-kódot vagy banki adatot ne tárolj jegyzetben.";
