import { db, getUser, listUsers, listChildProfiles, userCan, type User } from "./auth.server";
import { creditTask } from "./points.server";
import { notifyTask } from "./notifications.server";
import {
  addDays,
  budapestToday,
  occursOn,
  taskSchema,
  type TaskInput,
  type TaskTemplate,
  type TaskOccurrence,
  type TaskStatus,
} from "./task-schema";

const store = () => {
  const d = db();
  if (!d)
    throw new Error(
      "A feladatok a saját Synology NAS-on érhetők el; az előnézet nem éri el a család feladatait.",
    );
  return d;
};
function current(user: User) {
  const u = getUser(user.id);
  if (!u || u.disabled) throw new Error("Bejelentkezés szükséges.");
  return u;
}
export const isParent = (u: User) => u.role !== "child" && userCan(u, "family");
const personKey = (id: string) => `user:${id}`;
export function taskPeople(user: User) {
  const u = current(user);
  return [
    ...listUsers()
      .filter((p) => !p.disabled)
      .map((p) => ({ key: personKey(p.id), name: p.displayName, child: p.role === "child" })),
    ...listChildProfiles()
      .filter((p) => !p.disabled)
      .map((p) => ({ key: `profile:${p.id}`, name: p.displayName, child: true })),
  ].filter((p) => isParent(u) || p.key === personKey(u.id));
}
function person(key: string) {
  const [kind, id, extra] = key.split(":");
  if (!id || extra) throw new Error("Ismeretlen családtag.");
  if (kind === "user") {
    const u = getUser(id);
    if (u && !u.disabled) return { child: u.role === "child" };
  }
  if (kind === "profile" && listChildProfiles().some((p) => p.id === id && !p.disabled))
    return { child: true };
  throw new Error("Ismeretlen vagy inaktív családtag.");
}
function tx<T>(fn: () => T): T {
  const d = store();
  d.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    d.exec("COMMIT");
    return result;
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
}
function templates(): TaskTemplate[] {
  return (
    store().prepare("SELECT * FROM task_templates ORDER BY updated_at DESC").all() as {
      id: string;
      owner_id: string;
      body: string;
      version: number;
      archived: number;
    }[]
  ).map((r) => ({
    ...taskSchema.parse(JSON.parse(r.body)),
    id: r.id,
    owner: r.owner_id,
    version: r.version,
    archived: !!r.archived,
  }));
}
const visible = (u: User, t: TaskInput & { owner: string }, assignee = t.assignee) =>
  t.owner === u.id ||
  assignee === personKey(u.id) ||
  (isParent(u) &&
    !!assignee &&
    (assignee.startsWith("profile:") ||
      (assignee.startsWith("user:") && getUser(assignee.slice(5))?.role === "child"))) ||
  (t.visibility === "family" && (isParent(u) || !assignee));
const editable = (u: User, t: TaskTemplate) =>
  isParent(u) && (t.owner === u.id || t.visibility === "family");
export function saveTask(user: User, raw: TaskInput) {
  return tx(() => {
    const u = current(user),
      input = taskSchema.parse(raw);
    if (!isParent(u)) throw new Error("Csak jogosult szülő szerkeszthet feladatot és pontértéket.");
    if (input.assignee) person(input.assignee);
    if (input.visibility === "personal" && !input.assignee)
      throw new Error("Személyes feladathoz válassz felelőst.");
    const old = input.id ? templates().find((t) => t.id === input.id) : null;
    if (input.id && (!old || !editable(u, old)))
      throw new Error("Nem szerkesztheted ezt a feladatot.");
    const id = old?.id ?? crypto.randomUUID();
    if (old) {
      const result = store()
        .prepare(
          "UPDATE task_templates SET body=?,version=version+1,cursor=?,updated_at=? WHERE id=? AND version=? AND archived=0",
        )
        .run(JSON.stringify(input), input.start, Date.now(), id, input.version ?? -1);
      if (!result.changes) throw new Error("A sablont közben módosították. Töltsd újra.");
      // Past/claimed/completed occurrences are immutable snapshots. Only future open instances change.
      store()
        .prepare(
          "DELETE FROM task_occurrences WHERE template_id=? AND due_date>? AND status='open' AND NOT EXISTS(SELECT 1 FROM task_events WHERE occurrence_id=task_occurrences.id)",
        )
        .run(id, budapestToday());
    } else
      store()
        .prepare("INSERT INTO task_templates VALUES(?,?,?,?,?,?,?)")
        .run(id, u.id, JSON.stringify(input), 1, 0, input.start, Date.now());
    store()
      .prepare("INSERT INTO audit_log(user_id,action,target,at) VALUES(?,?,?,?)")
      .run(u.id, "task-save", id, Date.now());
    return id;
  });
}
export function archiveTask(user: User, id: string, version: number) {
  return tx(() => {
    const u = current(user),
      t = templates().find((v) => v.id === id);
    if (!t || !editable(u, t)) throw new Error("Nem törölheted ezt a sablont.");
    if (
      !store()
        .prepare("UPDATE task_templates SET archived=1,version=version+1 WHERE id=? AND version=?")
        .run(id, version).changes
    )
      throw new Error("A sablon közben megváltozott.");
    const rows = store()
      .prepare(
        "SELECT id FROM task_occurrences WHERE template_id=? AND status IN ('open','claimed','returned')",
      )
      .all(id) as { id: string }[];
    for (const r of rows) {
      store()
        .prepare("UPDATE task_occurrences SET status='cancelled',version=version+1 WHERE id=?")
        .run(r.id);
      event(u, r.id, "cancelled", "Sablon törölve");
    }
    store()
      .prepare("INSERT INTO audit_log(user_id,action,target,at) VALUES(?,?,?,?)")
      .run(u.id, "task-archive", id, Date.now());
  });
}
function generate(today: string) {
  const horizon = addDays(today, 7),
    d = store();
  let backlog = false;
  for (const t of templates().filter((v) => !v.archived)) {
    const row = d.prepare("SELECT cursor FROM task_templates WHERE id=?").get(t.id) as {
      cursor: string;
    };
    let date = row.cursor,
      n = 0;
    while (date <= horizon && n++ < 366) {
      if (occursOn(t, date))
        d.prepare(
          "INSERT OR IGNORE INTO task_occurrences(id,template_id,due_date,body,assignee,status,version,reason) VALUES(?,?,?,?,?,'open',1,'')",
        ).run(crypto.randomUUID(), t.id, date, JSON.stringify(t), t.assignee);
      date = addDays(date, 1);
    }
    d.prepare("UPDATE task_templates SET cursor=? WHERE id=?").run(date, t.id);
    if (date <= horizon) backlog = true;
  }
  return backlog;
}
function occurrence(id: string): TaskOccurrence {
  const r = store().prepare("SELECT * FROM task_occurrences WHERE id=?").get(id) as
    | {
        id: string;
        template_id: string;
        due_date: string;
        body: string;
        assignee: string | null;
        status: TaskStatus;
        version: number;
        reason: string;
      }
    | undefined;
  if (!r) throw new Error("A feladat nem található.");
  return {
    id: r.id,
    templateId: r.template_id,
    date: r.due_date,
    body: taskSchema.parse(JSON.parse(r.body)),
    assignee: r.assignee,
    status: r.status,
    version: r.version,
    reason: r.reason,
    events: store()
      .prepare("SELECT actor,action,reason,at FROM task_events WHERE occurrence_id=? ORDER BY id")
      .all(id) as TaskOccurrence["events"],
  };
}
export function listTasks(user: User, now = new Date()) {
  return tx(() => {
    const u = current(user),
      today = budapestToday(now),
      backlog = generate(today),
      ts = templates();
    const rows = store()
      .prepare(
        "SELECT id FROM task_occurrences WHERE due_date<=? AND (status IN ('open','claimed','pending','returned') OR due_date>=?) ORDER BY due_date,status",
      )
      .all(addDays(today, 7), addDays(today, -7)) as { id: string }[];
    return {
      today,
      backlog,
      parent: isParent(u),
      me: personKey(u.id),
      people: taskPeople(u),
      templates: ts.filter((t) => visible(u, t)).map((t) => ({ ...t, editable: editable(u, t) })),
      occurrences: rows
        .map((r) => occurrence(r.id))
        .filter((o) => {
          const t = ts.find((v) => v.id === o.templateId);
          return t && visible(u, { ...t, ...o.body }, o.assignee);
        }),
    };
  });
}
function event(u: User, id: string, action: string, reason = "") {
  store()
    .prepare("INSERT INTO task_events(occurrence_id,actor,action,reason,at) VALUES(?,?,?,?,?)")
    .run(id, u.id, action, reason, Date.now());
}
export function actOnTask(
  user: User,
  input: {
    id: string;
    version: number;
    action: "claim" | "complete" | "approve" | "return" | "reject" | "cancel";
    person?: string | undefined;
    reason?: string | undefined;
  },
) {
  return tx(() => {
    const u = current(user),
      o = occurrence(input.id),
      t = templates().find((v) => v.id === o.templateId),
      parent = isParent(u);
    if (!t || !visible(u, { ...t, ...o.body }, o.assignee))
      throw new Error("Nem láthatod ezt a feladatot.");
    let status: TaskStatus,
      assignee = o.assignee;
    const target = input.person ?? personKey(u.id);
    if (input.action === "claim") {
      if (t.archived) throw new Error("A feladatsablon már törölt.");
      person(target);
      if (target !== personKey(u.id) && !parent)
        throw new Error("Más nevében nem vállalhatsz feladatot.");
      if (o.status !== "open" || o.assignee)
        throw new Error("A feladat már ki van osztva vagy elvállalták.");
      assignee = target;
      status = "claimed";
    } else if (input.action === "complete") {
      if (!assignee || (assignee !== personKey(u.id) && !parent))
        throw new Error("Más feladatát nem teljesítheted.");
      if (!["open", "claimed", "returned"].includes(o.status))
        throw new Error("Ezt a feladatot már teljesítették vagy lezárták.");
      status = person(assignee).child ? "pending" : "approved";
    } else {
      if (!parent) throw new Error("Csak szülő dönthet a feladatról.");
      if (input.action !== "cancel" && o.status !== "pending")
        throw new Error("A feladat már elbírált vagy nem vár jóváhagyásra.");
      if (input.action === "cancel" && ["approved", "rejected", "cancelled"].includes(o.status))
        throw new Error("A feladat már lezárt.");
      status =
        input.action === "approve"
          ? "approved"
          : input.action === "return"
            ? "returned"
            : input.action === "reject"
              ? "rejected"
              : "cancelled";
    }
    const reason = (input.reason ?? "").trim().slice(0, 1000);
    if (["returned", "rejected"].includes(status) && !reason)
      throw new Error("A döntéshez indok szükséges.");
    const result = store()
      .prepare(
        "UPDATE task_occurrences SET status=?,assignee=?,reason=?,version=version+1 WHERE id=? AND version=?",
      )
      .run(status, assignee, reason, o.id, input.version);
    if (!result.changes) throw new Error("A feladat közben megváltozott. Töltsd újra.");
    if (status === "approved" && assignee)
      store()
        .prepare(
          "INSERT INTO task_approvals(occurrence_id,person_key,points,approved_by,approved_at) VALUES(?,?,?,?,?)",
        )
        .run(o.id, assignee, o.body.points, u.id, Date.now());
    if (status === "approved" && assignee) creditTask(o.id);
    event(u, o.id, status, reason);
    notifyTask(
      u,
      { id: o.id, title: o.body.title, assignee, version: input.version + 1, points: o.body.points },
      status,
      reason,
    );
    return occurrence(o.id);
  });
}
