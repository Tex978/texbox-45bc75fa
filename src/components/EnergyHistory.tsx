import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, LoaderCircle } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { getSolarHistory } from "@/lib/nas.functions";
import { historyDate, maskFuture, type HistorySpan, type MixRow, type SeriesKey } from "@/lib/growatt-history";

const SPANS: { id: HistorySpan; name: string }[] = [{ id: "day", name: "Nap" }, { id: "week", name: "Hét" }, { id: "month", name: "Hónap" }, { id: "year", name: "Év" }, { id: "total", name: "Összes" }];
const MONTHS = ["jan.", "febr.", "márc.", "ápr.", "máj.", "jún.", "júl.", "aug.", "szept.", "okt.", "nov.", "dec."];
const SERIES: { k: SeriesKey; name: string; color: string }[] = [
  { k: "pv", name: "Termelés", color: "var(--en-solar)" }, { k: "load", name: "Fogyasztás", color: "var(--en-load)" },
  { k: "fromGrid", name: "Vételezés", color: "var(--en-grid)" }, { k: "toGrid", name: "Visszatáplálás", color: "var(--home-success)" },
  { k: "charge", name: "Akku töltés", color: "var(--en-battery)" }, { k: "discharge", name: "Akku merítés", color: "var(--chart-5)" },
];
const f = (n: number) => n.toLocaleString("hu-HU", { maximumFractionDigits: 1 });

function shift(span: HistorySpan, d: Date, dir: number) {
  const n = new Date(d);
  if (span === "day") n.setDate(n.getDate() + dir); else if (span === "week") n.setDate(n.getDate() + 7 * dir); else if (span === "month") n.setMonth(n.getMonth() + dir, 1); else if (span === "year") n.setFullYear(n.getFullYear() + dir);
  return n;
}
function title(span: HistorySpan, d: Date, date: string) {
  if (span === "day") return d.toLocaleDateString("hu-HU", { year: "numeric", month: "long", day: "numeric", weekday: "short" });
  if (span === "week") { const s = new Date(`${date}T12:00:00`); const e = new Date(s); e.setDate(s.getDate() + 6); const o = { month: "short", day: "numeric" } as const; return `${s.toLocaleDateString("hu-HU", o)} – ${e.toLocaleDateString("hu-HU", o)}`; }
  if (span === "month") return d.toLocaleDateString("hu-HU", { year: "numeric", month: "long" });
  if (span === "year") return String(d.getFullYear());
  return "Teljes működés";
}
function tick(span: HistorySpan, label: string) {
  if (span === "year") return MONTHS[Number(label) - 1] ?? label;
  if (span === "week") return new Date(`${label}T12:00:00`).toLocaleDateString("hu-HU", { weekday: "short", day: "numeric" });
  return label;
}

export function EnergyHistory() {
  const [span, setSpan] = useState<HistorySpan>("day");
  const [day, setDay] = useState(() => new Date());
  const [hidden, setHidden] = useState<SeriesKey[]>(["charge", "discharge"]);
  const date = historyDate(span, day.getFullYear(), day.getMonth() + 1, day.getDate());
  const query = useQuery({ queryKey: ["solar-history", span, date], queryFn: () => getSolarHistory({ data: { span, date } }), staleTime: 15 * 60_000, retry: false, refetchOnWindowFocus: false });
  const r = query.data;
  const plant = r?.plants?.[0];
  const isFuture = shift(span, day, 1) > new Date();
  const unit = span === "day" ? "kW" : "kWh";
  const rows: MixRow[] | null = plant?.source === "inverter" && plant.rows && r!.plants.length === 1 ? maskFuture(span, date, plant.rows, new Date()) : null;
  const active = SERIES.filter((s) => !hidden.includes(s.k));
  const hasRow = (k: SeriesKey) => !!rows?.some((x) => x[k] != null);
  const sum = (k: SeriesKey) => (rows ?? []).reduce((a, x) => a + (x[k] ?? 0), 0);
  const peak = (k: SeriesKey) => Math.max(0, ...(rows ?? []).map((x) => x[k] ?? 0));
  const anyValue = rows?.some((x) => SERIES.some((s) => (x[s.k] ?? 0) !== 0));
  // Plant-level fallback: production only.
  const points = rows ? [] : mergePlants(r?.plants ?? []);
  const values = points.flatMap((p) => p.value == null ? [] : [p.value]);
  const tip = { contentStyle: { background: "var(--card)", borderColor: "var(--border)", color: "var(--foreground)", borderRadius: 12 }, labelFormatter: (l: unknown) => tick(span, String(l)), formatter: (v: unknown, n: unknown) => [`${f(Number(v))} ${unit}`, SERIES.find((s) => s.k === n)?.name ?? "Termelés"] as [string, string] };
  const axes = [<CartesianGrid key="g" stroke="var(--border)" vertical={false} />, <XAxis key="x" dataKey="label" tickFormatter={(l) => tick(span, String(l))} stroke="var(--muted-foreground)" fontSize={11} minTickGap={span === "day" ? 28 : 6} />, <YAxis key="y" stroke="var(--muted-foreground)" fontSize={11} />];

  return <div className="en-card en-history">
    <div className="en-history-head"><h3>Energia-előzmények</h3>
      <div className="home-segment en-span" role="radiogroup" aria-label="Időszak">{SPANS.map((s) => <button type="button" key={s.id} role="radio" aria-checked={span === s.id} className={span === s.id ? "home-segment-active" : ""} onClick={() => { setSpan(s.id); setDay(new Date()); }}>{s.name}</button>)}</div>
    </div>
    {span !== "total" && <div className="en-date">
      <Button variant="ghost" size="icon" aria-label="Előző időszak" onClick={() => setDay(shift(span, day, -1))}><ChevronLeft /></Button>
      <span>{title(span, day, date)}</span>
      <Button variant="ghost" size="icon" aria-label="Következő időszak" disabled={isFuture} onClick={() => setDay(shift(span, day, 1))}><ChevronRight /></Button>
    </div>}
    {query.isPending ? <div className="en-chart en-chart-state" role="status"><LoaderCircle className="animate-spin" aria-label="Előzmények betöltése" /></div>
      : r?.demo ? <p className="en-chart en-chart-state">Mintaüzemmódban nincs valódi előzmény. A Growatt-fiók beállítása után jelenik meg.</p>
      : query.isError || r?.error ? <p className="en-chart en-chart-state en-chart-err" role="alert">{r?.error || "Nem sikerült lekérni az előzményeket."}</p>
      : rows ? (!anyValue ? <p className="en-chart en-chart-state">Ehhez az időszakhoz a Growatt nem adott vissza mérést.</p> : <>
        <div className="en-hist-tiles">{SERIES.filter((s) => hasRow(s.k)).map((s) => <button type="button" key={s.k} aria-pressed={!hidden.includes(s.k)} className="en-hist-tile" style={{ ["--c" as string]: s.color }} onClick={() => setHidden((h) => h.includes(s.k) ? h.filter((x) => x !== s.k) : [...h, s.k])}>
          <span><i />{s.name}</span><strong>{f(span === "day" ? peak(s.k) : sum(s.k))} <small>{unit}</small></strong>{span === "day" && <em>csúcs</em>}
        </button>)}</div>
        <div className="en-chart" aria-label={`Energia grafikon, ${title(span, day, date)}`}>
          <ResponsiveContainer width="100%" height="100%">
            {span === "day" ? <AreaChart data={rows} margin={{ top: 8, right: 6, bottom: 0, left: -18 }}>
              <defs>{active.map((s) => <linearGradient key={s.k} id={`enFill-${s.k}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={s.color} stopOpacity={0.35} /><stop offset="100%" stopColor={s.color} stopOpacity={0} /></linearGradient>)}</defs>
              {axes}<Tooltip {...tip} />
              {active.map((s) => <Area key={s.k} dataKey={s.k} stroke={s.color} strokeWidth={2} fill={`url(#enFill-${s.k})`} connectNulls={false} isAnimationActive={false} />)}
            </AreaChart> : <BarChart data={rows} margin={{ top: 8, right: 6, bottom: 0, left: -18 }}>
              {axes}<Tooltip cursor={{ fill: "var(--secondary)" }} {...tip} />
              {active.map((s) => <Bar key={s.k} dataKey={s.k} fill={s.color} radius={[4, 4, 0, 0]} isAnimationActive={false} />)}
            </BarChart>}
          </ResponsiveContainer>
        </div>
        <p className="en-note">Koppints egy értékre a grafikonon való ki- vagy bekapcsolásához. {span === "day" ? "Napi nézetben 5 perces teljesítményértékek (kW) látszanak." : "Az összegek a Growatt által adott időszaki értékekből számolódnak."} A még el nem telt időszakok üresen maradnak.</p>
      </>)
      : values.length === 0 || values.every((v) => v === 0) ? <p className="en-chart en-chart-state">Ehhez az időszakhoz a Growatt nem adott vissza mérést.</p>
      : <>
        <div className="en-history-sum"><span>Termelés összesen</span><strong>{f(values.reduce((a, b) => a + b, 0))} kWh</strong></div>
        <div className="en-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={points} margin={{ top: 8, right: 6, bottom: 0, left: -18 }}>{axes}<Tooltip {...tip} /><Bar dataKey="value" fill="var(--en-solar)" radius={[6, 6, 0, 0]} isAnimationActive={false} /></BarChart></ResponsiveContainer></div>
      </>}
    <p className="en-note">Forrás: {rows ? "Growatt inverter (ugyanaz, mint a ShinePhone appban)" : "Growatt erőmű-előzmények, csak termelés"}.</p>
  </div>;
}
function mergePlants(plants: { points: { label: string; value: number | null }[] }[]) {
  const map = new Map<string, number | null>();
  for (const p of plants) for (const pt of p.points) { const cur = map.get(pt.label); map.set(pt.label, pt.value == null ? (cur ?? null) : (cur ?? 0) + pt.value); }
  return [...map.entries()].map(([label, value]) => ({ label, value }));
}
