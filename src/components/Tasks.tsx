import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import {
  Check,
  CheckCheck,
  ClipboardList,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Users,
} from "lucide-react";
import { Button } from "./ui/button";
import { PointsCard } from "./Rewards";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./ui/dialog";
import { tasksList, tasksSave, tasksArchive, tasksAct } from "@/lib/tasks.functions";
import {
  addDays,
  statusLabels,
  taskSchema,
  type TaskInput,
  type TaskOccurrence,
} from "@/lib/task-schema";

export const tasksQuery = {
  queryKey: ["family-tasks"],
  queryFn: () => tasksList(),
  retry: false,
  staleTime: 0,
  refetchInterval: 60000,
} as const;
const initial = (date: string): TaskInput => ({
  title: "",
  description: "",
  category: "Háztartás",
  points: 0,
  visibility: "family",
  assignee: null,
  start: date,
  end: null,
  time: "18:00",
  priority: "normal",
  reminder: false,
  recurrence: "once",
  weekdays: [],
  dates: [],
});
type Data = Awaited<ReturnType<typeof tasksList>>;
export function TaskEditor({
  value,
  people,
  busy,
  onSave,
  onClose,
}: {
  value: TaskInput;
  people: Data["people"];
  busy: boolean;
  onSave: (v: TaskInput) => Promise<void>;
  onClose: () => void;
}) {
  const [form, setForm] = useState(value),
    [error, setError] = useState("");
  const patch = <K extends keyof TaskInput>(key: K, v: TaskInput[K]) =>
    setForm((f) => ({ ...f, [key]: v }));
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="task-dialog">
        <DialogTitle>{value.id ? "Sablon szerkesztése" : "Új feladat"}</DialogTitle>
        <DialogDescription>
          A már kiosztott és elmúlt feladatok megőrzik az eredeti adataikat.
        </DialogDescription>
        <form
          className="task-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            const parsed = taskSchema.safeParse(form);
            if (!parsed.success) {
              setError(parsed.error.issues.map((i) => i.message).join(" "));
              return;
            }
            try {
              await onSave(parsed.data);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Sikertelen mentés.");
            }
          }}
        >
          <label className="task-wide">
            Cím
            <input
              required
              maxLength={120}
              value={form.title}
              onChange={(e) => patch("title", e.target.value)}
            />
          </label>
          <label className="task-wide">
            Leírás
            <textarea
              maxLength={2000}
              value={form.description}
              onChange={(e) => patch("description", e.target.value)}
            />
          </label>
          <label>
            Kategória
            <input
              maxLength={60}
              value={form.category}
              onChange={(e) => patch("category", e.target.value)}
            />
          </label>
          <label>
            Pontérték
            <input
              type="number"
              min={0}
              max={100000}
              step={1}
              value={form.points}
              onChange={(e) => patch("points", Number(e.target.value))}
            />
          </label>
          <label>
            Láthatóság
            <select
              value={form.visibility}
              onChange={(e) => patch("visibility", e.target.value as TaskInput["visibility"])}
            >
              <option value="family">Családi</option>
              <option value="personal">Személyes</option>
            </select>
          </label>
          <label>
            Felelős
            <select
              value={form.assignee ?? ""}
              onChange={(e) => patch("assignee", e.target.value || null)}
            >
              <option value="">Közös – elvállalható</option>
              {people.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.name}
                  {p.child ? " · gyermek" : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            Kezdőnap
            <input
              type="date"
              required
              value={form.start}
              onChange={(e) => patch("start", e.target.value)}
            />
          </label>
          <label>
            Határidő (Budapest)
            <input
              type="time"
              required
              value={form.time}
              onChange={(e) => patch("time", e.target.value)}
            />
          </label>
          <label>
            Prioritás
            <select
              value={form.priority}
              onChange={(e) => patch("priority", e.target.value as TaskInput["priority"])}
            >
              <option value="low">Alacsony</option>
              <option value="normal">Normál</option>
              <option value="high">Fontos</option>
            </select>
          </label>
          <label>
            Ismétlődés
            <select
              value={form.recurrence}
              onChange={(e) => patch("recurrence", e.target.value as TaskInput["recurrence"])}
            >
              <option value="once">Egyszeri</option>
              <option value="daily">Naponta</option>
              <option value="weekly">Heti napokon</option>
              <option value="biweekly">Kéthetente</option>
              <option value="monthly">Havonta</option>
              <option value="dates">Kiválasztott dátumokon</option>
            </select>
          </label>
          {form.recurrence !== "once" && (
            <label>
              Zárónap (opcionális)
              <input
                type="date"
                value={form.end ?? ""}
                onChange={(e) => patch("end", e.target.value || null)}
              />
            </label>
          )}
          {["weekly", "biweekly"].includes(form.recurrence) && (
            <fieldset className="task-wide">
              <legend>A hét napjai</legend>
              <div className="task-days">
                {["Hétfő", "Kedd", "Szerda", "Csütörtök", "Péntek", "Szombat", "Vasárnap"].map(
                  (name, i) => {
                    const day = (i + 1) % 7;
                    return (
                      <label key={name}>
                        <input
                          type="checkbox"
                          checked={form.weekdays.includes(day)}
                          onChange={(e) =>
                            patch(
                              "weekdays",
                              e.target.checked
                                ? [...form.weekdays, day]
                                : form.weekdays.filter((d) => d !== day),
                            )
                          }
                        />
                        {name}
                      </label>
                    );
                  },
                )}
              </div>
            </fieldset>
          )}
          {form.recurrence === "dates" && (
            <label className="task-wide">
              Dátumok (vesszővel elválasztva, ÉÉÉÉ-HH-NN)
              <input
                value={form.dates.join(",")}
                onChange={(e) =>
                  patch(
                    "dates",
                    e.target.value.split(",").map((d) => d.trim()),
                  )
                }
              />
            </label>
          )}
          {error && (
            <p role="alert" className="task-wide text-destructive">
              {error}
            </p>
          )}
          <div className="task-wide task-actions">
            <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
              Mégse
            </Button>
            <Button type="submit" disabled={busy}>
              <Check size={18} />
              {busy ? "Mentés…" : "Mentés"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
export function Tasks() {
  const query = useQuery(tasksQuery),
    qc = useQueryClient(),
    save = useServerFn(tasksSave),
    archive = useServerFn(tasksArchive),
    act = useServerFn(tasksAct);
  const [tab, setTab] = useState("Ma"),
    [filter, setFilter] = useState("mine"),
    [editor, setEditor] = useState<TaskInput | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const [decision, setDecision] = useState<{
      o: TaskOccurrence;
      action: "return" | "reject";
    } | null>(null),
    [reason, setReason] = useState("");
  const [claimPerson, setClaimPerson] = useState("");
  async function perform(fn: () => Promise<unknown>, success: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: tasksQuery.queryKey });
      setMessage(success);
    } catch (e) {
      setError(e instanceof Error ? e.message : "A művelet sikertelen.");
    } finally {
      setBusy(false);
    }
  }
  const data = query.data;
  if (!data)
    return (
      <div className="task-unavailable">
        <ClipboardList size={32} />
        <h2>{query.isPending ? "Feladatok betöltése…" : "A család feladatai nem érhetők el"}</h2>
        {query.error && <p role="alert">{query.error.message}</p>}
        <Button variant="outline" onClick={() => void query.refetch()}>
          <RefreshCw size={18} />
          Újrapróbálás
        </Button>
      </div>
    );
  const filtered = data.occurrences.filter((o) => {
    if (tab === "Közös") return o.body.visibility === "family" && !o.body.assignee;
    if (tab === "Ma" && o.date > data.today) return false;
    if (tab === "Heti" && (o.date < data.today || o.date > addDays(data.today, 6))) return false;
    return (
      filter === "all" ||
      (filter === "pending"
        ? o.status === "pending"
        : o.assignee === (filter === "mine" ? data.me : filter) ||
          (!o.assignee && filter === "mine"))
    );
  });
  const row = (o: TaskOccurrence) => {
    const mine = o.assignee === data.me,
      name =
        data.people.find((p) => p.key === o.assignee)?.name ??
        (o.assignee ? "Korábbi családtag" : "Bárki elvállalhatja");
    return (
      <article key={o.id} className={`task-row ${o.status === "approved" ? "task-done" : ""}`}>
        <div className="task-row-top">
          <span className="task-category">{o.body.category || "Feladat"}</span>
          <span className="task-state">{statusLabels[o.status]}</span>
        </div>
        <h2>{o.body.title}</h2>
        {o.body.description && <p className="task-description">{o.body.description}</p>}
        <p className="task-meta">
          {o.date} · {o.body.time} · {o.body.priority === "high" ? "Fontos · " : ""}
          {o.body.points} pontérték
        </p>
        <p className="task-meta">
          <Users size={14} />
          {name}
          {o.date < data.today && !["approved", "cancelled", "rejected"].includes(o.status)
            ? " · Elmaradt"
            : ""}
        </p>
        {o.reason && <p className="task-reason">Indok: {o.reason}</p>}
        <div className="task-actions">
          {o.status === "open" && !o.assignee && (
            <Button
              disabled={busy}
              variant="outline"
              onClick={() =>
                void perform(
                  () =>
                    act({
                      data: {
                        id: o.id,
                        version: o.version,
                        action: "claim",
                        person: claimPerson || data.me,
                      },
                    }),
                  "Feladat elvállalva.",
                )
              }
            >
              <Plus size={16} />
              Elvállalom
            </Button>
          )}
          {o.assignee &&
            (mine || data.parent) &&
            ["open", "claimed", "returned"].includes(o.status) && (
              <Button
                disabled={busy}
                onClick={() =>
                  void perform(
                    () => act({ data: { id: o.id, version: o.version, action: "complete" } }),
                    "Teljesítés mentve.",
                  )
                }
              >
                <Check size={16} />
                {mine ? "Elkészültem" : "Elkészült a nevében"}
              </Button>
            )}
          {data.parent && o.status === "pending" && (
            <>
              <Button
                disabled={busy}
                onClick={() =>
                  void perform(
                    () => act({ data: { id: o.id, version: o.version, action: "approve" } }),
                    "Teljesítés jóváhagyva.",
                  )
                }
              >
                <CheckCheck size={16} />
                Jóváhagyom
              </Button>
              {(["return", "reject"] as const).map((action) => (
                <Button
                  key={action}
                  disabled={busy}
                  variant="outline"
                  onClick={() => {
                    setDecision({ o, action });
                    setReason("");
                  }}
                >
                  {action === "return" ? "Visszaküldöm" : "Elutasítom"}
                </Button>
              ))}
            </>
          )}
          {data.parent && ["open", "claimed", "returned"].includes(o.status) && (
            <Button
              disabled={busy}
              variant="ghost"
              size="icon"
              aria-label={`${o.body.title} törlése`}
              title="Előfordulás törlése"
              onClick={() => {
                if (window.confirm("Törlöd ezt az előfordulást? A sablon megmarad."))
                  void perform(
                    () => act({ data: { id: o.id, version: o.version, action: "cancel" } }),
                    "Előfordulás törölve.",
                  );
              }}
            >
              <Trash2 size={17} />
            </Button>
          )}
        </div>
        {!!o.events.length && (
          <details className="task-log">
            <summary>Előzmények ({o.events.length})</summary>
            {o.events.map((e, i) => (
              <p key={i}>
                {new Date(e.at).toLocaleString("hu-HU", { timeZone: "Europe/Budapest" })} ·{" "}
                {data.people.find((p) => p.key === `user:${e.actor}`)?.name ??
                  "Korábbi felhasználó"}{" "}
                · {statusLabels[e.action as keyof typeof statusLabels] ?? e.action}
                {e.reason ? ` · ${e.reason}` : ""}
              </p>
            ))}
          </details>
        )}
      </article>
    );
  };
  return (
    <div className="tasks-area">
      <PointsCard />
      <div className="task-toolbar">
        <div className="task-tabs" role="tablist" aria-label="Feladatnézet">
          {["Ma", "Heti", "Közös", ...(data.parent ? ["Kezelés"] : [])].map((name) => (
            <Button
              key={name}
              role="tab"
              aria-selected={tab === name}
              variant={tab === name ? "default" : "ghost"}
              onClick={() => setTab(name)}
            >
              {name}
            </Button>
          ))}
        </div>
        {data.parent && (
          <Button onClick={() => setEditor(initial(data.today))}>
            <Plus size={18} />
            Új feladat
          </Button>
        )}
      </div>
      <p className="task-notice">
        A pontérték a későbbi személyes pontszámlához tartozik; pontjóváírás még nem történik.
      </p>
      {query.error && (
        <p role="alert" className="text-destructive">
          Frissítési hiba: {query.error.message}
        </p>
      )}
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="task-feedback">
          {message}
        </p>
      )}
      {data.backlog && (
        <p role="status">Régi esedékességek feldolgozása folytatódik a következő frissítéskor.</p>
      )}
      {tab !== "Kezelés" && (
        <div className="task-filters">
          <label>
            Feladatok
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="mine">Saját és elvállalható</option>
              <option value="all">Minden látható</option>
              {data.parent && <option value="pending">Jóváhagyásra várók</option>}
              {data.people.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          {data.parent && (
            <label>
              Közös feladat vállalása
              <select
                value={claimPerson || data.me}
                onChange={(e) => setClaimPerson(e.target.value)}
              >
                {data.people.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.name}
                    {p.child ? " nevében" : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
      {tab === "Kezelés" ? (
        <div className="task-grid">
          {data.templates
            .filter((t) => !t.archived && t.editable)
            .map((t) => (
              <article className="task-row" key={t.id}>
                <span className="task-category">
                  {t.visibility === "personal" ? "Személyes" : "Családi"} ·{" "}
                  {
                    {
                      once: "Egyszeri",
                      daily: "Naponta",
                      weekly: "Hetente",
                      biweekly: "Kéthetente",
                      monthly: "Havonta",
                      dates: "Kiválasztott napokon",
                    }[t.recurrence]
                  }
                </span>
                <h2>{t.title}</h2>
                <p className="task-meta">
                  {t.points} pontérték · {t.start}
                </p>
                <div className="task-actions">
                  <Button variant="outline" disabled={busy} onClick={() => setEditor(t)}>
                    <Pencil size={16} />
                    Szerkesztés
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={busy}
                    title="Sablon törlése"
                    aria-label={`${t.title} sablon törlése`}
                    onClick={() => {
                      if (window.confirm("Törlöd a sablont? A jóváhagyások és naplók megmaradnak."))
                        void perform(
                          () => archive({ data: { id: t.id, version: t.version } }),
                          "Sablon törölve.",
                        );
                    }}
                  >
                    <Trash2 size={17} />
                  </Button>
                </div>
              </article>
            ))}
          {!data.templates.some((t) => !t.archived && t.editable) && (
            <p className="task-empty">Még nincs szerkeszthető feladatsablon.</p>
          )}
        </div>
      ) : (
        <div className="task-grid">
          {filtered.map(row)}
          {!filtered.length && (
            <div className="task-empty">
              <ClipboardList size={28} />
              <h2>Nincs feladat ebben a nézetben</h2>
            </div>
          )}
        </div>
      )}
      {editor && (
        <TaskEditor
          value={editor}
          people={data.people}
          busy={busy}
          onClose={() => setEditor(null)}
          onSave={async (v) => {
            setBusy(true);
            try {
              await save({ data: v });
              await qc.invalidateQueries({ queryKey: tasksQuery.queryKey });
              setEditor(null);
              setMessage("Feladat mentve.");
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
      {decision && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open && !busy) setDecision(null);
          }}
        >
          <DialogContent className="task-dialog">
            <DialogTitle>
              {decision.action === "return" ? "Feladat visszaküldése" : "Feladat elutasítása"}
            </DialogTitle>
            <DialogDescription>{decision.o.body.title}</DialogDescription>
            <label className="task-decision">
              Indok
              <textarea
                value={reason}
                maxLength={1000}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <Button
              disabled={busy || !reason.trim()}
              onClick={() =>
                void perform(async () => {
                  await act({
                    data: {
                      id: decision.o.id,
                      version: decision.o.version,
                      action: decision.action,
                      reason,
                    },
                  });
                  setDecision(null);
                }, "Döntés mentve.")
              }
            >
              Döntés mentése
            </Button>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
export function TodayTasks() {
  const q = useQuery(tasksQuery);
  const d = q.data,
    today = d?.occurrences.filter(
      (o) =>
        o.date <= d.today &&
        !["approved", "cancelled", "rejected"].includes(o.status) &&
        (!o.assignee || o.assignee === d.me),
    );
  return (
    <Link to="/tasks" className="task-overview">
      <ClipboardList size={23} />
      <div>
        <strong>Mai teendők</strong>
        <p>
          {q.isPending
            ? "Betöltés…"
            : q.error
              ? "A feladatok a NAS-címeden érhetők el"
              : today?.length
                ? `${today.length} saját vagy elvállalható feladat`
                : "Nincs nyitott teendő"}
        </p>
      </div>
      <span aria-hidden>→</span>
    </Link>
  );
}
