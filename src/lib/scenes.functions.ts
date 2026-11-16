import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { z } from "zod";
import {
  requirePermission,
  SESSION_COOKIE,
  listUsers,
  isHostedAccountPreview,
  userCan,
} from "./auth.server";
import { sceneSchema } from "./scene-schema";
import {
  listScenes,
  saveScene,
  deleteScene,
  runScene,
  readRuns,
  setDeviceAcl,
  deviceAclList,
} from "./scenes.server";
import { sceneDevices, executeSceneStep } from "./scene-devices.server";
const actor = () => {
  if (isHostedAccountPreview())
    throw new Error(
      "A jeleneteket a saját NAS-címeden kezelheted; az előnézet nem ment és nem vezérel eszközöket.",
    );
  const u = requirePermission(getCookie(SESSION_COOKIE));
  if (!u) throw new Error("A jelenetekhez a NAS-on meglévő családi belépés szükséges.");
  return u;
};
export const scenesList = createServerFn({ method: "GET" }).handler(async () => {
  const u = actor();
  return {
    scenes: listScenes(u),
    userId: u.id,
    canEdit: u.role !== "child" && userCan(u, "rooms"),
    admin: u.role === "admin",
    acl: deviceAclList(u),
    users:
      u.role !== "child"
        ? listUsers()
            .filter((u) => !u.disabled)
            .map((u) => ({ id: u.id, name: u.displayName, role: u.role }))
        : [],
  };
});
export const scenesDevices = createServerFn({ method: "GET" }).handler(async () => {
  const u = actor();
  const result = await sceneDevices();
  if (u.role === "child") {
    const granted = new Set(listScenes(u).flatMap((s) => s.steps.map((step) => step.device)));
    result.devices = result.devices.filter((d) => granted.has(d.key));
  }
  return result;
});
export const scenesSave = createServerFn({ method: "POST" })
  .inputValidator((d) => sceneSchema.parse(d))
  .handler(async ({ data }) => {
    const u = actor();
    return saveScene(u, data, (await sceneDevices()).devices);
  });
export const scenesDelete = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id: z.string() }).parse(d))
  .handler(async ({ data }) => {
    deleteScene(actor(), data.id);
    return { ok: true };
  });
export const scenesRun = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id: z.string(), requestId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => ({
    id: await runScene(actor(), data.id, data.requestId, executeSceneStep),
  }));
export const scenesRuns = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ id: z.string() }).parse(d))
  .handler(async ({ data }) => readRuns(actor(), data.id));
export const scenesAcl = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ userId: z.string(), device: z.string(), allowed: z.boolean() }).parse(d),
  )
  .handler(async ({ data }) => {
    const u = actor();
    if (u.role !== "admin") throw new Error("Eszközengedélyt csak admin adhat.");
    if (!(await sceneDevices()).devices.some((d) => d.key === data.device))
      throw new Error("Ismeretlen eszköz.");
    setDeviceAcl(u, data.userId, data.device, data.allowed);
    return { ok: true };
  });
