import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Gift, Heart, RefreshCw, Star, Target } from "lucide-react";
import { Button } from "./ui/button";
import {
  pointsList,
  pointsAdjust,
  rewardSave,
  rewardRedeem,
  redemptionDecide,
  rewardWish,
} from "@/lib/points.functions";
import { redemptionLabels, type RewardInput } from "@/lib/points-schema";

export const pointsQuery = {
  queryKey: ["family-points"],
  queryFn: () => pointsList(),
  retry: false,
  staleTime: 0,
  refetchInterval: 60000,
} as const;
type Data = Awaited<ReturnType<typeof pointsList>>;
const reqId = () => crypto.randomUUID();
const fmt = (n: number) => n.toLocaleString("hu-HU");

/** Personal points card; shows nothing fake when points are unavailable (e.g. preview). */
export function PointsCard() {
  const q = useQuery(pointsQuery);
  const p = q.data?.people.find((v) => v.key === q.data?.me);
  if (!p) return null;
  return (
    <Link to="/rewards" className="points-card" aria-label="Saját pontjaim és ajándékbolt">
      <Star size={20} />
      <span>
        <strong>{fmt(p.available)} pont</strong> elérhető
        {p.reserved > 0 && <small> · {fmt(p.reserved)} foglalva</small>}
      </span>
      <span className="points-card-link">Ajándékbolt →</span>
    </Link>
  );
}
const emptyReward: RewardInput = {
  name: "",
  description: "",
  category: "Élmény",
  price: 10,
  stock: null,
  eligible: [],
  image: "",
  active: true,
  archived: false,
};
export function Rewards() {
  const q = useQuery(pointsQuery),
    qc = useQueryClient(),
    adjust = useServerFn(pointsAdjust),
    save = useServerFn(rewardSave),
    redeemFn = useServerFn(rewardRedeem),
    decide = useServerFn(redemptionDecide),
    wish = useServerFn(rewardWish);
  const [tab, setTab] = useState("Bolt"),
    [who, setWho] = useState(""),
    [cat, setCat] = useState(""),
    [busy, setBusy] = useState(false),
    [msg, setMsg] = useState(""),
    [err, setErr] = useState(""),
    [edit, setEdit] = useState<RewardInput | null>(null),
    [adj, setAdj] = useState({ person: "", delta: 0, reason: "" }),
    [reasons, setReasons] = useState<Record<string, string>>({});
  async function run(fn: () => Promise<unknown>, ok: string) {
    if (busy) return;
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: pointsQuery.queryKey });
      setMsg(ok);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "A művelet sikertelen.");
    } finally {
      setBusy(false);
    }
  }
  const d: Data | undefined = q.data;
  if (!d)
    return (
      <div className="task-unavailable">
        <Gift size={32} />
        <h2>{q.isPending ? "Pontok betöltése…" : "A pontok és az ajándékbolt nem érhetők el"}</h2>
        {q.error && <p role="alert">{q.error.message}</p>}
        <Button variant="outline" onClick={() => void q.refetch()}>
          <RefreshCw size={18} /> Újrapróbálás
        </Button>
      </div>
    );
  const sel = d.people.find((p) => p.key === (who || d.me)) ?? d.people[0];
  const goal = d.wishes.find((w) => w.person === sel?.key && w.goal);
  const goalReward = d.rewards.find((r) => r.id === goal?.rewardId);
  const shop = d.rewards.filter(
    (r) =>
      !r.archived &&
      r.active &&
      (!r.eligible.length || (sel && r.eligible.includes(sel.key))) &&
      (!cat || r.category === cat),
  );
  const pending = d.redemptions.filter((r) => r.status === "reserved" || r.status === "awaiting");
  const tabs = ["Bolt", "Pontjaim", ...(d.parent ? ["Jóváhagyás", "Kezelés"] : [])];
  const name = (k: string) => d.people.find((p) => p.key === k)?.name ?? "Korábbi családtag";
  return (
    <div className="tasks-area rewards-area">
      <p className="task-notice">
        Minden családtagnak saját pontegyenlege van; közös családi pontszámla nincs. Az adatok csak
        a saját NAS-on mentődnek.
      </p>
      {d.people.length > 1 && (
        <label className="rewards-who">
          Kinek a pontjai
          <select value={sel?.key} onChange={(e) => setWho(e.target.value)}>
            {d.people.map((p) => (
              <option key={p.key} value={p.key}>
                {p.name}
                {p.key === d.me ? " (én)" : ""}
              </option>
            ))}
          </select>
        </label>
      )}
      {sel && (
        <section className="points-summary" aria-label="Pontegyenleg">
          <div><span>Elérhető</span><strong>{fmt(sel.available)}</strong></div>
          <div><span>Egyenleg</span><strong>{fmt(sel.balance)}</strong></div>
          <div><span>Szerzett</span><strong>{fmt(sel.earned)}</strong></div>
          <div><span>Elköltött</span><strong>{fmt(sel.spent)}</strong></div>
          {sel.reserved > 0 && <div><span>Foglalva</span><strong>{fmt(sel.reserved)}</strong></div>}
          {goalReward && (
            <p className="points-goal">
              <Target size={16} /> Cél: {goalReward.name} —{" "}
              {sel.available >= goalReward.price
                ? "már beváltható!"
                : `még ${fmt(goalReward.price - sel.available)} pont`}
              <progress max={Math.max(goalReward.price, 1)} value={Math.max(0, Math.min(sel.available, goalReward.price))} />
            </p>
          )}
        </section>
      )}
      <div className="task-tabs" role="tablist">
        {tabs.map((t) => (
          <Button key={t} role="tab" aria-selected={tab === t} variant={tab === t ? "default" : "outline"} onClick={() => setTab(t)}>
            {t}
            {t === "Jóváhagyás" && pending.length > 0 ? ` (${pending.length})` : ""}
          </Button>
        ))}
      </div>
      {msg && <p className="task-ok" role="status">{msg}</p>}
      {err && <p className="task-error" role="alert">{err}</p>}
      {tab === "Bolt" && sel && (
        <>
          <div className="task-filters">
            <select aria-label="Kategória" value={cat} onChange={(e) => setCat(e.target.value)}>
              <option value="">Minden kategória</option>
              {[...new Set(d.rewards.map((r) => r.category))].map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          {!shop.length && <p className="task-empty">Még nincs elérhető jutalom{d.parent ? " — a Kezelés fülön hozhatsz létre." : "."}</p>}
          <div className="reward-grid">
            {shop.map((r) => {
              const w = d.wishes.find((x) => x.person === sel.key && x.rewardId === r.id);
              const missing = r.price - sel.available;
              const child = sel.key !== d.me || d.people.find((p) => p.key === sel.key)?.child;
              const isChild = sel.child;
              return (
                <article key={r.id} className="reward-card">
                  {r.image && <img src={r.image} alt="" referrerPolicy="no-referrer" loading="lazy" />}
                  <h3>{r.name}</h3>
                  <p className="reward-meta">{r.category} · <strong>{fmt(r.price)} pont</strong>{r.stock !== null && ` · ${r.stock} db`}</p>
                  {r.description && <p>{r.description}</p>}
                  {missing > 0 && <p className="reward-missing">Még {fmt(missing)} pont kell</p>}
                  <div className="task-actions">
                    <Button
                      disabled={busy || missing > 0 || r.stock === 0 || (!!child && !isChild && sel.key !== d.me)}
                      onClick={() =>
                        run(
                          () => redeemFn({ data: { rewardId: r.id, requestId: reqId(), expectedPrice: r.price, person: sel.key === d.me ? undefined : sel.key } }),
                          isChild ? "Kérés elküldve, a pontok foglalva szülői jóváhagyásig." : "Beváltva, a pontok levonva.",
                        )
                      }
                    >
                      <Gift size={16} /> {isChild ? "Kérem" : "Beváltom"}
                    </Button>
                    <Button variant="outline" aria-label={w ? "Levétel a kívánságlistáról" : "Kívánságlistára"} disabled={busy}
                      onClick={() => run(() => wish({ data: { person: sel.key, rewardId: r.id, wish: !w, goal: false } }), w ? "Levéve a kívánságlistáról." : "Kívánságlistára téve.")}>
                      <Heart size={16} fill={w ? "currentColor" : "none"} />
                    </Button>
                    <Button variant="outline" aria-label="Legyen ez a célom" disabled={busy || !!w?.goal}
                      onClick={() => run(() => wish({ data: { person: sel.key, rewardId: r.id, wish: true, goal: true } }), "Személyes cél beállítva.")}>
                      <Target size={16} />
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
      {tab === "Pontjaim" && sel && (
        <>
          <h3>Ponttörténet – {sel.name}</h3>
          {!sel.history.length && <p className="task-empty">Még nincs ponttranzakció.</p>}
          <ul className="points-history">
            {sel.history.map((h) => (
              <li key={h.id}>
                <strong className={h.delta < 0 ? "neg" : "pos"}>{h.delta > 0 ? "+" : ""}{fmt(h.delta)}</strong>
                <span>{h.reason}</span>
                <small>{new Date(h.at).toLocaleString("hu-HU", { timeZone: "Europe/Budapest" })}</small>
              </li>
            ))}
          </ul>
          <h3>Beváltások</h3>
          <ul className="points-history">
            {d.redemptions.filter((r) => r.person === sel.key).map((r) => (
              <li key={r.id}>
                <strong>{fmt(r.price)}</strong>
                <span>{r.rewardName} — {redemptionLabels[r.status]}{r.reason && ` (${r.reason})`}</span>
                {r.status === "reserved" && (
                  <Button variant="outline" size="sm" disabled={busy}
                    onClick={() => run(() => decide({ data: { id: r.id, version: r.version, action: "cancel" } }), "Kérés visszavonva, a foglalás feloldva.")}>
                    Visszavonás
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      {tab === "Jóváhagyás" && d.parent && (
        <>
          {!pending.length && <p className="task-empty">Nincs döntésre vagy átadásra váró beváltás.</p>}
          {pending.map((r) => (
            <article key={r.id} className="task-row">
              <h3>{r.rewardName} – {name(r.person)}</h3>
              <p>{fmt(r.price)} pont · {redemptionLabels[r.status]} · kérte: {r.requestedBy}</p>
              <div className="task-actions">
                {r.status === "reserved" ? (
                  <>
                    <Button disabled={busy} onClick={() => run(() => decide({ data: { id: r.id, version: r.version, action: "approve" } }), "Jóváhagyva, a pontok levonva.")}>Jóváhagyás</Button>
                    <input aria-label="Elutasítás indoka" placeholder="Elutasítás indoka" value={reasons[r.id] ?? ""} onChange={(e) => setReasons({ ...reasons, [r.id]: e.target.value })} />
                    <Button variant="outline" disabled={busy} onClick={() => run(() => decide({ data: { id: r.id, version: r.version, action: "reject", reason: reasons[r.id] } }), "Elutasítva, a foglalás feloldva.")}>Elutasítás</Button>
                  </>
                ) : (
                  <Button variant="outline" disabled={busy} onClick={() => run(() => decide({ data: { id: r.id, version: r.version, action: "handover" } }), "Átadottnak jelölve.")}>Átadva</Button>
                )}
              </div>
            </article>
          ))}
          <h3>Pontkorrekció (indoklással, naplózva)</h3>
          <form className="task-form" onSubmit={(e) => {
            e.preventDefault();
            void run(() => adjust({ data: { ...adj, requestId: reqId() } }), "Korrekció könyvelve.").then(() => setAdj({ person: "", delta: 0, reason: "" }));
          }}>
            <label>Családtag
              <select value={adj.person} onChange={(e) => setAdj({ ...adj, person: e.target.value })} required>
                <option value="">Válassz…</option>
                {d.people.filter((p) => p.key !== d.me && (p.child || d.admin)).map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
              </select>
            </label>
            <label>Pont (+/−)<input type="number" value={adj.delta} onChange={(e) => setAdj({ ...adj, delta: Number(e.target.value) })} /></label>
            <label>Indoklás<input value={adj.reason} onChange={(e) => setAdj({ ...adj, reason: e.target.value })} /></label>
            <Button type="submit" disabled={busy}>Könyvelés</Button>
          </form>
        </>
      )}
      {tab === "Kezelés" && d.parent && (
        <>
          <Button onClick={() => setEdit({ ...emptyReward })}><Gift size={16} /> Új jutalom</Button>
          {edit && (
            <form className="task-form reward-form" onSubmit={(e) => {
              e.preventDefault();
              void run(() => save({ data: edit }), "Jutalom mentve.").then(() => setEdit(null));
            }}>
              <label>Név<input required value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></label>
              <label>Leírás<textarea value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></label>
              <label>Kategória<input value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })} /></label>
              <label>Pontár<input type="number" min={0} value={edit.price} onChange={(e) => setEdit({ ...edit, price: Number(e.target.value) })} /></label>
              <label>Készlet (üres = korlátlan)<input type="number" min={0} value={edit.stock ?? ""} onChange={(e) => setEdit({ ...edit, stock: e.target.value === "" ? null : Number(e.target.value) })} /></label>
              <label>Kép (https link, opcionális)<input value={edit.image} onChange={(e) => setEdit({ ...edit, image: e.target.value })} /></label>
              <fieldset><legend>Elérhető (üres = mindenki)</legend>
                {d.allPeople.map((p) => (
                  <label key={p.key} className="task-check"><input type="checkbox" checked={edit.eligible?.includes(p.key)}
                    onChange={(e) => setEdit({ ...edit, eligible: e.target.checked ? [...(edit.eligible ?? []), p.key] : (edit.eligible ?? []).filter((k) => k !== p.key) })} />{p.name}</label>
                ))}
              </fieldset>
              <label className="task-check"><input type="checkbox" checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} />Aktív</label>
              <label className="task-check"><input type="checkbox" checked={edit.archived} onChange={(e) => setEdit({ ...edit, archived: e.target.checked })} />Archivált (előzmények megmaradnak)</label>
              <div className="task-actions">
                <Button type="submit" disabled={busy}>Mentés</Button>
                <Button type="button" variant="outline" onClick={() => setEdit(null)}>Mégse</Button>
              </div>
            </form>
          )}
          {d.rewards.map((r) => (
            <article key={r.id} className={`task-row ${r.archived ? "task-done" : ""}`}>
              <h3>{r.name}</h3>
              <p>{r.category} · {fmt(r.price)} pont · {r.stock === null ? "korlátlan" : `${r.stock} db`} · {r.archived ? "archivált" : r.active ? "aktív" : "szünetel"}</p>
              <Button variant="outline" onClick={() => setEdit({ ...r })}>Szerkesztés</Button>
            </article>
          ))}
        </>
      )}
    </div>
  );
}
