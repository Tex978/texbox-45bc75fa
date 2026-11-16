import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { z } from "zod";
import { requirePermission, SESSION_COOKIE, isHostedAccountPreview } from "./auth.server";
import { itemInput } from "./notes-schema";
import { itemHistory, listItems, matterToTask, saveItem, setArchived } from "./notes.server";
import { saveTask } from "./tasks.server";
const actor = () => {
  if (isHostedAccountPreview())
    throw new Error("A jegyzetek és ügyek a saját NAS-címeden érhetők el; az előnézet nem ment.");
  const u = requirePermission(getCookie(SESSION_COOKIE));
  if (!u) throw new Error("A jegyzetekhez jelentkezz be a saját NAS-címeden.");
  return u;
};
const id = z.string().min(1).max(100);
export const notesList = createServerFn({ method: "GET" })
  .inputValidator((v) => z.object({ archived: z.boolean().optional() }).parse(v ?? {}))
  .handler(async ({ data }) => listItems(actor(), data));
export const noteSave = createServerFn({ method: "POST" })
  .inputValidator((v) => itemInput.parse(v))
  .handler(async ({ data }) => ({ id: saveItem(actor(), data) }));
export const noteArchive = createServerFn({ method: "POST" })
  .inputValidator((v) => z.object({ id, version: z.number().int(), archived: z.boolean() }).parse(v))
  .handler(async ({ data }) => {
    setArchived(actor(), data);
    return { ok: true };
  });
export const noteHistory = createServerFn({ method: "GET" })
  .inputValidator((v) => z.object({ id }).parse(v))
  .handler(async ({ data }) => itemHistory(actor(), data.id));
export const matterTask = createServerFn({ method: "POST" })
  .inputValidator((v) => z.object({ id }).parse(v))
  .handler(async ({ data }) => matterToTask(actor(), data.id, saveTask as never));
