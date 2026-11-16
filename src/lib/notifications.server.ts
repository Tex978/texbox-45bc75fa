import { db, getUser, listUsers, userCan, type User } from "./auth.server";
import {
  DEFAULT_SETTINGS,
  LINKS,
  settingsSchema,
  type NotificationKind,
  type NotificationSettings,
} from "./notification-schema";
import { budapestInstant, budapestParts, addDaysStr } from "./schedule-schema";

// Personal in-app inbox. Recipients are login accounts only; UNIQUE(recipient,source,event) makes every
// emission idempotent across retries, parallel decisions and restarts.
export const REMINDER_GRACE_MS = 10 * 60_000;
const store = () => {
  const d = db();
  if (!d)
    throw new Error("Az értesítések csak a saját NAS-on tárolódnak; az előnézet nem mutat értesítést.");
  return d;
};
const active = (user: User) => {
  const u = getUser(user.id);
  if (!u || u.disabled) throw new Error("Bejelentkezés szükséges.");
  return u;
};
export function settingsOf(userId: string): NotificationSettings & { version: number } {
  const r = db()
    ?.prepare("SELECT body,version FROM notification_settings WHERE user_id=?")
    .get(userId) as { body: string; version: number } | undefined;
  if (!r) return { ...DEFAULT_SETTINGS, version: 0 };
  const p = settingsSchema.safeParse(JSON.parse(r.body));
  return { ...(p.success ? p.data : DEFAULT_SETTINGS), version: r.version };
}
export const parents = () =>
  listUsers().filter((u) => !u.disabled && u.role !== "child" && userCan(u, "family"));
/** Never throws: a notification failure must not roll back the business transaction it rides in. */
export function emit(
  recipientId: string,
  n: { kind: NotificationKind; source: string; event: string; title: string; body?: string; link: (typeof LINKS)[number] },
  now = Date.now(),
) {
  try {
    const u = getUser(recipientId);
    if (!u || u.disabled || !settingsOf(u.id)[n.kind]) return false;
    return (
      store()
        .prepare(
          "INSERT OR IGNORE INTO notifications(recipient,kind,source,event,title,body,link,created_at) VALUES(?,?,?,?,?,?,?,?)",
        )
        .run(u.id, n.kind, n.source, n.event, n.title.slice(0, 120), (n.body ?? "").slice(0, 300), n.link, now)
        .changes === 1
    );
  } catch (e) {
    console.error("notification emit failed", (e as Error).message);
    return false;
  }
}
const nameOf = (key: string) => {
  if (key.startsWith("user:")) return getUser(key.slice(5))?.displayName ?? "Családtag";
  const r = db()?.prepare("SELECT display_name FROM child_profiles WHERE id=?").get(key.slice(8)) as
    | { display_name: string }
    | undefined;
  return r?.display_name ?? "Gyermek";
};
/** Notify the decision subject: the login account itself, or for managed profiles the other parents. */
function toSubject(personKey: string, actorId: string, n: Parameters<typeof emit>[1]) {
  if (personKey.startsWith("user:")) {
    if (personKey.slice(5) !== actorId) emit(personKey.slice(5), n);
  } else for (const p of parents()) if (p.id !== actorId) emit(p.id, n);
}
export function notifyTask(
  actor: User,
  o: { id: string; title: string; assignee: string | null; version: number; points: number },
  status: string,
  reason: string,
) {
  if (!o.assignee) return;
  const who = nameOf(o.assignee);
  if (status === "pending")
    for (const p of parents())
      if (p.id !== actor.id)
        emit(p.id, {
          kind: "approval",
          source: `task:${o.id}`,
          event: `pending:${o.version}`,
          title: `${who} teljesítette: ${o.title}`,
          body: o.points ? `${o.points} pont jóváhagyásra vár.` : "Jóváhagyásra vár.",
          link: "/tasks",
        });
  const labels: Record<string, string> = { approved: "jóváhagyva", returned: "visszaküldve", rejected: "elutasítva" };
  if (labels[status])
    toSubject(o.assignee, actor.id, {
      kind: "task",
      source: `task:${o.id}`,
      event: `${status}:${o.version}`,
      title: `${o.title}: ${labels[status]}`,
      body: o.assignee.startsWith("profile:") ? `${who} feladata.${reason ? ` ${reason}` : ""}` : reason,
      link: "/tasks",
    });
}
export function notifyRedemption(
  actor: User,
  r: { id: string; rewardName: string; personKey: string },
  status: string,
  reason = "",
) {
  const who = nameOf(r.personKey);
  if (status === "reserved")
    for (const p of parents())
      if (p.id !== actor.id)
        emit(p.id, {
          kind: "approval",
          source: `redeem:${r.id}`,
          event: "reserved",
          title: `${who} jutalmat kér: ${r.rewardName}`,
          body: "A pontok lefoglalva, döntésre vár.",
          link: "/rewards",
        });
  const labels: Record<string, string> = { awaiting: "jóváhagyva", rejected: "elutasítva", handed: "átadva" };
  if (labels[status])
    toSubject(r.personKey, actor.id, {
      kind: "reward",
      source: `redeem:${r.id}`,
      event: status,
      title: `${r.rewardName}: ${labels[status]}`,
      body: r.personKey.startsWith("profile:") ? `${who} kérése.${reason ? ` ${reason}` : ""}` : reason,
      link: "/rewards",
    });
}

export type InboxFilter = "all" | "unread" | NotificationKind;
export function inbox(user: User, filter: InboxFilter = "all") {
  const u = active(user),
    d = store();
  const where =
    filter === "unread" ? " AND read_at IS NULL" : filter === "all" ? "" : " AND kind=?";
  const args = filter === "all" || filter === "unread" ? [u.id] : [u.id, filter];
  const items = d
    .prepare(
      `SELECT id,kind,title,body,link,created_at createdAt,read_at readAt FROM notifications WHERE recipient=?${where} ORDER BY id DESC LIMIT 100`,
    )
    .all(...args) as { id: number; kind: NotificationKind; title: string; body: string; link: string; createdAt: number; readAt: number | null }[];
  const unread = (
    d.prepare("SELECT count(*) c FROM notifications WHERE recipient=? AND read_at IS NULL").get(u.id) as { c: number }
  ).c;
  return { items, unread };
}
export function unreadCount(user: User) {
  const u = active(user);
  return (
    store().prepare("SELECT count(*) c FROM notifications WHERE recipient=? AND read_at IS NULL").get(u.id) as {
      c: number;
    }
  ).c;
}
/** Only the recipient's own rows are touched; foreign IDs are silently not matched (count tells). */
export function markRead(user: User, input: { ids?: number[] | undefined; all?: boolean | undefined; read?: boolean | undefined }) {
  const u = active(user),
    d = store(),
    at = input.read === false ? null : Date.now();
  if (input.all)
    return d.prepare("UPDATE notifications SET read_at=? WHERE recipient=? AND read_at IS NULL").run(at, u.id).changes;
  let n = 0;
  for (const id of input.ids ?? [])
    n += d.prepare("UPDATE notifications SET read_at=? WHERE id=? AND recipient=?").run(at, id, u.id).changes;
  return n;
}
export function saveSettings(user: User, input: { version: number; settings: NotificationSettings }) {
  const u = active(user),
    s = settingsSchema.parse(input.settings),
    d = store();
  d.exec("BEGIN IMMEDIATE");
  try {
    const cur = settingsOf(u.id).version;
    if (cur !== input.version) throw new Error("A beállítást közben máshol módosították. Töltsd újra.");
    d.prepare(
      "INSERT INTO notification_settings(user_id,body,version,updated_at) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET body=excluded.body,version=excluded.version,updated_at=excluded.updated_at",
    ).run(u.id, JSON.stringify(s), cur + 1, Date.now());
    d.exec("COMMIT");
    return cur + 1;
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
}

/** Background reminders, run only by the scheduler lease holder. Missed windows are skipped (no spam). */
export async function reminderTick(now = Date.now()) {
  const { calendarRange } = await import("./calendar.server");
  const { listTasks } = await import("./tasks.server");
  let sent = 0;
  const today = budapestParts(now).date;
  for (const u of listUsers().filter((v) => !v.disabled)) {
    const s = settingsOf(u.id),
      lead = s.leadMinutes * 60_000;
    const due = (date: string, time: string) => {
      const start = budapestInstant(date, time);
      if (start === null || start <= now) return false;
      const at = start - lead;
      return at <= now && now - at <= REMINDER_GRACE_MS;
    };
    if (s.calendar)
      try {
        const me = `user:${u.id}`;
        for (const o of calendarRange(u, { from: today, to: addDaysStr(today, 2) }).occurrences)
          if (o.remind && (o.people.length === 0 || o.people.includes(me)) && due(o.date, o.allDay ? "00:00" : o.start))
            sent += +emit(u.id, {
              kind: "calendar",
              source: `cal:${o.key}`,
              event: "remind",
              title: `Közelgő: ${o.title}`,
              body: `${o.date}${o.allDay ? ", egész nap" : ` ${o.start}`}${o.location ? ` · ${o.location}` : ""}`,
              link: "/organizer",
            });
      } catch (e) {
        console.error("calendar reminder failed", (e as Error).message);
      }
    if (s.task)
      try {
        const v = listTasks(u, new Date(now));
        for (const o of v.occurrences)
          if (
            o.body.reminder &&
            o.assignee === v.me &&
            ["open", "claimed", "returned"].includes(o.status) &&
            due(o.date, o.body.time || "18:00")
          )
            sent += +emit(u.id, {
              kind: "task",
              source: `task:${o.id}`,
              event: "remind",
              title: `Határidő közeleg: ${o.body.title}`,
              body: `${o.date} ${o.body.time || "18:00"}`,
              link: "/tasks",
            });
      } catch (e) {
        console.error("task reminder failed", (e as Error).message);
      }
  }
  return sent;
}
