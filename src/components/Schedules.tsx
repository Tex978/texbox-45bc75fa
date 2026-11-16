import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlarmClock, Pause, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { schedulesList, scheduleSave, scheduleToggle, scheduleDelete } from "@/lib/schedules.functions";
import {
  DST_NOTE,
  RECURRENCE_LABELS,
  WEEKDAY_LABELS,
  budapestParts,
  type ScheduleInput,
} from "@/lib/schedule-schema";
import { ACTION_LABELS, type SceneStep } from "@/lib/scene-schema";

type SceneLite = { id: string; name: string; version: number; steps: SceneStep[] };
const statusLabels: Record<string, string> = {
  accepted: "Parancsok elfogadva",
  partial: "Részben sikertelen",
  failed: "Sikertelen",
  missed: "Kimaradt (nem pótoltuk)",
  blocked: "Leállítva",
  interrupted: "Megszakadt, nem ismételtük",
  claimed: "Folyamatban",
};
const when = (ms: number) =>
  new Date(ms).toLocaleString("hu-HU", {
    timeZone: "Europe/Budapest",
    month: "short",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
function describe(r: ScheduleInput) {
  const days = r.weekdays.map((d) => WEEKDAY_LABELS[d - 1]).join(", ");
  if (r.recurrence === "daily") return `Naponta ${r.time}`;
  if (r.recurrence === "once") return `${r.date} ${r.time}, egyszer`;
  if (r.recurrence === "weekly" && r.everyWeeks > 1)
    return `${r.everyWeeks} hetente: ${days} · ${r.time}`;
  return `${days} · ${r.time}`;
}
const stepText = (s: SceneStep, name: (k: string) => string) =>
  `${name(s.device)}: ${ACTION_LABELS[s.action]}${
    typeof s.value === "boolean" ? (s.value ? " (be)" : " (ki)") : s.value !== "" ? ` → ${s.value}` : ""
  }`;

export function Schedules({
  scenes,
  deviceName,
}: {
  scenes: SceneLite[];
  deviceName: (key: string) => string;
}) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["scene-schedules"],
    queryFn: () => schedulesList(),
    retry: false,
    refetchInterval: 30000,
  });
  const save = useServerFn(scheduleSave),
    toggle = useServerFn(scheduleToggle),
    remove = useServerFn(scheduleDelete);
  const [draft, setDraft] = useState<ScheduleInput | null>(null),
    [confirm, setConfirm] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  async function act(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ text: ok });
      await qc.invalidateQueries({ queryKey: ["scene-schedules"] });
      return true;
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "A művelet nem sikerült.", bad: true });
      return false;
    } finally {
      setBusy(false);
    }
  }
  const blank = (): ScheduleInput => ({
    title: "",
    sceneId: scenes[0]?.id ?? "",
    time: "07:00",
    recurrence: "weekdays",
    weekdays: [1, 2, 3, 4, 5],
    everyWeeks: 1,
    date: null,
    startDate: budapestParts(Date.now()).date,
  });
  const rules = q.data?.rules ?? [];
  const target = rules.find((r) => r.id === confirm);
  const targetScene = scenes.find((s) => s.id === target?.sceneId);
  return (
    <section className="scene-history scene-schedules" aria-label="Időzítések">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-semibold">
          <AlarmClock size={18} /> Időzítések
        </h3>
        {q.data?.canCreate && (
          <Button size="sm" variant="outline" disabled={!scenes.length} onClick={() => setDraft(blank())}>
            <Plus size={14} /> Új időzítés
          </Button>
        )}
      </div>
      {q.error ? (
        <p className="text-sm text-muted-foreground">{q.error.message}</p>
      ) : q.data ? (
        <>
          <p className={q.data.schedulerAlive ? "task-ok" : "task-error"} role="status">
            {q.data.schedulerAlive
              ? "A háttérütemező fut a NAS-on."
              : "A háttérütemező most nem fut, ezért időzítés nem kapcsolható be."}
          </p>
          <p className="text-xs text-muted-foreground">
            Europe/Budapest helyi idő. Az új időzítés kikapcsolva jön létre. Ha a NAS épp nem fut, a
            kimaradt időpontot nem pótoljuk, és megszakadt futást sem ismétlünk. {DST_NOTE}
          </p>
          {!rules.length && (
            <p className="text-sm text-muted-foreground">
              {q.data.canCreate
                ? scenes.length
                  ? "Még nincs időzítés."
                  : "Előbb hozz létre egy jelenetet."
                : "Gyermekfiók nem kezel időzítést."}
            </p>
          )}
          <ul className="grid gap-2">
            {rules.map((r) => (
              <li key={r.id} className="scene-run schedule-row">
                <div className="min-w-0">
                  <strong>{r.title}</strong>{" "}
                  <span className={r.enabled ? "schedule-on" : "schedule-off"}>
                    {r.enabled ? "Aktív" : "Kikapcsolva"}
                  </span>
                  <p className="text-sm">
                    {r.sceneName ?? "Törölt jelenet"} · {describe(r)}
                    {!r.mine ? ` · ${r.ownerName}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {r.nextAt ? `Következő: ${when(r.nextAt)}` : "Nincs ütemezett futás"}
                    {r.lastStatus
                      ? ` · Utolsó: ${statusLabels[r.lastStatus] ?? r.lastStatus}${r.lastAt ? ` (${when(r.lastAt)})` : ""}`
                      : ""}
                  </p>
                  {r.lastMessage && <p className="text-xs text-muted-foreground">{r.lastMessage}</p>}
                  {r.sceneChanged && (
                    <p className="task-error text-xs">A jelenet a jóváhagyás óta változott.</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-1">
                  {r.enabled ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        void act(
                          () => toggle({ data: { id: r.id, version: r.version, enabled: false } }),
                          "Időzítés szüneteltetve.",
                        )
                      }
                    >
                      <Pause size={14} /> Szüneteltetés
                    </Button>
                  ) : (
                    r.mine &&
                    r.sceneName && (
                      <Button
                        size="sm"
                        disabled={busy || !q.data?.schedulerAlive}
                        onClick={() => setConfirm(r.id)}
                      >
                        <Play size={14} /> Bekapcsolás…
                      </Button>
                    )
                  )}
                  {r.mine && (
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`${r.title} szerkesztése`}
                      onClick={() =>
                        setDraft({
                          id: r.id,
                          version: r.version,
                          title: r.title,
                          sceneId: r.sceneId,
                          time: r.time,
                          recurrence: r.recurrence,
                          weekdays: r.weekdays,
                          everyWeeks: r.everyWeeks,
                          date: r.date,
                          startDate: r.startDate,
                        })
                      }
                    >
                      <Pencil size={14} />
                    </Button>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`${r.title} törlése`}
                    disabled={busy}
                    onClick={() =>
                      window.confirm(`Törlöd a(z) „${r.title}” időzítést?`) &&
                      void act(() => remove({ data: { id: r.id } }), "Időzítés törölve.")
                    }
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Betöltés…</p>
      )}
      {msg && (
        <p className={msg.bad ? "task-error" : "task-ok"} role="status">
          {msg.text}
        </p>
      )}
      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="scene-editor">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Időzítés szerkesztése" : "Új időzítés"}</DialogTitle>
            <DialogDescription>
              Mentés után kikapcsolva marad; bekapcsolás előtt összefoglalót kapsz.
            </DialogDescription>
          </DialogHeader>
          {draft && (
            <form
              className="grid gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                void act(() => save({ data: draft }), "Időzítés mentve (kikapcsolva).").then(
                  (ok) => ok && setDraft(null),
                );
              }}
            >
              <label className="scene-field">
                Megnevezés
                <Input
                  required
                  maxLength={60}
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                />
              </label>
              <label className="scene-field">
                Jelenet
                <select
                  value={draft.sceneId}
                  onChange={(e) => setDraft({ ...draft, sceneId: e.target.value })}
                >
                  {scenes.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="scene-fields">
                <label className="scene-field">
                  Időpont
                  <Input
                    type="time"
                    required
                    value={draft.time}
                    onChange={(e) => setDraft({ ...draft, time: e.target.value })}
                  />
                </label>
                <label className="scene-field">
                  Ismétlés
                  <select
                    value={draft.recurrence}
                    onChange={(e) =>
                      setDraft({ ...draft, recurrence: e.target.value as ScheduleInput["recurrence"] })
                    }
                  >
                    {Object.entries(RECURRENCE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {(draft.recurrence === "weekdays" || draft.recurrence === "weekly") && (
                <fieldset className="flex flex-wrap gap-1" aria-label="Napok">
                  {WEEKDAY_LABELS.map((l, i) => {
                    const d = i + 1,
                      on = draft.weekdays.includes(d);
                    return (
                      <Button
                        key={l}
                        type="button"
                        size="sm"
                        variant={on ? "default" : "outline"}
                        aria-pressed={on}
                        onClick={() =>
                          setDraft({
                            ...draft,
                            weekdays: on
                              ? draft.weekdays.filter((x) => x !== d)
                              : [...draft.weekdays, d].sort(),
                          })
                        }
                      >
                        {l}
                      </Button>
                    );
                  })}
                </fieldset>
              )}
              {draft.recurrence === "weekly" && (
                <label className="scene-field">
                  Hány hetente
                  <Input
                    type="number"
                    min={1}
                    max={8}
                    value={draft.everyWeeks}
                    onChange={(e) => setDraft({ ...draft, everyWeeks: Number(e.target.value) || 1 })}
                  />
                </label>
              )}
              {draft.recurrence === "once" ? (
                <label className="scene-field">
                  Dátum
                  <Input
                    type="date"
                    required
                    value={draft.date ?? ""}
                    onChange={(e) =>
                      setDraft({ ...draft, date: e.target.value, startDate: e.target.value })
                    }
                  />
                </label>
              ) : (
                <label className="scene-field">
                  Kezdő nap
                  <Input
                    type="date"
                    required
                    value={draft.startDate}
                    onChange={(e) => setDraft({ ...draft, startDate: e.target.value })}
                  />
                </label>
              )}
              <Button disabled={busy || !draft.sceneId}>{busy ? "Mentés…" : "Mentés"}</Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={!!target} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Időzítés bekapcsolása</DialogTitle>
            <DialogDescription>
              {target ? `${describe(target)} (Europe/Budapest) a(z) „${target.sceneName}” jelenet fut.` : ""}
            </DialogDescription>
          </DialogHeader>
          {target && targetScene && (
            <>
              <p className="text-sm font-medium">Ezeket a parancsokat küldi automatikusan:</p>
              <ul className="list-disc pl-5 text-sm">
                {targetScene.steps.map((s, i) => (
                  <li key={i}>{stepText(s, deviceName)}</li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">
                A futás a te fiókod jogosultságaival történik, minden lépés előtt újraellenőrizve. A
                vezérlő elfogadása nem bizonyítja a fizikai állapotot.
              </p>
              <Button
                disabled={busy}
                onClick={() =>
                  void act(
                    () =>
                      toggle({
                        data: {
                          id: target.id,
                          version: target.version,
                          enabled: true,
                          confirmSceneVersion: targetScene.version,
                        },
                      }),
                    "Időzítés bekapcsolva.",
                  ).then((ok) => ok && setConfirm(null))
                }
              >
                Megerősítem és bekapcsolom
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
