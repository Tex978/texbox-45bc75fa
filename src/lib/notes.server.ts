import { db, getUser, listUsers, listChildProfiles, userCan, type User } from "./auth.server";
import { itemInput, type FamilyItemInput } from "./notes-schema";
import { budapestToday } from "./task-schema";

// Family notes & matters: personal items are owner-only; family items are visible to adults and to
// child logins only when explicitly shared. Children never edit. Archive instead of delete.
const store = () => {
  const d = db();
  if (!d)
    throw new Error(
      "A jegyzetek és ügyek csak a saját NAS-on mentődnek; az előnézet nem ment semmit.",
    );
  return d;
};
const current = (user: User) => {
  const u = getUser(user.id);
  if (!u || u.disabled) throw new Error("Bejelentkezés szükséges.");
  return u;
};
const isParent = (u: User) => u.role !== "child" && userCan(u, "family");
type Row = {
  id: string;
  kind: "note" | "matter";
  owner_id: string;
  body: string;
  visibility: "personal" | "family";
  child_visible: number;
  pinned: number;
  archived: number;
  version: number;
  created_at: number;
  updated_by: string;
  updated_at: number;
};
const canSee = (u: User, r: Row) =>
  r.owner_id === u.id ||
  (r.visibility === "family" && (u.role !== "child" || r.child_visible === 1));
const canEdit = (u: User, r: Row) =>
  u.role !== "child" && (r.owner_id === u.id || (r.visibility === "family" && isParent(u)));
export function notePeople() {
  return [
    ...listUsers()
      .filter((p) => !p.disabled)
      .map((p) => ({ key: `user:${p.id}`, name: p.displayName, child: p.role === "child" })),
    ...listChildProfiles()
      .filter((p) => !p.disabled)
      .map((p) => ({ key: `profile:${p.id}`, name: p.displayName, child: true })),
  ];
}
function out(u: User, r: Row) {
  const body = JSON.parse(r.body) as Record<string, unknown>;
  const link = store()
    .prepare("SELECT template_id FROM matter_task_links WHERE note_id=?")
    .get(r.id) as { template_id: string } | undefined;
  return {
    ...(body as FamilyItemInput),
    id: r.id,
    kind: r.kind,
    version: r.version,
    visibility: r.visibility,
    childVisible: !!r.child_visible,
    pinned: !!r.pinned,
    archived: !!r.archived,
    ownerName: getUser(r.owner_id)?.displayName ?? "Ismeretlen",
    updatedByName: getUser(r.updated_by)?.displayName ?? "Ismeretlen",
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    mine: r.owner_id === u.id,
    editable: canEdit(u, r),
    taskId: link?.template_id ?? null,
  };
}
const row = (id: string) => {
  const r = store().prepare("SELECT * FROM family_notes WHERE id=?").get(id) as Row | undefined;
  if (!r) throw new Error("A jegyzet nem található.");
  return r;
};
const audit = (u: User, id: string, action: string) =>
  store()
    .prepare("INSERT INTO family_note_events(note_id,actor,action,at) VALUES(?,?,?,?)")
    .run(id, u.id, action, Date.now());
function tx<T>(fn: () => T): T {
  const d = store();
  d.exec("BEGIN IMMEDIATE");
  try {
    const r = fn();
    d.exec("COMMIT");
    return r;
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
}
export function listItems(user: User, input: { archived?: boolean | undefined } = {}) {
  const u = current(user);
  const rows = store()
    .prepare("SELECT * FROM family_notes WHERE archived=? ORDER BY pinned DESC, updated_at DESC")
    .all(input.archived ? 1 : 0) as Row[];
  // Unknown / foreign IDs never leak: filtering happens before mapping.
  const items = rows.filter((r) => canSee(u, r)).map((r) => out(u, r));
  const people = notePeople().filter((p) => u.role !== "child" || p.key === `user:${u.id}`);
  return { items, people, canCreate: u.role !== "child", today: budapestToday() };
}
export function saveItem(user: User, raw: FamilyItemInput) {
  return tx(() => {
    const u = current(user),
      v = itemInput.parse(raw);
    if (u.role === "child") throw new Error("Jegyzetet és ügyet felnőtt kezelhet.");
    if (v.visibility === "personal" && v.childVisible)
      throw new Error("Személyes elem nem osztható meg gyerekkel.");
    if (v.kind === "matter" && v.assignee) {
      if (!notePeople().some((p) => p.key === v.assignee)) throw new Error("Ismeretlen felelős.");
      if (v.visibility === "personal" && v.assignee !== `user:${u.id}`)
        throw new Error("Személyes ügy felelőse csak te lehetsz.");
    }
    const { id: _i, version: _v, visibility, childVisible, pinned, ...rest } = v;
    const body = JSON.stringify(rest),
      now = Date.now();
    if (!v.id) {
      const id = crypto.randomUUID();
      store()
        .prepare(
          "INSERT INTO family_notes(id,kind,owner_id,body,visibility,child_visible,pinned,archived,version,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,0,1,?,?,?)",
        )
        .run(
          id,
          v.kind,
          u.id,
          body,
          visibility,
          childVisible ? 1 : 0,
          pinned ? 1 : 0,
          now,
          u.id,
          now,
        );
      audit(u, id, "create");
      return id;
    }
    const old = row(v.id);
    if (!canSee(u, old) || !canEdit(u, old)) throw new Error("Ezt az elemet nem szerkesztheted.");
    if (old.kind !== v.kind) throw new Error("Az elem típusa nem változtatható.");
    // Only the owner may change who can see the item.
    if (
      old.owner_id !== u.id &&
      (visibility !== old.visibility || (childVisible ? 1 : 0) !== old.child_visible)
    )
      throw new Error("A láthatóságot csak a létrehozó módosíthatja.");
    const r = store()
      .prepare(
        "UPDATE family_notes SET body=?,visibility=?,child_visible=?,pinned=?,version=version+1,updated_by=?,updated_at=? WHERE id=? AND version=?",
      )
      .run(
        body,
        visibility,
        childVisible ? 1 : 0,
        pinned ? 1 : 0,
        u.id,
        now,
        v.id,
        v.version ?? -1,
      );
    if (!r.changes)
      throw new Error("Közben valaki más módosította. Töltsd újra, és próbáld meg ismét.");
    audit(u, v.id, "update");
    return v.id;
  });
}
export function setArchived(user: User, input: { id: string; version: number; archived: boolean }) {
  return tx(() => {
    const u = current(user),
      r = row(input.id);
    if (!canSee(u, r) || !canEdit(u, r)) throw new Error("Ezt az elemet nem kezelheted.");
    const res = store()
      .prepare(
        "UPDATE family_notes SET archived=?,version=version+1,updated_by=?,updated_at=? WHERE id=? AND version=?",
      )
      .run(input.archived ? 1 : 0, u.id, Date.now(), r.id, input.version);
    if (!res.changes) throw new Error("Közben valaki más módosította. Töltsd újra.");
    audit(u, r.id, input.archived ? "archive" : "restore");
  });
}
export function itemHistory(user: User, id: string) {
  const u = current(user),
    r = row(id);
  if (!canSee(u, r)) throw new Error("A jegyzet nem található.");
  return (
    store()
      .prepare(
        "SELECT actor,action,at FROM family_note_events WHERE note_id=? ORDER BY id DESC LIMIT 50",
      )
      .all(id) as { actor: string; action: string; at: number }[]
  ).map((e) => ({ ...e, actorName: getUser(e.actor)?.displayName ?? "Ismeretlen" }));
}
/** Explicit, idempotent: one Feladatok task per matter (PRIMARY KEY note_id), 0 points, via the tasks ACL.
 * Fully synchronous, so two clicks in the single Node process cannot interleave. */
export function matterToTask(user: User, id: string, saveTask: (u: User, input: never) => string) {
  const u = current(user),
    r = row(id);
  if (r.kind !== "matter" || !canSee(u, r) || !canEdit(u, r))
    throw new Error("Ebből az ügyből nem hozhatsz létre feladatot.");
  const existing = store()
    .prepare("SELECT template_id FROM matter_task_links WHERE note_id=?")
    .get(id) as { template_id: string } | undefined;
  if (existing) return { taskId: existing.template_id, created: false };
  const m = JSON.parse(r.body) as {
    title: string;
    content: string;
    assignee: string | null;
    due: string | null;
    priority: "low" | "normal" | "high";
  };
  const taskId = saveTask(u, {
    title: m.title,
    description: m.content.slice(0, 2000),
    category: "Ügyintézés",
    points: 0,
    visibility: r.visibility,
    assignee: m.assignee ?? (r.visibility === "personal" ? `user:${u.id}` : null),
    start: m.due ?? budapestToday(),
    end: null,
    time: "18:00",
    priority: m.priority,
    reminder: false,
    recurrence: "once",
    weekdays: [],
    dates: [],
  } as never);
  store()
    .prepare("INSERT INTO matter_task_links(note_id,template_id,created_by,at) VALUES(?,?,?,?)")
    .run(id, taskId, u.id, Date.now());
  audit(u, id, "task");
  return { taskId, created: true };
}
