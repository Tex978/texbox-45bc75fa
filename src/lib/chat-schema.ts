import { z } from "zod";
export const chatSendSchema = z.object({
  clientRequestId: z.string().uuid(),
  text: z.string().trim().min(1, "Az üzenet nem lehet üres.").max(1000, "Az üzenet legfeljebb 1000 karakter lehet."),
}).strict();
export type ChatSend = z.infer<typeof chatSendSchema>;
export const chatPageSchema = z.object({ before: z.number().int().positive().optional() }).strict();
