import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertCircle, Bell, CheckCheck, RefreshCw } from "lucide-react";
import { Button } from "./ui/button";
import {
  notificationsList,
  notificationsMark,
  notificationSettingsSave,
} from "@/lib/notifications.functions";
import {
  KIND_LABELS,
  LEAD_LABELS,
  LEAD_OPTIONS,
  NOTIFICATION_KINDS,
  type NotificationSettings,
} from "@/lib/notification-schema";
import type { InboxFilter } from "@/lib/notifications.server";

const filters: { id: InboxFilter; label: string }[] = [
  { id: "all", label: "Összes" },
  { id: "unread", label: "Olvasatlan" },
  ...NOTIFICATION_KINDS.map((k) => ({ id: k, label: KIND_LABELS[k] })),
];
const when = (ms: number) =>
  new Date(ms).toLocaleString("hu-HU", {
    timeZone: "Europe/Budapest",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
export function Notifications() {
  const [filter, setFilter] = useState<InboxFilter>("all");
  const qc = useQueryClient();
  const list = useServerFn(notificationsList),
    mark = useServerFn(notificationsMark),
    saveSettings = useServerFn(notificationSettingsSave);
  const q = useQuery({
    queryKey: ["notifications", filter],
    queryFn: () => list({ data: { filter } }),
    retry: false,
    refetchInterval: 30000,
  });
  const [draft, setDraft] = useState<NotificationSettings | null>(null),
    [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (q.data && !draft) {
      const { version: _v, ...s } = q.data.settings;
      setDraft(s);
    }
  }, [q.data, draft]);
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["notifications"] }),
      qc.invalidateQueries({ queryKey: ["notifications-unread"] }),
    ]);
  async function act(fn: () => Promise<unknown>, ok?: string) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      if (ok) setMsg({ text: ok });
      await refresh();
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "A művelet nem sikerült.", bad: true });
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="notif-page">
      <div className="notif-filters" role="tablist" aria-label="Szűrők">
        {filters.map((f) => (
          <Button
            key={f.id}
            size="sm"
            role="tab"
            aria-selected={filter === f.id}
            variant={filter === f.id ? "default" : "outline"}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </Button>
        ))}
      </div>
      {q.isPending ? (
        <div className="dash-skeleton" aria-label="Betöltés">
          <span />
          <span />
        </div>
      ) : q.error ? (
        <div className="dash-error" role="status">
          <AlertCircle size={16} />
          <span>{q.error.message}</span>
          <Button variant="ghost" size="sm" onClick={() => void q.refetch()}>
            <RefreshCw size={14} /> Újra
          </Button>
        </div>
      ) : (
        <>
          <div className="notif-bar">
            <span>{q.data.unread} olvasatlan</span>
            <Button
              size="sm"
              variant="outline"
              disabled={busy || !q.data.unread}
              onClick={() => void act(() => mark({ data: { all: true } }), "Mind olvasott.")}
            >
              <CheckCheck size={14} /> Mind olvasott
            </Button>
          </div>
          {q.data.items.length ? (
            <ul className="notif-list">
              {q.data.items.map((n) => (
                <li key={n.id} className={n.readAt ? "" : "is-unread"}>
                  <div className="min-w-0">
                    <small>
                      {KIND_LABELS[n.kind]} · {when(n.createdAt)}
                    </small>
                    <strong>{n.title}</strong>
                    {n.body && <p>{n.body}</p>}
                  </div>
                  <div className="notif-actions">
                    <Link
                      to={n.link as "/tasks"}
                      className="dash-link"
                      onClick={() =>
                        !n.readAt && void mark({ data: { ids: [n.id] } }).then(refresh)
                      }
                    >
                      Megnyitás →
                    </Link>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() =>
                        void act(() =>
                          mark({ data: { ids: [n.id], read: n.readAt ? false : true } }),
                        )
                      }
                    >
                      {n.readAt ? "Olvasatlan" : "Olvasott"}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="dash-empty">
              <Bell size={16} /> Nincs értesítés ebben a nézetben.
            </p>
          )}
          {draft && (
            <section className="dash-card notif-settings" aria-label="Értesítési beállítások">
              <h2 className="dash-sub">Beállítások (csak az appon belül)</h2>
              {NOTIFICATION_KINDS.map((k) => (
                <label key={k} className="notif-toggle">
                  <input
                    type="checkbox"
                    checked={draft[k]}
                    onChange={(e) => setDraft({ ...draft, [k]: e.target.checked })}
                  />
                  {KIND_LABELS[k]}
                </label>
              ))}
              <label className="scene-field">
                Emlékeztető ideje
                <select
                  value={draft.leadMinutes}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      leadMinutes: Number(e.target.value) as NotificationSettings["leadMinutes"],
                    })
                  }
                >
                  {LEAD_OPTIONS.map((m) => (
                    <option key={m} value={m}>
                      {LEAD_LABELS[m]}
                    </option>
                  ))}
                </select>
              </label>
              <p className="dash-note">
                Emlékeztető csak azokhoz a naptáreseményekhez és feladatokhoz készül, amelyeknél be
                van jelölve az emlékeztetés. Europe/Budapest idő; ha a NAS épp nem futott, a
                kimaradt emlékeztetőt nem küldjük utólag. Telefonos (push) értesítés még nincs.
              </p>
              <p className={q.data.schedulerAlive ? "task-ok" : "task-error"} role="status">
                {q.data.schedulerAlive
                  ? "A háttérütemező fut a NAS-on; az emlékeztetők elkészülnek."
                  : "A háttérütemező most nem fut, így időzített emlékeztető nem készül."}
              </p>
              <Button
                disabled={busy}
                onClick={() =>
                  void act(
                    () =>
                      saveSettings({ data: { version: q.data.settings.version, settings: draft } }),
                    "Beállítások mentve.",
                  )
                }
              >
                Beállítások mentése
              </Button>
            </section>
          )}
        </>
      )}
      {msg && (
        <p className={msg.bad ? "task-error" : "task-ok"} role="status">
          {msg.text}
        </p>
      )}
    </div>
  );
}
