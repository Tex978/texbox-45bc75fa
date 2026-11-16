import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { z } from "zod";
import { requirePermission, SESSION_COOKIE } from "./auth.server";
import { actOnTask, archiveTask, listTasks, saveTask } from "./tasks.server";
import { taskSchema } from "./task-schema";

function access() {
  const user = requirePermission(getCookie(SESSION_COOKIE));
  if (!user) throw new Error("A feladatokhoz jelentkezz be a saját NAS-címeden. Az előnézet nem éri el a család feladatait.");
  return user;
}
export const tasksList = createServerFn({ method: "GET" }).handler(async () => listTasks(access()));
export const tasksSave = createServerFn({ method: "POST" }).inputValidator((v) => taskSchema.parse(v)).handler(async ({ data }) => ({ id: saveTask(access(), data) }));
export const tasksArchive = createServerFn({ method: "POST" }).inputValidator((v) => z.object({ id: z.string(), version: z.number().int() }).parse(v)).handler(async ({ data }) => { archiveTask(access(), data.id, data.version); return { ok: true }; });
export const tasksAct = createServerFn({ method: "POST" }).inputValidator((v) => z.object({ id: z.string(), version: z.number().int(), action: z.enum(["claim", "complete", "approve", "return", "reject", "cancel"]), person: z.string().optional(), reason: z.string().max(1000).optional() }).parse(v)).handler(async ({ data }) => actOnTask(access(), data));