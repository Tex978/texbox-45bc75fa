import { db, getUser, listUsers, listChildProfiles, type User } from "./auth.server";
import { addDays, budapestToday, dateSchema } from "./task-schema";
import { saveTask } from "./tasks.server";
import { eventSchema, occursOn, type CalEvent, type EventInput } from "./calendar-schema";

const store = () => {
  const d = db();
  if (!d)
    throw new Error(
      "A családi naptár csak a saját Synology NAS-on ment; az előnézet nem éri el az eseményeket.",
    );
  return d;
};
function current(user: User) {
  const u = getUser(user.id);
  if (!u || u.disabled) throw new Error("Bejelentkezés szükséges.");
  return u;
}
const adult = (u: User) => u.role !== "child";
const me = (u: User) => `user:${u.id}`;
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
const audit = (u: User, action: string, target: string) =>
  store()
    .prepare("INSERT INTO audit_log(user_id,action,target,at) VALUES(?,?,?,?)")
    .run(u.id, action, target, Date.now());
export function calendarPeople() {
  return [
    ...listUsers()
      .filter((p) => !p.disabled)
      .map((p) => ({ key: `user:${p.id}`, name: p.displayName, child: p.role === "child" })),
    ...listChildProfiles()
      .filter((p) => !p.disabled)
      .map((p) => ({ key: `profile:${p.id}`, name: p.displayName, child: true })),
  ];
}
type Row = { id: string; body: string; archived: number; version: number; created_by: string };
type Stored = CalEvent & { id: string; version: number; archived: boolean; owner: string };
const out = (r: Row): Stored => ({
  ...eventSchema.parse(JSON.parse(r.body)),
  id: r.id,
  version: r.version,
  archived: !!r.archived,
  owner: r.created_by,
});
/**
 * Adults see every family event and private events they own or are listed in.
 * Child logins see only events listing them or whole-family (nobody listed) family events.
 */
function canSee(u: User, e: Stored) {
  if (e.owner === u.id || e.people.includes(me(u))) return true;
  if (e.visibility === "private") return false;
  return adult(u) || e.people.length === 0;
}
const canEdit = (u: User, e: Stored) =>
  adult(u) && (e.visibility === "family" || e.owner === u.id || e.people.includes(me(u)));
function event(id: string) {
  const r = store().prepare("SELECT * FROM calendar_events WHERE id=?").get(id) as Row | undefined;
  if (!r) throw new Error("Az esemény nem található.");
  return out(r);
}
export function saveEvent(user: User, raw: EventInput & { archived?: boolean | undefined }) {
  return tx(() => {
    const u = current(user),
      e = eventSchema.parse(raw);
    if (!adult(u)) throw new Error("Naptáreseményt felnőtt családtag kezelhet.");
    const known = calendarPeople().map((p) => p.key);
    if (e.people.some((k) => !known.includes(k)))
      throw new Error("Ismeretlen vagy inaktív családtag.");
    const body = JSON.stringify({ ...e, id: undefined, version: undefined }),
      now = Date.now();
    if (!e.id) {
      const id = crypto.randomUUID();
      store()
        .prepare("INSERT INTO calendar_events VALUES(?,?,0,1,?,?,?)")
        .run(id, body, u.id, now, now);
      audit(u, "calendar-create", id);
      return id;
    }
    const old = event(e.id);
    if (!canEdit(u, old)) throw new Error("Ezt az eseményt nem szerkesztheted.");
    if (
      !store()
        .prepare(
          "UPDATE calendar_events SET body=?,archived=?,version=version+1,updated_at=? WHERE id=? AND version=?",
        )
        .run(body, raw.archived ? 1 : 0, now, e.id, e.version ?? -1).changes
    )
      throw new Error("Az eseményt közben más módosította. Töltsd újra.");
    audit(u, raw.archived ? "calendar-archive" : "calendar-update", e.id);
    return e.id;
  });
}
/** Skip or move one occurrence of a series (keyed by its original date; repeatable and idempotent). */
export function changeOccurrence(
  user: User,
  input: {
    id: string;
    date: string;
    action: "skip" | "move" | "restore";
    newDate?: string | undefined;
  },
) {
  return tx(() => {
    const u = current(user),
      e = event(input.id),
      date = dateSchema.parse(input.date);
    if (!canEdit(u, e)) throw new Error("Ezt az eseményt nem szerkesztheted.");
    if (!occursOn(e, date)) throw new Error("Ezen a napon nincs ilyen előfordulás.");
    if (input.action === "restore")
      store()
        .prepare("DELETE FROM calendar_exceptions WHERE event_id=? AND orig_date=?")
        .run(e.id, date);
    else {
      const nd = input.action === "move" ? dateSchema.parse(input.newDate) : null;
      store()
        .prepare(
          "INSERT INTO calendar_exceptions VALUES(?,?,?,?,?,?) ON CONFLICT(event_id,orig_date) DO UPDATE SET kind=excluded.kind,new_date=excluded.new_date,actor=excluded.actor,at=excluded.at",
        )
        .run(e.id, date, input.action, nd, u.id, Date.now());
    }
    audit(u, `calendar-occurrence-${input.action}`, `${e.id}:${date}`);
  });
}
export type Occurrence = {
  key: string;
  eventId: string;
  origDate: string;
  date: string;
  endDate: string;
  title: string;
  description: string;
  type: CalEvent["type"];
  location: string;
  allDay: boolean;
  start: string;
  end: string;
  people: string[];
  remind: boolean;
  recurring: boolean;
  moved: boolean;
  taskId: string | null;
  editable: boolean;
};
export function calendarRange(
  user: User,
  input: { from: string; to: string; person?: string | undefined },
  now = new Date(),
) {
  const u = current(user),
    from = dateSchema.parse(input.from),
    to = dateSchema.parse(input.to);
  if (to < from || Math.round((Date.parse(to) - Date.parse(from)) / 86400000) > 62)
    throw new Error("Legfeljebb 62 napos időszak kérhető.");
  const d = store();
  const events = (d.prepare("SELECT * FROM calendar_events WHERE archived=0").all() as Row[])
    .map(out)
    .filter((e) => canSee(u, e));
  const exc = d.prepare("SELECT * FROM calendar_exceptions").all() as {
    event_id: string;
    orig_date: string;
    kind: string;
    new_date: string | null;
  }[];
  const links = d
    .prepare("SELECT event_id,orig_date,template_id FROM calendar_task_links")
    .all() as { event_id: string; orig_date: string; template_id: string }[];
  const occ: Occurrence[] = [];
  // Scan a 31-day margin before `from` so moved occurrences landing in range still appear.
  for (let day = addDays(from, -31); day <= addDays(to, 31); day = addDays(day, 1))
    for (const e of events) {
      if (!occursOn(e, day)) continue;
      const x = exc.find((v) => v.event_id === e.id && v.orig_date === day);
      if (x?.kind === "skip") continue;
      const date = x?.new_date ?? day;
      if (date < from || date > to) continue;
      const span = e.endDate
        ? Math.round((Date.parse(e.endDate) - Date.parse(e.date)) / 86400000)
        : 0;
      occ.push({
        key: `${e.id}:${day}`,
        eventId: e.id,
        origDate: day,
        date,
        endDate: addDays(date, span),
        title: e.title,
        description: e.description,
        type: e.type,
        location: e.location,
        allDay: e.allDay,
        start: e.start,
        end: e.end,
        people: e.people,
        remind: e.remind,
        recurring: e.recurrence !== "once",
        moved: !!x,
        taskId: links.find((l) => l.event_id === e.id && l.orig_date === day)?.template_id ?? null,
        editable: canEdit(u, e),
      });
    }
  const filtered = input.person
    ? occ.filter((o) => o.people.includes(input.person!) || o.people.length === 0)
    : occ;
  filtered.sort(
    (a, b) =>
      (a.date + (a.allDay ? "00:00" : a.start)).localeCompare(
        b.date + (b.allDay ? "00:00" : b.start),
      ) || a.key.localeCompare(b.key),
  );
  const people = calendarPeople().filter((p) => adult(u) || p.key === me(u));
  return {
    today: budapestToday(now),
    me: me(u),
    canCreate: adult(u),
    people,
    occurrences: filtered,
    events: events.map((e) => ({ ...e, editable: canEdit(u, e) })).filter((e) => e.editable),
  };
}
/**
 * One-off task for one occurrence with 0 points (parents set points later in Tasks; nothing is credited here).
 * The (event, original date) primary key makes repeated clicks return the same task.
 */
export function eventToTask(
  user: User,
  input: { id: string; date: string; assignee: string | null },
) {
  const u = current(user),
    e = event(input.id),
    date = dateSchema.parse(input.date);
  if (!canSee(u, e) || !canEdit(u, e))
    throw new Error("Ebből az eseményből nem hozhatsz létre feladatot.");
  if (!occursOn(e, date)) throw new Error("Ezen a napon nincs ilyen előfordulás.");
  const existing = store()
    .prepare("SELECT template_id FROM calendar_task_links WHERE event_id=? AND orig_date=?")
    .get(e.id, date) as { template_id: string } | undefined;
  if (existing) return { taskId: existing.template_id, created: false };
  const x = store()
    .prepare(
      "SELECT new_date FROM calendar_exceptions WHERE event_id=? AND orig_date=? AND kind='move'",
    )
    .get(e.id, date) as { new_date: string } | undefined;
  // saveTask runs its own transaction and enforces the parent rule; all steps are synchronous in the single NAS process.
  const taskId = saveTask(u, {
    title: e.title.slice(0, 120),
    description: `Naptárból: ${e.title}${e.location ? ` – ${e.location}` : ""}`.slice(0, 2000),
    category: "Naptár",
    points: 0,
    visibility: input.assignee ? "personal" : "family",
    assignee: input.assignee,
    start: x?.new_date ?? date,
    end: null,
    time: e.allDay ? "18:00" : e.start,
    priority: "normal",
    reminder: false,
    recurrence: "once",
    weekdays: [],
    dates: [],
  });
  store()
    .prepare("INSERT INTO calendar_task_links VALUES(?,?,?,?,?)")
    .run(e.id, date, taskId, u.id, Date.now());
  audit(u, "calendar-task", `${e.id}:${date}`);
  return { taskId, created: true };
}
