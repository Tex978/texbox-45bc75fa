import { createServerFn } from "@tanstack/react-start";
import { getCookie, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { SESSION_COOKIE } from "./auth.server";
import { chatPageSchema, chatSendSchema, chatReactionSchema } from "./chat-schema";
import { chatList, chatMarkRead, chatSend, chatStatus, chatReact } from "./chat.server";
import { draftFiles } from "./chat-files.server";
const token = () => {
  setResponseHeader("Cache-Control", "no-store");
  return getCookie(SESSION_COOKIE);
};
export const chatUnread = createServerFn({ method: "GET" }).handler(async () =>
  chatStatus(token()),
);
export const chatDraftFiles = createServerFn({method:"GET"}).handler(async()=>draftFiles(token()));
export const chatMessages = createServerFn({ method: "GET" })
  .inputValidator((v: unknown) => chatPageSchema.parse(v ?? {}))
  .handler(async ({ data }) => chatList(token(), data.before));
export const chatMessageSend = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => chatSendSchema.parse(v))
  .handler(async ({ data }) => chatSend(token(), data));
export const chatRead = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) =>
    z.object({ through: z.number().int().positive() }).strict().parse(v),
  )
  .handler(async ({ data }) => chatMarkRead(token(), data.through));
export const chatReactionSave = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => chatReactionSchema.parse(v))
  .handler(async ({ data }) => chatReact(token(), data));
