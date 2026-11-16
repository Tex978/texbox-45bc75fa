import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarDays, Plus, RefreshCw } from "lucide-react";
import { Button } from "./ui/button";
import {
  calendarGet,
  calendarSave,
  calendarOccurrence,
  calendarToTask,
} from "@/lib/calendar.functions";
import {
  EVENT_TYPES,
  RECURRENCES,
  eventTypeLabels,
  recurrenceLabels,
  type EventInput,
} from "@/lib/calendar-schema";
import { addDays, budapestToday } from "@/lib/task-schema";
import { weekStart } from "@/lib/organizer-schema";

type Data = Awaited<ReturnType<typeof calendarGet>>;
type Occ = Data["occurrences"][number];
const WD = ["V", "H", "K", "Sze", "Cs", "P", "Szo"];
const color = (i: number) => `var(--chart-${(i % 5) + 1})`;
const label = (d: string, o: Intl.DateTimeFormatOptions) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString("hu-HU", { ...o, timeZone: "UTC" });
const blank = (date: string): EventInput => ({
  title: "",
  description: "",
  type: "program",
  location: "",
  allDay: false,
  date,
  endDate: null,
  start: "09:00",
  end: "10:00",
  people: [],
  visibility: "family",
  remind: false,
  recurrence: "once",
  interval: 1,
  weekdays: [],
  until: null,
});

function Editor({
  value,
  people,
  onDone,
}: {
  value: EventInput & { archived?: boolean };
  people: Data["people"];
  onDone: () => void;
}) {
  const save = useServerFn(calendarSave),
    qc = useQueryClient();
  const [f, setF] = useState(value),
    [busy, setBusy] = useState(false),
    [err, setErr] = useState("");
  const set = <K extends keyof EventInput>(k: K, v: EventInput[K]) =>
    setF((x) => ({ ...x, [k]: v }));
  async function submit(archived = false) {
    setBusy(true);
    setErr("");
    try {
      await save({ data: { ...f, archived } });
      await qc.invalidateQueries({ queryKey: ["calendar"] });
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "A mentés sikertelen.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="task-form reward-form"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <h3>{f.id ? "Esemény szerkesztése (teljes sorozat)" : "Új esemény"}</h3>
      <label>
        Cím
        <input required value={f.title} onChange={(e) => set("title", e.target.value)} />
      </label>
      <label>
        Típus
        <select value={f.type} onChange={(e) => set("type", e.target.value as EventInput["type"])}>
          {EVENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {eventTypeLabels[t]}
            </option>
          ))}
        </select>
      </label>
      <label>
        Helyszín
        <input value={f.location} onChange={(e) => set("location", e.target.value)} />
      </label>
      <label>
        Leírás
        <textarea value={f.description} onChange={(e) => set("description", e.target.value)} />
      </label>
      <label className="task-check">
        <input
          type="checkbox"
          checked={!!f.allDay}
          onChange={(e) => set("allDay", e.target.checked)}
        />
        Egész napos
      </label>
      <label>
        Dátum
        <input type="date" required value={f.date} onChange={(e) => set("date", e.target.value)} />
      </label>
      <label>
        Utolsó nap (többnapos, opcionális)
        <input
          type="date"
          value={f.endDate ?? ""}
          onChange={(e) => set("endDate", e.target.value || null)}
        />
      </label>
      {!f.allDay && (
        <>
          <label>
            Kezdés
            <input type="time" value={f.start} onChange={(e) => set("start", e.target.value)} />
          </label>
          <label>
            Vége
            <input type="time" value={f.end} onChange={(e) => set("end", e.target.value)} />
          </label>
        </>
      )}
      <fieldset>
        <legend>Érintett családtagok (üres = egész család)</legend>
        {people.map((p) => (
          <label key={p.key} className="task-check">
            <input
              type="checkbox"
              checked={f.people?.includes(p.key)}
              onChange={(e) =>
                set(
                  "people",
                  e.target.checked
                    ? [...(f.people ?? []), p.key]
                    : (f.people ?? []).filter((k) => k !== p.key),
                )
              }
            />
            {p.name}
          </label>
        ))}
      </fieldset>
      <label>
        Láthatóság
        <select
          value={f.visibility}
          onChange={(e) => set("visibility", e.target.value as "family" | "private")}
        >
          <option value="family">
            Családi (felnőttek látják; gyerek, ha érintett vagy az egész családé)
          </option>
          <option value="private">Személyes (csak én és az érintettek)</option>
        </select>
      </label>
      <label>
        Ismétlődés
        <select
          value={f.recurrence}
          onChange={(e) => set("recurrence", e.target.value as EventInput["recurrence"])}
        >
          {RECURRENCES.map((r) => (
            <option key={r} value={r}>
              {recurrenceLabels[r]}
            </option>
          ))}
        </select>
      </label>
      {f.recurrence !== "once" && (
        <>
          <label>
            Gyakoriság (minden N.)
            <input
              type="number"
              min={1}
              max={52}
              value={f.interval}
              onChange={(e) => set("interval", Number(e.target.value))}
            />
          </label>
          {f.recurrence === "weekly" && (
            <fieldset>
              <legend>Napok</legend>
              {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                <label key={d} className="task-check">
                  <input
                    type="checkbox"
                    checked={f.weekdays?.includes(d)}
                    onChange={(e) =>
                      set(
                        "weekdays",
                        e.target.checked
                          ? [...(f.weekdays ?? []), d]
                          : (f.weekdays ?? []).filter((x) => x !== d),
                      )
                    }
                  />
                  {WD[d]}
                </label>
              ))}
            </fieldset>
          )}
          <label>
            Ismétlés vége (opcionális)
            <input
              type="date"
              value={f.until ?? ""}
              onChange={(e) => set("until", e.target.value || null)}
            />
          </label>
        </>
      )}
      <label className="task-check">
        <input
          type="checkbox"
          checked={!!f.remind}
          onChange={(e) => set("remind", e.target.checked)}
        />
        Emlékeztetőt szeretnék (igény mentése; push értesítés még nincs, a Közelgő listában jelenik
        meg)
      </label>
      {err && (
        <p className="task-error" role="alert">
          {err}
        </p>
      )}
      <div className="task-actions">
        <Button type="submit" disabled={busy}>
          Mentés
        </Button>
        {f.id && (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() =>
              window.confirm("Archiválod a teljes sorozatot? Az előzmény megmarad.") &&
              void submit(true)
            }
          >
            Archiválás
          </Button>
        )}
        <Button type="button" variant="outline" onClick={onDone}>
          Mégse
        </Button>
      </div>
    </form>
  );
}

export function Calendar() {
  const [view, setView] = useState<"Hónap" | "Hét" | "Közelgő">("Közelgő"),
    [anchor, setAnchor] = useState(() => budapestToday()),
    [person, setPerson] = useState(""),
    [edit, setEdit] = useState<(EventInput & { archived?: boolean }) | null>(null),
    [sel, setSel] = useState<Occ | null>(null),
    [moveTo, setMoveTo] = useState(""),
    [assignee, setAssignee] = useState(""),
    [msg, setMsg] = useState(""),
    [err, setErr] = useState("");
  const monthStart = weekStart(`${anchor.slice(0, 7)}-01`);
  const [from, to] =
    view === "Hónap"
      ? [monthStart, addDays(monthStart, 41)]
      : view === "Hét"
        ? [weekStart(anchor), addDays(weekStart(anchor), 6)]
        : [budapestToday(), addDays(budapestToday(), 30)];
  const get = useServerFn(calendarGet),
    occFn = useServerFn(calendarOccurrence),
    taskFn = useServerFn(calendarToTask),
    qc = useQueryClient();
  const q = useQuery({
    queryKey: ["calendar", from, to, person],
    queryFn: () => get({ data: { from, to, person: person || undefined } }),
    retry: false,
    staleTime: 0,
    refetchInterval: 60000,
  });
  const d = q.data;
  if (!d)
    return (
      <div className="task-unavailable">
        <CalendarDays size={32} />
        <h2>{q.isPending ? "Naptár betöltése…" : "A családi naptár nem érhető el"}</h2>
        {q.error && <p role="alert">{q.error.message}</p>}
        <Button variant="outline" onClick={() => void q.refetch()}>
          <RefreshCw size={18} /> Újrapróbálás
        </Button>
      </div>
    );
  if (edit)
    return (
      <Editor
        value={edit}
        people={d.people}
        onDone={() => {
          setEdit(null);
          setSel(null);
        }}
      />
    );
  const idx = (k: string) => d.people.findIndex((p) => p.key === k);
  const dot = (o: Occ) =>
    o.people.length ? color(Math.max(0, idx(o.people[0]!))) : "var(--muted-foreground)";
  const name = (k: string) => d.people.find((p) => p.key === k)?.name ?? "Családtag";
  async function act(fn: () => Promise<unknown>, ok: string) {
    setErr("");
    setMsg("");
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: ["calendar"] });
      setMsg(ok);
      setSel(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "A művelet sikertelen.");
    }
  }
  const chip = (o: Occ) => (
    <button
      key={o.key}
      className="cal-chip"
      onClick={() => setSel(o)}
      style={{ borderLeftColor: dot(o) }}
    >
      {!o.allDay && <small>{o.start} </small>}
      {o.title}
    </button>
  );
  const byDay = (day: string) => d.occurrences.filter((o) => o.date <= day && o.endDate >= day);
  const shift = (n: number) =>
    setAnchor(
      view === "Hónap"
        ? `${addDays(`${anchor.slice(0, 7)}-15`, n * 30).slice(0, 7)}-01`
        : addDays(anchor, n * 7),
    );
  const series = sel && d.events.find((e) => e.id === sel.eventId);
  return (
    <section className="org-section">
      <div className="task-toolbar">
        <div className="task-tabs" role="tablist">
          {(["Közelgő", "Hét", "Hónap"] as const).map((v) => (
            <Button
              key={v}
              role="tab"
              aria-selected={view === v}
              variant={view === v ? "default" : "outline"}
              onClick={() => setView(v)}
            >
              {v}
            </Button>
          ))}
        </div>
        {d.canCreate && (
          <Button onClick={() => setEdit(blank(view === "Közelgő" ? d.today : anchor))}>
            <Plus size={16} /> Új esemény
          </Button>
        )}
      </div>
      <div className="task-filters">
        {view !== "Közelgő" && (
          <>
            <Button variant="outline" onClick={() => shift(-1)}>
              ←
            </Button>
            <strong>
              {view === "Hónap"
                ? label(`${anchor.slice(0, 7)}-15`, { year: "numeric", month: "long" })
                : `${from} – ${to}`}
            </strong>
            <Button variant="outline" onClick={() => shift(1)}>
              →
            </Button>
            <Button variant="ghost" onClick={() => setAnchor(d.today)}>
              Ma
            </Button>
          </>
        )}
        {d.people.length > 1 && (
          <select
            aria-label="Családtag szűrő"
            value={person}
            onChange={(e) => setPerson(e.target.value)}
          >
            <option value="">Mindenki</option>
            {d.people.map((p) => (
              <option key={p.key} value={p.key}>
                {p.name}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="cal-legend" aria-label="Jelmagyarázat">
        <span>
          <i style={{ background: "var(--muted-foreground)" }} />
          Egész család
        </span>
        {d.people.map((p, i) => (
          <span key={p.key}>
            <i style={{ background: color(i) }} />
            {p.name}
          </span>
        ))}
      </div>
      {msg && (
        <p className="task-ok" role="status">
          {msg}
        </p>
      )}
      {err && (
        <p className="task-error" role="alert">
          {err}
        </p>
      )}
      {sel && (
        <article className="cal-detail" aria-label="Esemény részletei">
          <h3>{sel.title}</h3>
          <p>
            {eventTypeLabels[sel.type]} ·{" "}
            {label(sel.date, { weekday: "long", month: "long", day: "numeric" })}
            {sel.endDate !== sel.date ? ` – ${sel.endDate}` : ""} ·{" "}
            {sel.allDay ? "egész nap" : `${sel.start}–${sel.end}`}
            {sel.moved ? " · áthelyezve" : ""}
          </p>
          {sel.location && <p>Helyszín: {sel.location}</p>}
          {sel.description && <p>{sel.description}</p>}
          <p>
            Érintett: {sel.people.length ? sel.people.map(name).join(", ") : "egész család"}
            {sel.remind ? " · emlékeztető kérve (push még nincs)" : ""}
          </p>
          {sel.editable && (
            <div className="task-actions">
              {series && (
                <Button variant="outline" onClick={() => setEdit(series)}>
                  Szerkesztés
                </Button>
              )}
              {sel.recurring && (
                <Button
                  variant="outline"
                  onClick={() =>
                    act(
                      () =>
                        occFn({ data: { id: sel.eventId, date: sel.origDate, action: "skip" } }),
                      "Ez az alkalom kimarad.",
                    )
                  }
                >
                  Csak ez marad ki
                </Button>
              )}
              {sel.moved && (
                <Button
                  variant="outline"
                  onClick={() =>
                    act(
                      () =>
                        occFn({ data: { id: sel.eventId, date: sel.origDate, action: "restore" } }),
                      "Eredeti időpont visszaállítva.",
                    )
                  }
                >
                  Visszaállítás
                </Button>
              )}
              <input
                type="date"
                aria-label="Áthelyezés dátuma"
                value={moveTo}
                onChange={(e) => setMoveTo(e.target.value)}
              />
              <Button
                variant="outline"
                disabled={!moveTo}
                onClick={() =>
                  act(
                    () =>
                      occFn({
                        data: {
                          id: sel.eventId,
                          date: sel.origDate,
                          action: "move",
                          newDate: moveTo,
                        },
                      }),
                    "Alkalom áthelyezve.",
                  )
                }
              >
                Áthelyezés
              </Button>
              {sel.taskId ? (
                <span className="task-ok">Feladat már létrehozva</span>
              ) : (
                <>
                  <select
                    aria-label="Feladat felelőse"
                    value={assignee}
                    onChange={(e) => setAssignee(e.target.value)}
                  >
                    <option value="">Bárki elvállalhatja</option>
                    {d.people.map((p) => (
                      <option key={p.key} value={p.key}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <Button
                    onClick={() =>
                      act(
                        () =>
                          taskFn({
                            data: {
                              id: sel.eventId,
                              date: sel.origDate,
                              assignee: assignee || null,
                            },
                          }),
                        "Feladat létrehozva 0 ponttal; a pontértéket a Feladatoknál a szülő állíthatja.",
                      )
                    }
                  >
                    Feladat ebből
                  </Button>
                </>
              )}
            </div>
          )}
          <Button variant="ghost" onClick={() => setSel(null)}>
            Bezár
          </Button>
        </article>
      )}
      {view === "Közelgő" && (
        <>
          {!d.occurrences.length && (
            <p className="task-empty">Nincs esemény a következő 30 napban.</p>
          )}
          <ul className="cal-list">
            {d.occurrences.map((o) => (
              <li key={o.key}>
                <span className="cal-when">
                  {o.date === d.today
                    ? "Ma"
                    : label(o.date, { weekday: "short", month: "short", day: "numeric" })}
                  <small>{o.allDay ? "egész nap" : o.start}</small>
                </span>
                {chip(o)}
                {o.remind && <small className="cal-remind">emlékeztető kérve</small>}
              </li>
            ))}
          </ul>
        </>
      )}
      {view !== "Közelgő" && (
        <div className={view === "Hónap" ? "cal-month" : "cal-week"}>
          {view === "Hónap" &&
            [1, 2, 3, 4, 5, 6, 0].map((w) => (
              <div key={w} className="cal-head">
                {WD[w]}
              </div>
            ))}
          {Array.from({ length: view === "Hónap" ? 42 : 7 }, (_, i) => addDays(from, i)).map(
            (day) => (
              <div
                key={day}
                className={`cal-day ${day === d.today ? "menu-today" : ""} ${view === "Hónap" && day.slice(0, 7) !== anchor.slice(0, 7) ? "cal-out" : ""}`}
              >
                <span className="cal-num">
                  {view === "Hét"
                    ? label(day, { weekday: "short", day: "numeric" })
                    : Number(day.slice(8))}
                </span>
                {byDay(day).map(chip)}
              </div>
            ),
          )}
        </div>
      )}
    </section>
  );
}
