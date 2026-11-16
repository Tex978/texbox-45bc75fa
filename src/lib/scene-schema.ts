import { z } from "zod";
import { GREE_MODES, GREE_FANS, validateGreeCommand } from "./gree-rules";

export const stepSchema = z.object({
  device: z.string().min(1).max(100),
  action: z.enum(["power", "temperature", "mode", "fanSpeed", "open", "close", "stop", "position", "switch_led"]),
  value: z.union([z.string().max(40), z.number().finite(), z.boolean()]),
});
export const sceneSchema = z.object({
  id: z.string().optional(), version: z.number().int().optional(),
  name: z.string().trim().min(1).max(60),
  icon: z.enum(["sparkles", "sun", "moon", "film", "house"]),
  color: z.enum(["primary", "energy", "success"]).default("primary"),
  visibility: z.enum(["personal", "family"]),
  allowedUsers: z.array(z.string().max(80)).max(50),
  steps: z.array(stepSchema).min(1).max(20),
});
export type SceneInput = z.infer<typeof sceneSchema>;
export type SceneStep = z.infer<typeof stepSchema>;
export type DeviceCapability = { key: string; name: string; online: boolean; actions: SceneStep["action"][] };
export type Scene = SceneInput & { id: string; ownerId: string; version: number };
export const ACTION_LABELS: Record<SceneStep["action"], string> = { power: "Be / ki", temperature: "Célhőmérséklet", mode: "Üzemmód", fanSpeed: "Ventilátor", open: "Felnyitás", close: "Leengedés", stop: "Megállítás", position: "Célpozíció (%)", switch_led: "Világítás be / ki" };
export { GREE_MODES, GREE_FANS };
export function validateStep(step: SceneStep, device: DeviceCapability) {
  if (step.device !== device.key || !device.actions.includes(step.action)) throw new Error("Az eszköz nem támogatja ezt a jelenetműveletet.");
  if (step.device.startsWith("gree:")) validateGreeCommand({ ip: step.device.slice(5), property: step.action, value: step.value as string | number });
  else if (step.device.startsWith("blind:")) {
    if (step.action === "position" && (typeof step.value !== "number" || !Number.isInteger(step.value) || step.value < 0 || step.value > 100)) throw new Error("A redőnypozíció 0–100 közötti egész szám.");
  } else if (step.action !== "switch_led" || typeof step.value !== "boolean") throw new Error("Érvénytelen világításkapcsoló.");
}