import { audit, db, getUser, userCan, type User } from "./auth.server";
import { canRun, getScene, runScene } from "./scenes.server";
import type { SceneStep } from "./scene-schema";
import { budapestInstant, addDaysStr, budapestParts, nextDue, occursOn, scheduleSchema, type ScheduleInput } from "./schedule-schema";

// Timed manual scenes (2b/1): rules are bound to their author's account and one scene; the scene ACL
// is re-checked before every run and every step. Missed slots are never caught up and a claimed slot
// interrupted by a restart is never repeated.
export const GRACE_MS = 3 * 60_000;
export const LEASE_MS = 90_000;
const store = () => {
  const d = db();
  if (!d)
    throw new Error(
      "Az időzítések csak a saját NAS-on menthetők és futnak; az előnézet nem ütemez semmit.",
    );
  return d;
};
const active = (user: User) => {
  const u = getUser(user.id);
  if (!u || u.disabled) throw new Error("A fiók már nem aktív.");
  return u;
};
function assertAuthor(u: User) {
  if (u.role === "child" || !userCan(u, "home") || !userCan(u, "rooms"))
    throw new Error("Időzítést csak jelenetkezelési joggal rendelkező felnőtt hozhat létre.");
}
type Row = {
  id: string;
  owner_id: string;
  scene_id: string;
  body: string;
  enabled: number;
  enabled_at: number | null;
  confirmed_scene_version: number | null;
  version: number;
  last_status: string | null;
  last_message: string;
  last_at: number | null;
};
const rule = (r: Row): ScheduleInput => scheduleSchema.parse(JSON.parse(r.body));
const getRow = (id: string) => {
  const r = store().prepare("SELECT * FROM scene_schedules WHERE id=?").get(id) as Row | undefined;
  if (!r) throw new Error("Az időzítés nem található.");
  return r;
};
const sceneOrNull = (id: string) => {
  try {
    return getScene(id);
  } catch {
    return null;
  }
};
const hasLock = (steps: SceneStep[]) => steps.some((s) => /^lock/i.test(s.device));

/** True only while a background scheduler process holds a fresh lease (heartbeat). */
export function schedulerAlive(now = Date.now()) {
  const r = store().prepare("SELECT expires_at FROM scheduler_lease WHERE id=1").get() as
    | { expires_at: number }
    | undefined;
  return !!r && r.expires_at > now;
}
export function listSchedules(user: User, now = Date.now()) {
  const u = active(user);
  if (u.role === "child") return [];
  const rows = store().prepare("SELECT * FROM scene_schedules ORDER BY created_at").all() as Row[];
  return rows
    .filter((r) => r.owner_id === u.id || u.role === "admin")
    .map((r) => {
      const body = rule(r),
        scene = sceneOrNull(r.scene_id),
        next = r.enabled ? nextDue(body, now) : null;
      const runs = store()
        .prepare("SELECT slot,status,message,at FROM schedule_runs WHERE rule_id=? ORDER BY due_at DESC LIMIT 5")
        .all(r.id) as { slot: string; status: string; message: string; at: number }[];
      return {
        ...body,
        id: r.id,
        version: r.version,
        ownerId: r.owner_id,
        ownerName: getUser(r.owner_id)?.displayName ?? "ismeretlen",
        mine: r.owner_id === u.id,
        enabled: !!r.enabled,
        sceneName: scene?.name ?? null,
        sceneVersion: scene?.version ?? null,
        sceneChanged: !!scene && r.confirmed_scene_version !== null && scene.version !== r.confirmed_scene_version,
        steps: scene?.steps ?? [],
        nextAt: next?.at ?? null,
        lastStatus: r.last_status,
        lastMessage: r.last_message,
        lastAt: r.last_at,
        runs,
      };
    });
}
export function saveSchedule(user: User, raw: ScheduleInput) {
  const u = active(user),
    input = scheduleSchema.parse(raw),
    d = store();
  assertAuthor(u);
  const scene = getScene(input.sceneId);
  canRun(u, scene);
  if (hasLock(scene.steps)) throw new Error("Zárat tartalmazó jelenet nem időzíthető.");
  const now = Date.now();
  const { id: _id, version: _v, ...body } = input;
  if (input.id) {
    const old = getRow(input.id);
    if (old.owner_id !== u.id) throw new Error("Csak a saját időzítésedet szerkesztheted.");
    // Editing always pauses the rule so the new timing needs a fresh confirmation.
    const r = d
      .prepare(
        "UPDATE scene_schedules SET body=?,scene_id=?,enabled=0,confirmed_scene_version=NULL,version=version+1,updated_at=? WHERE id=? AND version=?",
      )
      .run(JSON.stringify(body), input.sceneId, now, input.id, input.version ?? -1);
    if (!r.changes) throw new Error("Az időzítést közben módosították. Töltsd újra.");
    audit(u.id, "schedule-save", input.id);
    return input.id;
  }
  const id = crypto.randomUUID();
  d.prepare(
    "INSERT INTO scene_schedules(id,owner_id,scene_id,body,enabled,version,created_at,updated_at) VALUES(?,?,?,?,0,1,?,?)",
  ).run(id, u.id, input.sceneId, JSON.stringify(body), now, now);
  audit(u.id, "schedule-create", id);
  return id;
}
export function setScheduleEnabled(
  user: User,
  input: { id: string; version: number; enabled: boolean; confirmSceneVersion?: number | undefined },
  now = Date.now(),
) {
  const u = active(user),
    r = getRow(input.id);
  if (input.enabled) {
    if (r.owner_id !== u.id) throw new Error("Csak a saját időzítésedet kapcsolhatod be.");
    assertAuthor(u);
    const scene = getScene(r.scene_id);
    canRun(u, scene);
    if (hasLock(scene.steps)) throw new Error("Zárat tartalmazó jelenet nem időzíthető.");
    if (!schedulerAlive(now))
      throw new Error("A háttérütemező nem fut a NAS-on, ezért az időzítés nem kapcsolható be.");
    if (input.confirmSceneVersion !== scene.version)
      throw new Error("A jelenet közben változott. Nézd át újra az összefoglalót.");
  } else if (r.owner_id !== u.id && u.role !== "admin")
    throw new Error("Ezt az időzítést nem kezelheted.");
  const res = store()
    .prepare(
      "UPDATE scene_schedules SET enabled=?,enabled_at=?,confirmed_scene_version=?,version=version+1,updated_at=? WHERE id=? AND version=?",
    )
    .run(
      input.enabled ? 1 : 0,
      input.enabled ? now : r.enabled_at,
      input.enabled ? input.confirmSceneVersion! : r.confirmed_scene_version,
      now,
      r.id,
      input.version,
    );
  if (!res.changes) throw new Error("Az időzítést közben módosították. Töltsd újra.");
  audit(u.id, input.enabled ? "schedule-enable" : "schedule-pause", r.id);
}
export function deleteSchedule(user: User, id: string) {
  const u = active(user),
    r = getRow(id);
  if (r.owner_id !== u.id && u.role !== "admin") throw new Error("Ezt az időzítést nem törölheted.");
  store().prepare("DELETE FROM scene_schedules WHERE id=?").run(id);
  audit(u.id, "schedule-delete", id);
}

/** Single-instance guard across processes sharing the DB: only the lease holder may run slots. */
export function acquireLease(worker: string, now = Date.now()) {
  const d = store();
  d.prepare("INSERT OR IGNORE INTO scheduler_lease(id,owner,expires_at) VALUES(1,?,0)").run(worker);
  return (
    d
      .prepare("UPDATE scheduler_lease SET owner=?,expires_at=? WHERE id=1 AND (owner=? OR expires_at<?)")
      .run(worker, now + LEASE_MS, worker, now).changes === 1
  );
}
type Executor = (step: SceneStep, reauthorize: () => void) => Promise<void>;
function finish(r: Row, slot: string, status: string, message: string, runId: string | null, disable: boolean) {
  const d = store(),
    now = Date.now();
  d.prepare("UPDATE schedule_runs SET status=?,message=?,run_id=?,at=? WHERE rule_id=? AND slot=?").run(
    status,
    message,
    runId,
    now,
    r.id,
    slot,
  );
  d.prepare(
    `UPDATE scene_schedules SET last_status=?,last_message=?,last_at=?${disable ? ",enabled=0" : ""} WHERE id=?`,
  ).run(status, message, now, r.id);
}
async function execute(r: Row, slot: string, executor: Executor) {
  const owner = getUser(r.owner_id);
  const block = (msg: string) => finish(r, slot, "blocked", msg, null, true);
  if (!owner || owner.disabled || owner.role === "child") return block("A létrehozó fiók nem aktív; az időzítés leállt.");
  const scene = sceneOrNull(r.scene_id);
  if (!scene) return block("A céljelenetet törölték; az időzítés leállt.");
  if (scene.version !== r.confirmed_scene_version)
    return block("A jelenet megváltozott; nézd át és kapcsold be újra az időzítést.");
  if (hasLock(scene.steps)) return block("Zárat tartalmazó jelenet nem időzíthető.");
  try {
    canRun(owner, scene);
  } catch (e) {
    return block(e instanceof Error ? e.message : "Nincs jogosultság.");
  }
  try {
    const runId = await runScene(owner, r.scene_id, `sched:${r.id}:${slot}`, executor);
    const run = store().prepare("SELECT status FROM scene_runs WHERE id=?").get(runId) as { status: string };
    const status = ["accepted", "partial", "failed"].includes(run.status) ? run.status : "failed";
    finish(r, slot, status, "Részletek a jelenet futásnaplójában.", runId, false);
  } catch (e) {
    finish(r, slot, "failed", e instanceof Error ? e.message : "A jelenet nem indult el.", null, false);
  }
}
/** One scheduler pass. Safe to call concurrently: lease + UNIQUE(rule_id,slot) claim guarantee at most one run per slot. */
export async function tick(worker: string, executor: Executor, now = Date.now()) {
  if (!acquireLease(worker, now)) return { leader: false, ran: 0, missed: 0 };
  const d = store();
  // Claims left by a dead worker are never repeated (non-idempotent device commands).
  d.prepare("UPDATE schedule_runs SET status='interrupted',message='Újraindítás vagy kiesés miatt megszakadt; nem ismételjük.' WHERE status='claimed' AND worker<>?").run(worker);
  const rows = d.prepare("SELECT * FROM scene_schedules WHERE enabled=1").all() as Row[];
  let ran = 0,
    missed = 0;
  const today = budapestParts(now).date;
  for (const r of rows) {
    const body = rule(r);
    for (const day of [addDaysStr(today, -1), today]) {
      if (!occursOn(body, day)) continue;
      const at = budapestInstant(day, body.time);
      if (at === null || at > now || at < (r.enabled_at ?? now)) continue;
      const slot = `${day}T${body.time}`;
      const late = now - at > GRACE_MS;
      const claim = d
        .prepare("INSERT OR IGNORE INTO schedule_runs(rule_id,slot,due_at,status,message,worker,at) VALUES(?,?,?,?,?,?,?)")
        .run(r.id, slot, at, late ? "missed" : "claimed", late ? "Kiesés miatt kimaradt; nem pótoljuk." : "", worker, now);
      if (!claim.changes) continue;
      if (late) {
        missed++;
        d.prepare("UPDATE scene_schedules SET last_status='missed',last_message=?,last_at=? WHERE id=?").run("Kiesés miatt kimaradt; nem pótoljuk.", now, r.id);
      } else {
        ran++;
        acquireLease(worker, Date.now());
        await execute(r, slot, executor);
      }
      if (body.recurrence === "once") d.prepare("UPDATE scene_schedules SET enabled=0 WHERE id=?").run(r.id);
    }
  }
  return { leader: true, ran, missed };
}
