import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertCircle, Archive, History, ListTodo, Pencil, Pin, Plus, RefreshCw, RotateCcw } from "lucide-react";
import { Button } from "./ui/button";
import { notesList, noteSave, noteArchive, noteHistory, matterTask } from "@/lib/notes.functions";
import {
  MATTER_STATUS,
  NOTE_CATEGORIES,
  PRIORITY,
  SECRET_HINT,
  type FamilyItemInput,
} from "@/lib/notes-schema";
import { addDays } from "@/lib/task-schema";

type Kind = "note" | "matter";
const blank = (kind: Kind): FamilyItemInput =>
  kind === "note"
    ? { kind, title: "", content: "", category: "Egyéb", visibility: "personal", childVisible: false, pinned: false, url: "", checklist: [] }
    : { kind, title: "", content: "", category: "Ügyintézés", visibility: "family", childVisible: false, pinned: false, url: "", assignee: null, due: null, status: "planned", priority: "normal" };
const when = (ms: number) =>
  new Date(ms).toLocaleString("hu-HU", { timeZone: "Europe/Budapest", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

function Editor({
  value,
  people,
  onDone,
}: {
  value: FamilyItemInput;
  people: { key: string; name: string }[];
  onDone: (msg?: string) => void;
}) {
  const save = useServerFn(noteSave);
  const [f, setF] = useState(value),
    [err, setErr] = useState(""),
    [busy, setBusy] = useState(false),
    [newItem, setNewItem] = useState("");
  const set = (p: Partial<FamilyItemInput>) => setF({ ...f, ...p } as FamilyItemInput);
  return (
    <form
      className="recipe-editor"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr("");
        try {
          await save({ data: f });
          onDone("Mentve a NAS-on.");
        } catch (x) {
          setErr(x instanceof Error ? x.message : "A mentés nem sikerült.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3>{f.id ? "Szerkesztés" : f.kind === "note" ? "Új jegyzet" : "Új ügy"}</h3>
      <label>
        Cím
        <input required maxLength={120} value={f.title} onChange={(e) => set({ title: e.target.value })} />
      </label>
      <label>
        Leírás
        <textarea rows={5} maxLength={5000} value={f.content} onChange={(e) => set({ content: e.target.value })} />
      </label>
      <p className="dash-note">{SECRET_HINT}</p>
      <div className="scene-fields">
        <label>
          Kategória
          <select value={f.category} onChange={(e) => set({ category: e.target.value as FamilyItemInput["category"] })}>
            {NOTE_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          Láthatóság
          <select
            value={f.visibility}
            onChange={(e) => set({ visibility: e.target.value as "personal", childVisible: false })}
          >
            <option value="personal">Csak én</option>
            <option value="family">Felnőtt családtagok</option>
          </select>
        </label>
      </div>
      {f.visibility === "family" && (
        <label className="notif-toggle">
          <input type="checkbox" checked={f.childVisible} onChange={(e) => set({ childVisible: e.target.checked })} />
          Gyermekfiókok is láthatják
        </label>
      )}
      <label className="notif-toggle">
        <input type="checkbox" checked={f.pinned} onChange={(e) => set({ pinned: e.target.checked })} /> Kitűzés
      </label>
      <label>
        Hivatkozás (https, nem kötelező)
        <input type="url" value={f.url} onChange={(e) => set({ url: e.target.value })} placeholder="https://" />
      </label>
      {f.kind === "matter" ? (
        <div className="scene-fields">
          <label>
            Felelős
            <select value={f.assignee ?? ""} onChange={(e) => set({ assignee: e.target.value || null })}>
              <option value="">Nincs kijelölve</option>
              {people.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Határidő
            <input type="date" value={f.due ?? ""} onChange={(e) => set({ due: e.target.value || null })} />
          </label>
          <label>
            Státusz
            <select value={f.status} onChange={(e) => set({ status: e.target.value as "planned" })}>
              {Object.entries(MATTER_STATUS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            Prioritás
            <select value={f.priority} onChange={(e) => set({ priority: e.target.value as "normal" })}>
              {Object.entries(PRIORITY).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : (
        <fieldset className="notes-check">
          <legend>Rövid lista (nem feladat)</legend>
          {f.checklist.map((c, i) => (
            <label key={i} className="notif-toggle">
              <input
                type="checkbox"
                checked={c.done}
                onChange={(e) =>
                  set({ checklist: f.checklist.map((x, j) => (j === i ? { ...x, done: e.target.checked } : x)) })
                }
              />
              {c.text}
              <Button type="button" size="sm" variant="ghost" onClick={() => set({ checklist: f.checklist.filter((_, j) => j !== i) })}>
                Törlés
              </Button>
            </label>
          ))}
          {f.checklist.length < 30 && (
            <div className="flex gap-2">
              <input aria-label="Új listaelem" value={newItem} maxLength={200} onChange={(e) => setNewItem(e.target.value)} />
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!newItem.trim()}
                onClick={() => {
                  set({ checklist: [...f.checklist, { text: newItem.trim(), done: false }] });
                  setNewItem("");
                }}
              >
                Hozzáadás
              </Button>
            </div>
          )}
        </fieldset>
      )}
      {err && <p className="task-error" role="alert">{err}</p>}
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy}>{busy ? "Mentés…" : "Mentés"}</Button>
        <Button type="button" variant="outline" onClick={() => onDone()}>
          Mégse
        </Button>
      </div>
    </form>
  );
}

export function Notes() {
  const qc = useQueryClient();
  const [kind, setKind] = useState<Kind>("note"),
    [archived, setArchivedView] = useState(false),
    [search, setSearch] = useState(""),
    [cat, setCat] = useState(""),
    [status, setStatus] = useState(""),
    [who, setWho] = useState(""),
    [edit, setEdit] = useState<FamilyItemInput | null>(null),
    [hist, setHist] = useState<string | null>(null),
    [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const list = useServerFn(notesList),
    archive = useServerFn(noteArchive),
    history = useServerFn(noteHistory),
    toTask = useServerFn(matterTask);
  const q = useQuery({
    queryKey: ["family-notes", archived],
    queryFn: () => list({ data: { archived } }),
    retry: false,
    refetchInterval: 30000,
  });
  const h = useQuery({
    queryKey: ["family-note-history", hist],
    queryFn: () => history({ data: { id: hist! } }),
    enabled: !!hist,
    retry: false,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["family-notes"] });
  async function act(fn: () => Promise<unknown>, ok: string) {
    setMsg(null);
    try {
      await fn();
      setMsg({ text: ok });
      await refresh();
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "A művelet nem sikerült.", bad: true });
    }
  }
  if (q.isPending) return <div className="dash-skeleton" aria-label="Betöltés"><span /><span /></div>;
  if (q.error)
    return (
      <div className="dash-error" role="status">
        <AlertCircle size={16} /> <span>{q.error.message}</span>
        <Button variant="ghost" size="sm" onClick={() => void q.refetch()}>
          <RefreshCw size={14} /> Újra
        </Button>
      </div>
    );
  const d = q.data;
  const peopleName = (k: string | null) => d.people.find((p) => p.key === k)?.name ?? "";
  if (edit)
    return (
      <Editor
        value={edit}
        people={d.people}
        onDone={(m) => {
          setEdit(null);
          if (m) setMsg({ text: m });
          void refresh();
        }}
      />
    );
  const s = search.trim().toLowerCase();
  const items = d.items.filter(
    (i) =>
      i.kind === kind &&
      (!cat || i.category === cat) &&
      (!s || `${i.title} ${i.content}`.toLowerCase().includes(s)) &&
      (i.kind !== "matter" || ((!status || i.status === status) && (!who || i.assignee === who))),
  );
  const soon = archived
    ? []
    : d.items.filter(
        (i) => i.kind === "matter" && i.status !== "done" && i.due && i.due <= addDays(d.today, 14),
      );
  return (
    <section className="notes-area">
      {soon.length > 0 && (
        <div className="dash-card" aria-label="Közelgő ügyek">
          <h3 className="dash-sub">Közelgő ügyek (14 nap)</h3>
          <ul className="dash-list">
            {soon.slice(0, 5).map((i) => (
              <li key={i.id}>
                <span>{i.title}</span>
                <small>
                  {i.kind === "matter" && (i.due! < d.today ? `lejárt: ${i.due}` : i.due)}
                  {i.kind === "matter" && i.assignee ? ` · ${peopleName(i.assignee)}` : ""}
                </small>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="task-tabs" role="tablist">
        {(["note", "matter"] as Kind[]).map((k) => (
          <Button key={k} role="tab" aria-selected={kind === k} variant={kind === k ? "default" : "outline"} onClick={() => setKind(k)}>
            {k === "note" ? "Jegyzetek" : "Ügyek"}
          </Button>
        ))}
        <Button variant={archived ? "default" : "ghost"} aria-pressed={archived} onClick={() => setArchivedView(!archived)}>
          <Archive size={15} /> Archívum
        </Button>
      </div>
      <div className="notes-filters">
        <input aria-label="Keresés" placeholder="Keresés…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select aria-label="Kategória szűrő" value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">Minden kategória</option>
          {NOTE_CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        {kind === "matter" && (
          <>
            <select aria-label="Státusz szűrő" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Minden státusz</option>
              {Object.entries(MATTER_STATUS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <select aria-label="Felelős szűrő" value={who} onChange={(e) => setWho(e.target.value)}>
              <option value="">Minden felelős</option>
              {d.people.map((p) => (
                <option key={p.key} value={p.key}>{p.name}</option>
              ))}
            </select>
          </>
        )}
        {d.canCreate && !archived && (
          <Button onClick={() => setEdit(blank(kind))}>
            <Plus size={15} /> {kind === "note" ? "Új jegyzet" : "Új ügy"}
          </Button>
        )}
      </div>
      {msg && <p className={msg.bad ? "task-error" : "task-ok"} role="status">{msg.text}</p>}
      {items.length ? (
        <ul className="notes-list">
          {items.map((i) => (
            <li key={i.id} className="dash-card">
              <div className="notes-head">
                <strong>
                  {i.pinned && <Pin size={14} aria-label="Kitűzve" />} {i.title}
                </strong>
                <small>
                  {i.category} · {i.visibility === "personal" ? "csak én" : i.childVisible ? "család + gyerekek" : "felnőttek"}
                </small>
              </div>
              {i.content && <p className="notes-content">{i.content}</p>}
              {i.kind === "note" && i.checklist.length > 0 && (
                <ul className="notes-checklist">
                  {i.checklist.map((c, n) => (
                    <li key={n} className={c.done ? "is-done" : ""}>{c.done ? "☑" : "☐"} {c.text}</li>
                  ))}
                </ul>
              )}
              {i.kind === "matter" && (
                <p className="dash-note">
                  {MATTER_STATUS[i.status]} · {PRIORITY[i.priority]} prioritás
                  {i.due ? ` · határidő: ${i.due}` : ""}
                  {i.assignee ? ` · ${peopleName(i.assignee) || "felelős"}` : ""}
                </p>
              )}
              {i.url && (
                <a href={i.url} target="_blank" rel="noopener noreferrer nofollow" className="dash-link">
                  Hivatkozás megnyitása ↗
                </a>
              )}
              <small className="dash-note">
                {i.ownerName} · módosította {i.updatedByName}, {when(i.updatedAt)}
              </small>
              <div className="flex flex-wrap gap-1">
                {i.editable && !archived && (
                  <Button size="sm" variant="outline" onClick={() => setEdit(i as FamilyItemInput)}>
                    <Pencil size={14} /> Szerkesztés
                  </Button>
                )}
                {i.editable && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      void act(
                        () => archive({ data: { id: i.id, version: i.version, archived: !archived } }),
                        archived ? "Visszaállítva." : "Archiválva.",
                      )
                    }
                  >
                    {archived ? <RotateCcw size={14} /> : <Archive size={14} />} {archived ? "Visszaállítás" : "Archiválás"}
                  </Button>
                )}
                {i.kind === "matter" && i.editable && !archived && (
                  i.taskId ? (
                    <Link to="/tasks" className="dash-link">Kapcsolt feladat →</Link>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void act(() => toTask({ data: { id: i.id } }), "Feladat létrehozva (0 pont).")}
                    >
                      <ListTodo size={14} /> Feladat létrehozása
                    </Button>
                  )
                )}
                <Button size="sm" variant="ghost" onClick={() => setHist(hist === i.id ? null : i.id)}>
                  <History size={14} /> Előzmények
                </Button>
              </div>
              {hist === i.id && (
                <ul className="dash-list">
                  {h.isPending ? <li>Betöltés…</li> : h.error ? <li>{h.error.message}</li> : h.data?.map((e, n) => (
                    <li key={n}><span>{e.actorName}: {e.action}</span><small>{when(e.at)}</small></li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="dash-empty">
          {archived ? "Az archívum üres." : kind === "note" ? "Még nincs jegyzet." : "Még nincs ügy."}
        </p>
      )}
    </section>
  );
}
