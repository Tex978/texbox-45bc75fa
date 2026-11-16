import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BookOpen, CalendarDays, Check, Plus, RefreshCw, ShoppingCart, Trash2 } from "lucide-react";
import { Button } from "./ui/button";
import { Calendar } from "./Calendar";
import * as F from "@/lib/organizer.functions";
import { MEALS, mealLabels, type RecipeInput } from "@/lib/organizer-schema";
import { addDays } from "@/lib/task-schema";

// Shared state is refreshed by polling and on focus; it is not instant push.
const shopQuery = {
  queryKey: ["org-shop"],
  queryFn: () => F.shopList(),
  retry: false,
  staleTime: 0,
  refetchInterval: 15000,
} as const;
const recipeQuery = {
  queryKey: ["org-recipes"],
  queryFn: () => F.recipesList(),
  retry: false,
  staleTime: 0,
} as const;
const errText = (e: unknown) => (e instanceof Error ? e.message : "A művelet sikertelen.");
function useRun(keys: string[][]) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false),
    [msg, setMsg] = useState(""),
    [err, setErr] = useState("");
  async function run<T>(fn: () => Promise<T>, ok?: string) {
    if (busy) return undefined;
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      const r = await fn();
      await Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: k })));
      if (ok) setMsg(ok);
      return r;
    } catch (e) {
      setErr(errText(e));
      return undefined;
    } finally {
      setBusy(false);
    }
  }
  const status = (
    <>
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
    </>
  );
  return { busy, run, status };
}
function Unavailable({
  q,
  icon,
  title,
}: {
  q: { isPending: boolean; error: Error | null; refetch: () => unknown };
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <div className="task-unavailable">
      {icon}
      <h2>{q.isPending ? "Betöltés…" : title}</h2>
      {q.error && <p role="alert">{q.error.message}</p>}
      <Button variant="outline" onClick={() => void q.refetch()}>
        <RefreshCw size={18} /> Újrapróbálás
      </Button>
    </div>
  );
}
const fmtQty = (q: number | null, u: string) =>
  q === null ? u : `${q.toLocaleString("hu-HU")} ${u}`.trim();

function Shopping() {
  const q = useQuery(shopQuery),
    save = useServerFn(F.shopSaveItem),
    check = useServerFn(F.shopCheck),
    del = useServerFn(F.shopDelete),
    saveList = useServerFn(F.shopSaveList),
    { busy, run, status } = useRun([["org-shop"]]);
  const [listId, setListId] = useState(""),
    [name, setName] = useState(""),
    [more, setMore] = useState(false),
    [extra, setExtra] = useState({ qty: "", unit: "", store: "", category: "", note: "" }),
    [newList, setNewList] = useState("");
  const d = q.data;
  if (!d)
    return (
      <Unavailable q={q} icon={<ShoppingCart size={32} />} title="A bevásárlólista nem érhető el" />
    );
  const lid = d.lists.some((l) => l.id === listId) ? listId : (d.lists[0]?.id ?? "");
  const items = d.items.filter((i) => i.listId === lid);
  const open = items.filter((i) => !i.checked),
    done = items.filter((i) => i.checked);
  const add = (v: { name: string; unit?: string; store?: string; category?: string }) =>
    run(async () => {
      const qty = extra.qty ? Number(extra.qty.replace(",", ".")) : null;
      await save({
        data: {
          listId: lid,
          name: v.name,
          qty,
          unit: v.unit ?? extra.unit,
          store: v.store ?? extra.store,
          category: v.category ?? extra.category,
          note: extra.note,
        },
      });
      setName("");
      setExtra({ qty: "", unit: "", store: "", category: "", note: "" });
    }, "Hozzáadva.");
  const row = (i: (typeof items)[number]) => (
    <li key={i.id} className={`shop-item ${i.checked ? "shop-done" : ""}`}>
      <button
        className="shop-check"
        aria-label={i.checked ? `${i.name} visszavonása` : `${i.name} kipipálása`}
        disabled={busy}
        onClick={() => run(() => check({ data: { id: i.id, checked: !i.checked } }))}
      >
        {i.checked && <Check size={18} />}
      </button>
      <span className="shop-main">
        <strong>{i.name}</strong> {fmtQty(i.qty, i.unit) && <span>{fmtQty(i.qty, i.unit)}</span>}
        <small>
          {[i.category, i.store, i.note].filter(Boolean).join(" · ")}
          {(i.category || i.store || i.note) && " · "}
          {i.checked ? `megvette: ${i.checkedBy ?? "?"}` : `hozzáadta: ${i.addedBy}`}
        </small>
      </span>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`${i.name} törlése`}
        disabled={busy}
        onClick={() => run(() => del({ data: { ids: [i.id] } }))}
      >
        <Trash2 size={16} />
      </Button>
    </li>
  );
  return (
    <section className="org-section">
      <div className="task-filters">
        {d.lists.map((l) => (
          <Button
            key={l.id}
            variant={l.id === lid ? "default" : "outline"}
            onClick={() => setListId(l.id)}
          >
            {l.name}
          </Button>
        ))}
      </div>
      <form
        className="shop-add"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) void add({ name });
        }}
      >
        <input
          aria-label="Új termék"
          placeholder="Új termék, pl. tej"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Button type="submit" disabled={busy || !name.trim()} aria-label="Hozzáadás">
          <Plus size={18} /> Hozzáad
        </Button>
        <Button type="button" variant="outline" onClick={() => setMore(!more)}>
          {more ? "Kevesebb" : "Részletek"}
        </Button>
        {more && (
          <div className="shop-extra">
            <input
              aria-label="Mennyiség"
              inputMode="decimal"
              placeholder="Mennyiség"
              value={extra.qty}
              onChange={(e) => setExtra({ ...extra, qty: e.target.value })}
            />
            <input
              aria-label="Egység"
              placeholder="Egység (db, kg, l)"
              value={extra.unit}
              onChange={(e) => setExtra({ ...extra, unit: e.target.value })}
            />
            <input
              aria-label="Bolt"
              placeholder="Bolt"
              value={extra.store}
              onChange={(e) => setExtra({ ...extra, store: e.target.value })}
            />
            <input
              aria-label="Kategória"
              placeholder="Kategória"
              value={extra.category}
              onChange={(e) => setExtra({ ...extra, category: e.target.value })}
            />
            <input
              aria-label="Megjegyzés"
              placeholder="Megjegyzés"
              value={extra.note}
              onChange={(e) => setExtra({ ...extra, note: e.target.value })}
            />
          </div>
        )}
      </form>
      {status}
      {d.frequent.length > 0 && (
        <div className="shop-frequent" aria-label="Gyakran vásárolt">
          {d.frequent
            .filter((f) => !open.some((o) => o.name.toLowerCase() === f.name.toLowerCase()))
            .slice(0, 10)
            .map((f) => (
              <Button
                key={f.name}
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => void add(f)}
              >
                + {f.name}
              </Button>
            ))}
        </div>
      )}
      {!open.length && <p className="task-empty">Nincs megvásárolandó tétel ezen a listán.</p>}
      <ul className="shop-items">{open.map(row)}</ul>
      {done.length > 0 && (
        <>
          <div className="task-toolbar">
            <h3>Megvéve ({done.length})</h3>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() =>
                run(() => del({ data: { ids: done.map((i) => i.id) } }), "Megvett tételek törölve.")
              }
            >
              Megvettek törlése
            </Button>
          </div>
          <ul className="shop-items">{done.map(row)}</ul>
        </>
      )}
      <p className="task-notice">
        Frissítés 15 másodpercenként és visszatéréskor; nem azonnali. Utoljára:{" "}
        {new Date(d.at).toLocaleTimeString("hu-HU")}
      </p>
      {d.canManageLists && (
        <form
          className="shop-add"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => saveList({ data: { name: newList } }), "Új lista létrehozva.").then(() =>
              setNewList(""),
            );
          }}
        >
          <input
            aria-label="Új lista neve"
            placeholder="Új lista, pl. Drogéria"
            value={newList}
            onChange={(e) => setNewList(e.target.value)}
          />
          <Button type="submit" variant="outline" disabled={busy || !newList.trim()}>
            Új lista
          </Button>
        </form>
      )}
    </section>
  );
}

const blankRecipe: RecipeInput = {
  title: "",
  description: "",
  category: "Főétel",
  servings: 4,
  minutes: 30,
  ingredients: [],
  steps: [],
  image: "",
};
function RecipeEditor({
  value,
  onDone,
}: {
  value: RecipeInput & { archived?: boolean };
  onDone: () => void;
}) {
  const save = useServerFn(F.recipeSave),
    { busy, run, status } = useRun([["org-recipes"]]);
  const [f, setF] = useState(value),
    [ings, setIngs] = useState(
      (value.ingredients ?? [])
        .map((i) => `${i.qty ?? ""} ${i.unit ?? ""} ${i.name}`.trim())
        .join("\n"),
    ),
    [steps, setSteps] = useState((value.steps ?? []).join("\n"));
  const parse = () =>
    ings
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const m = /^(\d+(?:[.,]\d+)?)\s+(\S+)\s+(.+)$/.exec(l);
        return m
          ? { qty: Number(m[1]!.replace(",", ".")), unit: m[2]!, name: m[3]! }
          : { qty: null, unit: "", name: l };
      });
  return (
    <form
      className="task-form reward-form"
      onSubmit={(e) => {
        e.preventDefault();
        void run(
          () =>
            save({
              data: {
                ...f,
                ingredients: parse(),
                steps: steps
                  .split("\n")
                  .map((s) => s.trim())
                  .filter(Boolean),
              },
            }),
          "Recept mentve.",
        ).then((r) => r && onDone());
      }}
    >
      <label>
        Cím
        <input required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
      </label>
      <label>
        Leírás
        <textarea
          value={f.description}
          onChange={(e) => setF({ ...f, description: e.target.value })}
        />
      </label>
      <label>
        Kategória
        <input value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} />
      </label>
      <label>
        Adag
        <input
          type="number"
          min={1}
          max={50}
          value={f.servings}
          onChange={(e) => setF({ ...f, servings: Number(e.target.value) })}
        />
      </label>
      <label>
        Idő (perc)
        <input
          type="number"
          min={0}
          value={f.minutes}
          onChange={(e) => setF({ ...f, minutes: Number(e.target.value) })}
        />
      </label>
      <label>
        Hozzávalók (soronként: mennyiség egység név, pl. „200 g liszt”)
        <textarea rows={5} value={ings} onChange={(e) => setIngs(e.target.value)} />
      </label>
      <label>
        Lépések (soronként egy)
        <textarea rows={5} value={steps} onChange={(e) => setSteps(e.target.value)} />
      </label>
      <label>
        Fotó (https link, opcionális)
        <input value={f.image} onChange={(e) => setF({ ...f, image: e.target.value })} />
      </label>
      {f.id && (
        <label className="task-check">
          <input
            type="checkbox"
            checked={!!f.archived}
            onChange={(e) => setF({ ...f, archived: e.target.checked })}
          />
          Archivált
        </label>
      )}
      {status}
      <div className="task-actions">
        <Button type="submit" disabled={busy}>
          Mentés
        </Button>
        <Button type="button" variant="outline" onClick={onDone}>
          Mégse
        </Button>
      </div>
    </form>
  );
}
function Recipes() {
  const q = useQuery(recipeQuery),
    shop = useQuery(shopQuery),
    toList = useServerFn(F.recipeToList),
    { busy, run, status } = useRun([["org-shop"]]);
  const [search, setSearch] = useState(""),
    [cat, setCat] = useState(""),
    [edit, setEdit] = useState<(RecipeInput & { archived?: boolean }) | null>(null),
    [open, setOpen] = useState(""),
    [servings, setServings] = useState<Record<string, number>>({});
  const d = q.data;
  if (!d)
    return <Unavailable q={q} icon={<BookOpen size={32} />} title="A receptek nem érhetők el" />;
  if (edit) return <RecipeEditor value={edit} onDone={() => setEdit(null)} />;
  const s = search.trim().toLowerCase();
  const shown = d.recipes.filter(
    (r) =>
      (!r.archived || d.canEdit) &&
      (!cat || r.category === cat) &&
      (!s ||
        `${r.title} ${r.description} ${r.ingredients.map((i) => i.name).join(" ")}`
          .toLowerCase()
          .includes(s)),
  );
  const listId = shop.data?.lists[0]?.id;
  async function addToList(r: (typeof shown)[number]) {
    if (!listId) return;
    const n = servings[r.id] ?? r.servings;
    const res = await run(() => toList({ data: { recipeId: r.id, listId, servings: n } }));
    if (res?.needsConfirm) {
      if (
        !window.confirm(
          `Már a listán: ${res.merges.join(", ")}. Összevonjam az azonos egységű tételeket?`,
        )
      )
        return;
      const ok = await run(() =>
        toList({ data: { recipeId: r.id, listId, servings: n, confirm: true } }),
      );
      if (ok) await run(async () => ok, `Listára téve: ${ok.added} új, ${ok.merged} összevonva.`);
    } else if (res) await run(async () => res, `Listára téve: ${res.added} tétel.`);
  }
  return (
    <section className="org-section">
      <div className="task-filters">
        <input
          aria-label="Recept keresése"
          placeholder="Keresés…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select aria-label="Kategória" value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">Minden kategória</option>
          {[...new Set(d.recipes.map((r) => r.category).filter(Boolean))].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        {d.canEdit && (
          <Button onClick={() => setEdit({ ...blankRecipe })}>
            <Plus size={16} /> Új recept
          </Button>
        )}
      </div>
      {status}
      {!shown.length && (
        <p className="task-empty">Még nincs recept{d.canEdit ? " — hozz létre egyet." : "."}</p>
      )}
      <div className="reward-grid">
        {shown.map((r) => (
          <article key={r.id} className={`reward-card ${r.archived ? "task-done" : ""}`}>
            {r.image && <img src={r.image} alt="" referrerPolicy="no-referrer" loading="lazy" />}
            <h3>{r.title}</h3>
            <p className="reward-meta">
              {[
                r.category,
                `${r.servings} adag`,
                r.minutes ? `${r.minutes} perc` : "",
                r.archived ? "archivált" : "",
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {open === r.id ? (
              <>
                {r.description && <p>{r.description}</p>}
                <ul>
                  {r.ingredients.map((i, n) => (
                    <li key={n}>
                      {fmtQty(i.qty, i.unit)} {i.name}
                    </li>
                  ))}
                </ul>
                <ol>
                  {r.steps.map((st, n) => (
                    <li key={n}>{st}</li>
                  ))}
                </ol>
              </>
            ) : null}
            <div className="task-actions">
              <Button variant="outline" onClick={() => setOpen(open === r.id ? "" : r.id)}>
                {open === r.id ? "Bezár" : "Megnyit"}
              </Button>
              {d.canEdit && (
                <Button variant="outline" onClick={() => setEdit(r)}>
                  Szerkesztés
                </Button>
              )}
              {d.canEdit && !r.archived && listId && r.ingredients.length > 0 && (
                <>
                  <input
                    aria-label={`${r.title} adagszám`}
                    type="number"
                    min={1}
                    max={50}
                    className="org-servings"
                    value={servings[r.id] ?? r.servings}
                    onChange={(e) => setServings({ ...servings, [r.id]: Number(e.target.value) })}
                  />
                  <Button disabled={busy} onClick={() => void addToList(r)}>
                    <ShoppingCart size={16} /> Listára
                  </Button>
                </>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function Menu() {
  const [date, setDate] = useState<string | undefined>(undefined);
  const get = useServerFn(F.menuGet);
  const q = useQuery({
    queryKey: ["org-menu", date ?? "now"],
    queryFn: () => get({ data: { date } }),
    retry: false,
    staleTime: 0,
    refetchInterval: 60000,
  });
  const recipes = useQuery(recipeQuery),
    add = useServerFn(F.menuAdd),
    remove = useServerFn(F.menuRemove),
    copy = useServerFn(F.menuCopy),
    { busy, run, status } = useRun([["org-menu"]]);
  const [form, setForm] = useState<Record<string, { recipeId: string; title: string }>>({});
  const d = q.data;
  if (!d)
    return (
      <Unavailable q={q} icon={<CalendarDays size={32} />} title="A heti menü nem érhető el" />
    );
  const days = Array.from({ length: 7 }, (_, i) => addDays(d.start, i));
  const active = (recipes.data?.recipes ?? []).filter((r) => !r.archived);
  async function copyPrev() {
    const from = addDays(d!.start, -7);
    const r = await run(() => copy({ data: { from, to: d!.start } }));
    if (
      r?.needsConfirm &&
      window.confirm("Ezen a héten már van terv. Hozzáadjam az előző hét ételeit is?")
    )
      await run(() => copy({ data: { from, to: d!.start, confirm: true } }), "Előző hét átvéve.");
    else if (r && !r.needsConfirm)
      await run(
        async () => r,
        r.copied ? `${r.copied} étel átvéve.` : "Az előző héten nem volt terv.",
      );
  }
  return (
    <section className="org-section">
      <div className="task-toolbar">
        <div className="task-actions">
          <Button variant="outline" onClick={() => setDate(addDays(d.start, -7))}>
            ← Előző hét
          </Button>
          <strong>
            {d.start} – {addDays(d.start, 6)}
          </strong>
          <Button variant="outline" onClick={() => setDate(addDays(d.start, 7))}>
            Következő hét →
          </Button>
          <Button variant="ghost" onClick={() => setDate(undefined)}>
            Ez a hét
          </Button>
        </div>
        {d.canEdit && (
          <Button variant="outline" disabled={busy} onClick={() => void copyPrev()}>
            Előző hét átvétele
          </Button>
        )}
      </div>
      {status}
      <div className="menu-week">
        {days.map((day) => {
          const label = new Date(`${day}T12:00:00Z`).toLocaleDateString("hu-HU", {
            weekday: "long",
            month: "short",
            day: "numeric",
            timeZone: "UTC",
          });
          return (
            <article key={day} className={`menu-day ${day === d.today ? "menu-today" : ""}`}>
              <h3>{label}</h3>
              {MEALS.map((meal) => {
                const entries = d.entries.filter((e) => e.day === day && e.meal === meal);
                const k = `${day}:${meal}`,
                  v = form[k] ?? { recipeId: "", title: "" };
                if (!entries.length && !d.canEdit) return null;
                return (
                  <div key={meal} className="menu-meal">
                    <span className="menu-meal-label">{mealLabels[meal]}</span>
                    {entries.map((e) => (
                      <span key={e.id} className="menu-entry">
                        {e.title} <small>({e.servings} adag)</small>
                        {d.canEdit && (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`${e.title} törlése`}
                            disabled={busy}
                            onClick={() => run(() => remove({ data: { id: e.id } }))}
                          >
                            <Trash2 size={14} />
                          </Button>
                        )}
                      </span>
                    ))}
                    {d.canEdit && (
                      <form
                        className="menu-add"
                        onSubmit={(ev) => {
                          ev.preventDefault();
                          void run(() =>
                            add({
                              data: {
                                day,
                                meal,
                                recipeId: v.recipeId || null,
                                title: v.title,
                                servings: 4,
                              },
                            }),
                          ).then(
                            (r) => r && setForm({ ...form, [k]: { recipeId: "", title: "" } }),
                          );
                        }}
                      >
                        <select
                          aria-label={`${label} ${mealLabels[meal]} recept`}
                          value={v.recipeId}
                          onChange={(e) =>
                            setForm({ ...form, [k]: { ...v, recipeId: e.target.value } })
                          }
                        >
                          <option value="">Recept…</option>
                          {active.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.title}
                            </option>
                          ))}
                        </select>
                        <input
                          aria-label={`${label} ${mealLabels[meal]} étel`}
                          placeholder="vagy ételnév"
                          value={v.title}
                          onChange={(e) =>
                            setForm({ ...form, [k]: { ...v, title: e.target.value } })
                          }
                        />
                        <Button
                          type="submit"
                          size="icon"
                          aria-label="Hozzáadás"
                          disabled={busy || (!v.recipeId && !v.title.trim())}
                        >
                          <Plus size={16} />
                        </Button>
                      </form>
                    )}
                  </div>
                );
              })}
            </article>
          );
        })}
      </div>
    </section>
  );
}
export function Organizer() {
  const [tab, setTab] = useState("Bevásárlás");
  return (
    <div className="tasks-area rewards-area">
      <p className="task-notice">
        A listák, receptek, a heti menü és a naptár csak a saját NAS-on mentődnek, és minden
        családtagnál közösek.
      </p>
      <div className="task-tabs" role="tablist">
        {[
          ["Bevásárlás", ShoppingCart],
          ["Receptek", BookOpen],
          ["Heti menü", CalendarDays],
        ].map(([t, I]) => {
          const Icon = I as typeof ShoppingCart;
          return (
            <Button
              key={t as string}
              role="tab"
              aria-selected={tab === t}
              variant={tab === t ? "default" : "outline"}
              onClick={() => setTab(t as string)}
            >
              <Icon size={16} /> {t as string}
            </Button>
          );
        })}
      </div>
      {tab === "Bevásárlás" ? (
        <Shopping />
      ) : tab === "Receptek" ? (
        <Recipes />
      ) : tab === "Naptár" ? (
        <Calendar />
      ) : (
        <Menu />
      )}
    </div>
  );
}
