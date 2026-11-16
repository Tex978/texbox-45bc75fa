import { useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Plus,
  Play,
  Pencil,
  Trash2,
  ChevronUp,
  ChevronDown,
  Sparkles,
  Sun,
  Moon,
  Film,
  House,
  X,
} from "lucide-react";
import { Button } from "./ui/button";
import { Schedules } from "./Schedules";
import { Input } from "./ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import {
  scenesList,
  scenesDevices,
  scenesSave,
  scenesDelete,
  scenesRun,
  scenesRuns,
  scenesAcl,
} from "@/lib/scenes.functions";
import {
  ACTION_LABELS,
  GREE_MODES,
  GREE_FANS,
  type SceneInput,
  type SceneStep,
} from "@/lib/scene-schema";
const icons = { sparkles: Sparkles, sun: Sun, moon: Moon, film: Film, house: House };
const blank = (): SceneInput => ({
  name: "",
  icon: "sparkles",
  color: "primary",
  visibility: "family",
  allowedUsers: [],
  steps: [],
});
const defaultValue = (action: SceneStep["action"]) =>
  action === "power"
    ? "on"
    : action === "mode"
      ? "cool"
      : action === "fanSpeed"
        ? "auto"
        : action === "temperature"
          ? 22
          : action === "switch_led"
            ? true
            : 0;
const runLabels: Record<string, string> = {
  running: "Folyamatban",
  accepted: "Parancsok elfogadva",
  partial: "Részben sikertelen",
  failed: "Sikertelen",
  interrupted: "Újraindítás miatt megszakadt",
};
export function Scenes() {
  const q = useQuery({ queryKey: ["scenes"], queryFn: () => scenesList(), retry: false });
  const devices = useQuery({
    queryKey: ["scene-devices"],
    queryFn: () => scenesDevices(),
    retry: false,
    staleTime: 60_000,
  });
  const qc = useQueryClient();
  const save = useServerFn(scenesSave),
    remove = useServerFn(scenesDelete),
    run = useServerFn(scenesRun),
    acl = useServerFn(scenesAcl);
  const [draft, setDraft] = useState<SceneInput | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [running, setRunning] = useState<string | null>(null),
    [selected, setSelected] = useState<string | null>(null);
  const lock = useRef(false);
  const history = useQuery({
    queryKey: ["scene-runs", selected],
    queryFn: () => scenesRuns({ data: { id: selected || "" } }),
    enabled: !!selected,
    refetchInterval: running ? 1000 : false,
    retry: false,
  });
  const changeStep = (i: number, patch: Partial<SceneStep>) =>
    setDraft((d) =>
      d ? { ...d, steps: d.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) } : d,
    );
  async function action(fn: () => Promise<unknown>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: ["scenes"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "A művelet nem sikerült.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="scene-centre">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Kézi jelenetek</h2>
        {q.data?.canEdit && (
          <Button
            onClick={() => {
              setError("");
              setDraft(blank());
            }}
          >
            <Plus />
            Új jelenet
          </Button>
        )}
      </div>
      {(error || q.error) && (
        <p role="alert" className="text-sm text-destructive">
          {error || (q.error as Error)?.message}
        </p>
      )}
      {q.isPending && (
        <p role="status" className="text-muted-foreground">
          Jelenetek betöltése…
        </p>
      )}
      {q.error && (
        <Button variant="outline" onClick={() => void q.refetch()}>
          Újrapróbálás
        </Button>
      )}
      {q.data?.scenes.length === 0 && (
        <div className="scene-empty">
          <Sparkles />
          <h3>Még nincs jelenet</h3>
          <p className="text-sm text-muted-foreground">A mentett jeleneteid itt jelennek meg.</p>
        </div>
      )}
      <div className="scene-grid">
        {q.data?.scenes.map((s) => {
          const Icon = icons[s.icon];
          return (
            <article className={`scene-card scene-${s.color}`} key={s.id}>
              <div className="flex items-start gap-3">
                <span className="scene-symbol">
                  <Icon />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold break-words">{s.name}</h3>
                  <p className="text-xs text-muted-foreground">
                    {s.visibility === "family" ? "Családi" : "Személyes"} · {s.steps.length} művelet
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={!!running || busy}
                  onClick={() =>
                    void action(async () => {
                      setSelected(s.id);
                      setRunning(s.id);
                      try {
                        await run({ data: { id: s.id, requestId: crypto.randomUUID() } });
                      } finally {
                        setRunning(null);
                        await qc.invalidateQueries({ queryKey: ["scene-runs", s.id] });
                      }
                    })
                  }
                >
                  <Play />
                  {running === s.id ? "Fut…" : "Indítás"}
                </Button>
                <Button variant="outline" onClick={() => setSelected(s.id)}>
                  Napló
                </Button>
                {s.editable && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Szerkesztés"
                      aria-label={`${s.name} szerkesztése`}
                      onClick={() => setDraft(s)}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Törlés"
                      disabled={busy || !!running}
                      aria-label={`${s.name} törlése`}
                      onClick={() => {
                        if (confirm(`Törlöd a jelenetet: ${s.name}?`))
                          void action(() => remove({ data: { id: s.id } }));
                      }}
                    >
                      <Trash2 />
                    </Button>
                  </>
                )}
              </div>
            </article>
          );
        })}
      </div>
      {q.data && (
        <Schedules
          scenes={q.data.scenes}
          deviceName={(k) => devices.data?.devices.find((d) => d.key === k)?.name ?? k}
        />
      )}
      {selected && (
        <section className="scene-history">
          <div className="flex justify-between gap-3">
            <h3 className="font-semibold">Futtatási napló</h3>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Napló bezárása"
              onClick={() => setSelected(null)}
            >
              <X />
            </Button>
          </div>
          {history.error && (
            <p role="alert" className="text-destructive">
              {(history.error as Error).message}
            </p>
          )}
          {history.data?.length === 0 && (
            <p className="text-sm text-muted-foreground">Még nincs futtatás.</p>
          )}
          {history.data?.map((r) => (
            <div key={r.id} className="scene-run">
              <p className="text-sm font-medium">
                {runLabels[r.status] || r.status} · {new Date(r.startedAt).toLocaleString("hu-HU")}{" "}
                · {q.data?.users.find((u) => u.id === r.userId)?.name || "Saját futtatás"}
              </p>
              <ol>
                {r.results.map((v, i) => (
                  <li
                    key={i}
                    className={v.status === "failed" ? "text-destructive" : "text-muted-foreground"}
                  >
                    {devices.data?.devices.find((d) => d.key === v.device)?.name || v.device} ·{" "}
                    {ACTION_LABELS[v.action as SceneStep["action"]]}: {v.message}
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </section>
      )}
      <Dialog
        open={!!draft}
        onOpenChange={(o) => {
          if (!o && !busy) setDraft(null);
        }}
      >
        <DialogContent className="scene-editor">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Jelenet szerkesztése" : "Új jelenet"}</DialogTitle>
            <DialogDescription>Kézzel indítható, NAS-on mentett eszközműveletek.</DialogDescription>
          </DialogHeader>
          {draft && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void action(async () => {
                  await save({ data: draft });
                  setDraft(null);
                });
              }}
              className="grid gap-4"
            >
              {error && (
                <p role="alert" className="text-destructive text-sm">
                  {error}
                </p>
              )}
              <label className="scene-field">
                Név
                <Input
                  required
                  maxLength={60}
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </label>
              <div className="scene-fields">
                <label className="scene-field">
                  Ikon
                  <select
                    value={draft.icon}
                    onChange={(e) =>
                      setDraft({ ...draft, icon: e.target.value as SceneInput["icon"] })
                    }
                  >
                    {Object.keys(icons).map((k, i) => (
                      <option key={k} value={k}>
                        {["Csillanás", "Nap", "Hold", "Film", "Otthon"][i]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="scene-field">
                  Szín
                  <select
                    value={draft.color}
                    onChange={(e) =>
                      setDraft({ ...draft, color: e.target.value as SceneInput["color"] })
                    }
                  >
                    <option value="primary">Alap</option>
                    <option value="energy">Napfény</option>
                    <option value="success">Zöld</option>
                  </select>
                </label>
                <label className="scene-field">
                  Láthatóság
                  <select
                    value={draft.visibility}
                    onChange={(e) =>
                      setDraft({ ...draft, visibility: e.target.value as SceneInput["visibility"] })
                    }
                  >
                    <option value="family">Családi</option>
                    <option value="personal">Személyes</option>
                  </select>
                </label>
              </div>
              {devices.data?.errors.map((e) => (
                <p key={e} className="text-sm text-destructive">
                  {e}
                </p>
              ))}
              {devices.error && (
                <p className="text-sm text-destructive">{(devices.error as Error).message}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Csak igazolt parancsok választhatók. A Smart Life fényerőtartomány, Bosch,
                érzékelők, légtisztítók és zárak ebben a változatban nem jelenetlépések.
              </p>
              {draft.steps.map((s, i) => {
                const dev = devices.data?.devices.find((d) => d.key === s.device);
                return (
                  <fieldset className="scene-step" key={i}>
                    <legend>{i + 1}. művelet</legend>
                    <label className="scene-field">
                      Eszköz
                      <select
                        required
                        value={s.device}
                        onChange={(e) => {
                          const d = devices.data?.devices.find((d) => d.key === e.target.value);
                          const first = d?.actions[0];
                          if (d && first)
                            changeStep(i, {
                              device: d.key,
                              action: first,
                              value: defaultValue(first),
                            });
                        }}
                      >
                        <option value="">Válassz eszközt</option>
                        {devices.data?.devices.map((d) => (
                          <option value={d.key} key={d.key}>
                            {d.name}
                            {!d.online ? " · offline" : ""}
                          </option>
                        ))}
                        {!dev && s.device && (
                          <option value={s.device}>{s.device} · nem elérhető</option>
                        )}
                      </select>
                    </label>
                    <div className="scene-fields">
                      <label className="scene-field">
                        Művelet
                        <select
                          value={s.action}
                          onChange={(e) => {
                            const a = e.target.value as SceneStep["action"];
                            changeStep(i, { action: a, value: defaultValue(a) });
                          }}
                        >
                          {(dev?.actions || [s.action]).map((a) => (
                            <option key={a} value={a}>
                              {ACTION_LABELS[a]}
                            </option>
                          ))}
                        </select>
                      </label>
                      {s.action === "temperature" || s.action === "position" ? (
                        <label className="scene-field">
                          {s.action === "temperature" ? "Célhőmérséklet (°C)" : "Célpozíció (%)"}
                          <Input
                            type="number"
                            required
                            min={s.action === "temperature" ? 16 : 0}
                            max={s.action === "temperature" ? 30 : 100}
                            step={1}
                            value={Number(s.value)}
                            onChange={(e) => changeStep(i, { value: Number(e.target.value) })}
                          />
                        </label>
                      ) : ["mode", "fanSpeed", "power", "switch_led"].includes(s.action) ? (
                        <label className="scene-field">
                          Érték
                          <select
                            value={String(s.value)}
                            onChange={(e) =>
                              changeStep(i, {
                                value:
                                  s.action === "switch_led"
                                    ? e.target.value === "true"
                                    : e.target.value,
                              })
                            }
                          >
                            {(s.action === "mode"
                              ? GREE_MODES
                              : s.action === "fanSpeed"
                                ? GREE_FANS
                                : s.action === "power"
                                  ? ["on", "off"]
                                  : ["true", "false"]
                            ).map((v) => (
                              <option key={v} value={v}>
                                {
                                  (
                                    {
                                      on: "Be",
                                      off: "Ki",
                                      true: "Be",
                                      false: "Ki",
                                      auto: "Automatikus",
                                      cool: "Hűtés",
                                      heat: "Fűtés",
                                      dry: "Párátlanítás",
                                      fan_only: "Ventilátor",
                                      low: "Alacsony",
                                      mediumLow: "Közepesen alacsony",
                                      medium: "Közepes",
                                      mediumHigh: "Közepesen magas",
                                      high: "Magas",
                                    } as Record<string, string>
                                  )[v]
                                }
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                    </div>
                    <div className="flex gap-2">
                      {[-1, 1].map((dir) => (
                        <Button
                          key={dir}
                          type="button"
                          variant="outline"
                          size="icon"
                          aria-label={dir < 0 ? "Művelet feljebb" : "Művelet lejjebb"}
                          disabled={i + dir < 0 || i + dir >= draft.steps.length}
                          onClick={() => {
                            const steps = [...draft.steps];
                            const a = steps[i],
                              b = steps[i + dir];
                            if (!a || !b) return;
                            [steps[i], steps[i + dir]] = [b, a];
                            setDraft({ ...draft, steps });
                          }}
                        >
                          {dir < 0 ? <ChevronUp /> : <ChevronDown />}
                        </Button>
                      ))}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Művelet törlése"
                        onClick={() =>
                          setDraft({ ...draft, steps: draft.steps.filter((_, j) => j !== i) })
                        }
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </fieldset>
                );
              })}
              <Button
                type="button"
                variant="outline"
                disabled={!devices.data?.devices.length || draft.steps.length >= 20}
                onClick={() =>
                  setDraft({
                    ...draft,
                    steps: [...draft.steps, { device: "", action: "power", value: "on" }],
                  })
                }
              >
                <Plus />
                Művelet hozzáadása
              </Button>
              {!devices.isPending && devices.data?.devices.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Nincs elérhető, támogatott eszköz. A NAS Kapcsolatok oldalán ellenőrizd az
                  összeköttetéseket.
                </p>
              )}
              {draft.visibility === "family" && (
                <fieldset className="grid gap-2">
                  <legend className="font-medium mb-2">Gyermekfiókok indítási engedélye</legend>
                  {q.data?.users
                    .filter((u) => u.role === "child")
                    .map((u) => (
                      <label key={u.id} className="flex items-center gap-3 min-h-11">
                        <input
                          type="checkbox"
                          checked={draft.allowedUsers.includes(u.id)}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              allowedUsers: e.target.checked
                                ? [...draft.allowedUsers, u.id]
                                : draft.allowedUsers.filter((id) => id !== u.id),
                            })
                          }
                        />
                        {u.name}
                      </label>
                    ))}
                  <p className="text-xs text-muted-foreground">
                    Csak önálló bejelentkezési fióknak adható indítási jog; a szülői gyermekprofil
                    nem belépési fiók. A mögöttes eszközengedélyek is szükségesek.
                  </p>
                </fieldset>
              )}
              <Button disabled={busy || draft.steps.length === 0}>
                {busy ? "Mentés…" : "Jelenet mentése"}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
      {q.data?.admin && (
        <details className="scene-acl">
          <summary>Eszközengedélyek</summary>
          <p className="text-xs text-muted-foreground my-3">
            Felnőttek a meglévő vezérlési jogukkal indíthatnak; gyermekfióknál minden eszközhöz
            külön engedély szükséges. A tiltás a közvetlen vezérlőkre is érvényes.
          </p>
          <ul className="mb-4 grid gap-2 text-sm">
            {q.data.acl?.map((a) => (
              <li key={`${a.user_id}:${a.device_key}`}>
                {q.data?.users.find((u) => u.id === a.user_id)?.name || a.user_id} ·{" "}
                {devices.data?.devices.find((d) => d.key === a.device_key)?.name || a.device_key}:{" "}
                {a.allowed ? "engedélyezve" : "tiltva"}
              </li>
            ))}
          </ul>
          <form
            className="scene-fields"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void action(() =>
                acl({
                  data: {
                    userId: String(f.get("user")),
                    device: String(f.get("device")),
                    allowed: f.get("allow") === "yes",
                  },
                }),
              );
            }}
          >
            <label className="scene-field">
              Fiók
              <select name="user">
                {q.data.users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="scene-field">
              Eszköz
              <select name="device" required>
                {devices.data?.devices.map((d) => (
                  <option key={d.key} value={d.key}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="scene-field">
              Jog
              <select name="allow">
                <option value="yes">Engedélyezés</option>
                <option value="no">Tiltás</option>
              </select>
            </label>
            <Button disabled={busy || !devices.data?.devices.length}>Engedély mentése</Button>
          </form>
        </details>
      )}
    </section>
  );
}
