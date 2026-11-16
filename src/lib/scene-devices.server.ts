import { storeGet, storeSet } from "./shared-store.server";
import { parseGreeUnits } from "./gree-rules";
import { commandGree, commandBlind } from "./device-commands.server";
import { validateStep, type DeviceCapability, type SceneStep } from "./scene-schema";
const cfg = () => JSON.parse(storeGet("nas-cfg") || "{}") as Record<string, string>;
const env = (key: string) => cfg()[key] || process.env[key] || "";
async function tuya() {
  const raw = storeGet("tuya-sess");
  if (!raw) return null;
  const t = await import("./tuya.server");
  const old = JSON.parse(raw) as import("./tuya.server").TuyaSess;
  const s = await t.ensure(old);
  if (s.a !== old.a && !storeSet("tuya-sess", JSON.stringify(s)))
    throw new Error("A Smart Life kapcsolat nem menthető a NAS-ra.");
  return { t, s };
}
export async function sceneDevices(): Promise<{ devices: DeviceCapability[]; errors: string[] }> {
  const devices: DeviceCapability[] = [],
    errors: string[] = [];
  try {
    if (env("GREE_USER") && env("GREE_PASS")) {
      const { readGreeCloud } = await import("./gree-cloud.server");
      const r = await readGreeCloud({
        user: env("GREE_USER"),
        password: env("GREE_PASS"),
        region: env("GREE_REGION") || "Europe",
      });
      if (r.error) errors.push(r.error);
      for (const u of r.units)
        devices.push({
          key: `gree:${u.ip}`,
          name: u.name,
          online: u.online,
          actions: ["power", "temperature", "mode", "fanSpeed"],
        });
    } else
      for (const u of parseGreeUnits(env("GREE_UNITS"))) {
        const { withGree } = await import("./gree.server");
        let online = false;
        try {
          await withGree(u.ip);
          online = true;
        } catch {
          errors.push(`${u.name}: a klíma nem válaszolt.`);
        }
        devices.push({
          key: `gree:${u.ip}`,
          name: u.name,
          online,
          actions: ["power", "temperature", "mode", "fanSpeed"],
        });
      }
  } catch {
    errors.push("A Gree képességlista nem kérhető le.");
  }
  try {
    if (env("BLINDS_IP")) {
      const { listBlinds } = await import("./blinds.server");
      const meta = JSON.parse(storeGet("nas-blinds") || "{}") as Record<string, { name?: string }>;
      for (const b of await listBlinds(env("BLINDS_IP"), env("BLINDS_KEY")))
        devices.push({
          key: `blind:${b.mac}`,
          name: meta[b.mac]?.name || b.mac,
          online: b.position >= 0,
          actions: ["open", "close", "stop", "position"],
        });
    }
  } catch {
    errors.push("A redőnyök képességlistája nem kérhető le.");
  }
  try {
    const r = await tuya();
    if (r)
      for (const d of await r.t.listTuya(r.s)) {
        // Status exposes no writable schema/range: only the existing boolean light switch is offered.
        if (d.status.some((s) => s.code === "switch_led" && typeof s.value === "boolean"))
          devices.push({
            key: `tuya:${d.id}`,
            name: d.name,
            online: d.online,
            actions: ["switch_led"],
          });
      }
  } catch {
    errors.push("A Smart Life képességlista nem kérhető le.");
  }
  return { devices, errors };
}
export async function executeSceneStep(step: SceneStep, reauthorize: () => void) {
  const { devices } = await sceneDevices();
  const d = devices.find((d) => d.key === step.device);
  if (!d || !d.online) throw new Error("Az eszköz offline vagy a kapcsolat nem érhető el.");
  validateStep(step, d);
  reauthorize();
  if (step.device.startsWith("gree:"))
    return commandGree(env, {
      ip: step.device.slice(5),
      property: step.action,
      value: step.value as string | number,
    });
  if (step.device.startsWith("blind:")) {
    const { listBlinds } = await import("./blinds.server");
    const b = (await listBlinds(env("BLINDS_IP"), env("BLINDS_KEY"))).find(
      (b) => b.mac === step.device.slice(6),
    );
    if (!b || b.position < 0) throw new Error("A redőny nem érhető el.");
    reauthorize();
    return commandBlind(env, {
      mac: b.mac,
      deviceType: b.deviceType,
      action: step.action,
      position: step.value as number,
    });
  }
  const r = await tuya();
  if (!r) throw new Error("Nincs Smart Life kapcsolat.");
  reauthorize();
  await r.t.sendTuya(r.s, step.device.slice(5), step.action, step.value);
}
