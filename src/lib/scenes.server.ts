import { audit, db, getUser, userCan, type User } from "./auth.server";
import {
  sceneSchema,
  validateStep,
  type Scene,
  type SceneInput,
  type SceneStep,
  type DeviceCapability,
} from "./scene-schema";
import { assertDeviceAccess, withDeviceLock } from "./device-access.server";
const store = () => {
  const d = db();
  if (!d)
    throw new Error(
      "A jelenetek a NAS-on menthetők és indíthatók; az előnézet nem éri el a család eszközeit.",
    );
  return d;
};
const current = (user: User) => {
  const u = getUser(user.id);
  if (!u || u.disabled) throw new Error("A fiók már nem aktív.");
  return u;
};
export function editable(u: User, s: Scene) {
  return (
    u.role !== "child" &&
    userCan(u, "rooms") &&
    (s.ownerId === u.id || (u.role === "admin" && s.visibility === "family"))
  );
}
export function visible(u: User, s: Scene) {
  return (
    s.ownerId === u.id ||
    (s.visibility === "family" && (u.role !== "child" || s.allowedUsers.includes(u.id)))
  );
}
export function getScene(id: string): Scene {
  const r = store().prepare("SELECT * FROM scenes WHERE id=?").get(id) as
    { owner_id: string; body: string; version: number } | undefined;
  if (!r) throw new Error("A jelenet nem található.");
  return { ...sceneSchema.parse(JSON.parse(r.body)), id, ownerId: r.owner_id, version: r.version };
}
export function listScenes(user: User) {
  const u = current(user);
  return (
    store().prepare("SELECT id FROM scenes ORDER BY updated_at DESC").all() as { id: string }[]
  )
    .map((r) => getScene(r.id))
    .filter((s) => visible(u, s))
    .map((s) => ({ ...s, editable: editable(u, s) }));
}
export function saveScene(user: User, raw: SceneInput, devices: DeviceCapability[]) {
  const u = current(user),
    input = sceneSchema.parse(raw),
    d = store();
  if (u.role === "child" || !userCan(u, "rooms"))
    throw new Error("Nincs jelenetszerkesztési jogosultságod.");
  const old = input.id ? getScene(input.id) : null;
  if (old && !editable(u, old)) throw new Error("Ezt a jelenetet nem szerkesztheted.");
  for (const step of input.steps) {
    const device = devices.find((v) => v.key === step.device);
    if (!device) throw new Error("Az eszköz jelenleg nem érhető el a képességkatalógusban.");
    validateStep(step, device);
    assertDeviceAccess(u, device.key);
  }
  for (const id of input.allowedUsers)
    if (!getUser(id) || getUser(id)?.disabled) throw new Error("Érvénytelen indítási engedély.");
  const id = old?.id ?? crypto.randomUUID();
  if (old) {
    const r = d
      .prepare("UPDATE scenes SET body=?,version=version+1,updated_at=? WHERE id=? AND version=?")
      .run(JSON.stringify(input), Date.now(), id, input.version ?? -1);
    if (!r.changes) throw new Error("A jelenetet közben módosították. Töltsd újra.");
  } else
    d.prepare("INSERT INTO scenes VALUES(?,?,?,?,?)").run(
      id,
      u.id,
      JSON.stringify(input),
      1,
      Date.now(),
    );
  audit(u.id, "scene-save", id);
  return getScene(id);
}
export function deleteScene(user: User, id: string) {
  const u = current(user),
    s = getScene(id);
  if (!editable(u, s)) throw new Error("Ezt a jelenetet nem törölheted.");
  store().prepare("DELETE FROM scenes WHERE id=?").run(id);
  audit(u.id, "scene-delete", id);
}
export function setDeviceAcl(user: User, target: string, key: string, allowed: boolean) {
  const u = current(user);
  if (u.role !== "admin") throw new Error("Eszközengedélyt csak admin adhat.");
  if (!getUser(target)) throw new Error("Nincs ilyen bejelentkezési fiók.");
  store()
    .prepare(
      "INSERT INTO scene_device_acl VALUES(?,?,?) ON CONFLICT(user_id,device_key) DO UPDATE SET allowed=excluded.allowed",
    )
    .run(target, key, allowed ? 1 : 0);
  audit(u.id, "device-acl", `${target}:${key}`);
}
export function deviceAclList(user: User) {
  if (current(user).role !== "admin") return [];
  return store().prepare("SELECT user_id,device_key,allowed FROM scene_device_acl").all() as {
    user_id: string;
    device_key: string;
    allowed: number;
  }[];
}
export type StepResult = {
  device: string;
  action: string;
  status: "running" | "accepted" | "failed";
  message: string;
};
export type Run = {
  id: string;
  sceneId: string;
  userId: string;
  startedAt: number;
  finishedAt: number | null;
  status: string;
  results: StepResult[];
};
export function readRuns(user: User, sceneId: string): Run[] {
  const u = current(user),
    s = getScene(sceneId);
  if (!visible(u, s)) throw new Error("Nem láthatod ezt a jelenetet.");
  const rows = store()
    .prepare("SELECT * FROM scene_runs WHERE scene_id=? ORDER BY started_at DESC LIMIT 10")
    .all(sceneId) as {
    id: string;
    scene_id: string;
    user_id: string;
    started_at: number;
    finished_at: number | null;
    status: string;
    results: string;
  }[];
  return rows
    .filter((r) => u.role === "admin" || r.user_id === u.id || s.ownerId === u.id)
    .map((r) => ({
      id: r.id,
      sceneId: r.scene_id,
      userId: r.user_id,
      startedAt: r.started_at,
      finishedAt: r.finished_at,
      status: r.status,
      results: JSON.parse(r.results),
    }));
}
export function canRun(u: User, s: Scene) {
  if (
    !visible(u, s) ||
    !userCan(u, "home") ||
    (u.role === "child" && !s.allowedUsers.includes(u.id))
  )
    throw new Error("Nincs jelenetindítási engedélyed.");
  for (const step of s.steps) assertDeviceAccess(u, step.device);
}
export async function runScene(
  user: User,
  sceneId: string,
  requestId: string,
  execute: (step: SceneStep, reauthorize: () => void) => Promise<void>,
) {
  const d = store(),
    u = current(user),
    s = getScene(sceneId);
  canRun(u, s);
  const existing = d
    .prepare("SELECT id,scene_id,user_id FROM scene_runs WHERE request_id=?")
    .get(requestId) as { id: string; scene_id: string; user_id: string } | undefined;
  if (existing) {
    if (existing.scene_id !== sceneId || existing.user_id !== u.id)
      throw new Error("Érvénytelen indításazonosító.");
    return existing.id;
  }
  const id = crypto.randomUUID();
  try {
    d.prepare(
      "INSERT INTO scene_runs(id,request_id,scene_id,user_id,started_at,status) VALUES(?,?,?,?,?,'running')",
    ).run(id, requestId, sceneId, u.id, Date.now());
  } catch {
    throw new Error("A jelenet már fut. Várd meg az eredményt.");
  }
  audit(u.id, "scene-run", sceneId);
  const results: StepResult[] = [];
  const persist = () =>
    d.prepare("UPDATE scene_runs SET results=? WHERE id=?").run(JSON.stringify(results), id);
  for (const step of s.steps) {
    const result: StepResult = {
      device: step.device,
      action: step.action,
      status: "running",
      message: "Parancs folyamatban",
    };
    results.push(result);
    persist();
    try {
      canRun(current(user), getScene(sceneId));
      await withDeviceLock(step.device, () =>
        execute(step, () => canRun(current(user), getScene(sceneId))),
      );
      result.status = "accepted";
      result.message =
        "A vezérlő elfogadta a parancsot; a fizikai állapotot az eszköznézetben ellenőrizd.";
    } catch (e) {
      result.status = "failed";
      result.message = e instanceof Error ? e.message : "Eszközvezérlési hiba.";
    }
    persist();
  }
  const failed = results.filter((r) => r.status === "failed").length;
  d.prepare("UPDATE scene_runs SET status=?,finished_at=? WHERE id=?").run(
    failed === results.length ? "failed" : failed ? "partial" : "accepted",
    Date.now(),
    id,
  );
  return id;
}
