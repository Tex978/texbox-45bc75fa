import { z } from "zod";
export const chatSendSchema = z
  .object({
    clientRequestId: z.string().uuid(),
    text: z
      .string()
      .trim()
      .min(1, "Az üzenet nem lehet üres.")
      .max(1000, "Az üzenet legfeljebb 1000 karakter lehet."),
  })
  .strict();
export type ChatSend = z.infer<typeof chatSendSchema>;
export const chatPageSchema = z.object({ before: z.number().int().positive().optional() }).strict();
export const CAT_EMOJIS = ["😺", "😸", "😻", "🙀", "😿", "😾", "🐾"] as const;
export const CAT_LABELS = ["Vidám cica", "Nevető cica", "Imádom", "Meglepődtem", "Szomorú cica", "Mérges cica", "Láttam / oké"] as const;
export const COMPOSER_EMOJIS = [...CAT_EMOJIS, "😊", "❤️", "👍", "🎉", "👨‍👩‍👧‍👦"] as const;
export const chatReactionSchema = z.object({
  messageId: z.number().int().positive(),
  emoji: z.enum(CAT_EMOJIS).nullable(),
  version: z.number().int().min(0),
}).strict();
export type ChatReaction = z.infer<typeof chatReactionSchema>;
// Textarea selections use UTF-16 offsets; snap to whole graphemes before insertion.
export function insertChatEmoji(text: string, start: number, end: number, emoji: string) {
  const segments = Array.from(new Intl.Segmenter("hu", { granularity: "grapheme" }).segment(text));
  let a = Math.max(0, Math.min(start, text.length)), b = Math.max(a, Math.min(end, text.length));
  for (const s of segments) {
    const stop = s.index + s.segment.length;
    if (a > s.index && a < stop) a = s.index;
    if (b > s.index && b < stop) b = stop;
  }
  const value = text.slice(0, a) + emoji + text.slice(b);
  return { text: value, cursor: a + emoji.length };
}
