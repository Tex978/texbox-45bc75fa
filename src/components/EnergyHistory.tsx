import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, LoaderCircle } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { getSolarHistory } from "@/lib/nas.functions";
import { historyDate, type HistorySpan } from "@/lib/growatt-history";

const SPANS: { id: HistorySpan; name: string }[] = [{ id: "day", name: "Nap" }, { id: "month", name: "Hónap" }, { id: "year", name: "Év" }, { id: "total", name: "Összes" }];
const UNIT: Record<HistorySpan, string> = { day: "W", month: "kWh", year: "kWh", total: "kWh" };
const MONTHS = ["jan.", "febr.", "márc.", "ápr.", "máj.", "jún.", "júl.", "aug.", "szept.", "okt.", "nov.", "dec."];
const f = (n: number) => n.toLocaleString("hu-HU", { maximumFractionDigits: 1 });

function shift(span: HistorySpan, d: Date, dir: number) {
  const n = new Date(d);
  if (span === "day") n.setDate(n.getDate() + dir); else if (span === "month") n.setMonth(n.getMonth() + dir, 1); else if (span === "year") n.setFullYear(n.getFullYear() + dir);
  return n;
}
function title(span: HistorySpan, d: Date) {
  if (span === "day") return d.toLocaleDateString("hu-HU", { year: "numeric", month: "long", day: "numeric", weekday: "short" });
  if (span === "month") return d.toLocaleDateString("hu-HU", { year: "numeric", month: "long" });
  if (span === "year") return String(d.getFullYear());
  return "Teljes működés";
}
function tick(span: HistorySpan, label: string) { return span === "year" ? MONTHS[Number(label) - 1] ?? label : label; }

export function EnergyHistory() {
  const [span, setSpan] = useState<HistorySpan>("day");
  const [day, setDay] = useState(() => new Date());
  const date = historyDate(span, day.getFullYear(), day.getMonth() + 1, day.getDate());
  const query = useQuery({ queryKey: ["solar-history", span, date], queryFn: () => getSolarHistory({ data: { span, date } }), staleTime: 15 * 60_000, retry: false, refetchOnWindowFocus: false });
  const r = query.data;
  const points = (r?.plants ?? []).length === 1 ? r!.plants[0]!.points : mergePlants(r?.plants ?? []);
  const values = points.flatMap((p) => p.value == null ? [] : [p.value]);
  const missing = points.length - values.length;
  const isFuture = shift(span, day, 1) > new Date();
  const unit = UNIT[span];
  const sum = values.reduce((a, b) => a + b, 0);
  const chartData = points.map((p) => ({ label: p.label, value: p.value }));
  return <div className="en-card en-history">
    <div className="en-history-head"><h3>Termelési előzmények</h3>
      <div className="home-segment en-span" role="radiogroup" aria-label="Időszak">{SPANS.map((s) => <button type="button" key={s.id} role="radio" aria-checked={span === s.id} className={span === s.id ? "home-segment-active" : ""} onClick={() => { setSpan(s.id); setDay(new Date()); }}>{s.name}</button>)}</div>
    </div>
    {span !== "total" && <div className="en-date">
      <Button variant="ghost" size="icon" aria-label="Előző időszak" onClick={() => setDay(shift(span, day, -1))}><ChevronLeft /></Button>
      <span>{title(span, day)}</span>
      <Button variant="ghost" size="icon" aria-label="Következő időszak" disabled={isFuture} onClick={() => setDay(shift(span, day, 1))}><ChevronRight /></Button>
    </div>}
    {query.isPending ? <div className="en-chart en-chart-state" role="status"><LoaderCircle className="animate-spin" aria-label="Előzmények betöltése" /></div>
      : r?.demo ? <p className="en-chart en-chart-state">Mintaüzemmódban nincs valódi előzmény. A Growatt-fiók beállítása után jelenik meg.</p>
      : query.isError || r?.error ? <p className="en-chart en-chart-state en-chart-err" role="alert">{r?.error || "Nem sikerült lekérni az előzményeket."}</p>
      : values.length === 0 || values.every((v) => v === 0) ? <p className="en-chart en-chart-state">{values.length ? "A Growatt ehhez az időszakhoz csak nulla értékeket adott vissza, ezért nem rajzolunk grafikont. Ennél az inverternél az erőmű-szintű napi, havi és éves bontás valószínűleg nem érhető el." : "Ehhez az időszakhoz a Growatt nem adott vissza mérést."}</p>
      : <>
        <div className="en-history-sum">{span === "day" ? <><span>Csúcs</span><strong>{f(Math.max(...values))} {unit}</strong></> : <><span>Összesen</span><strong>{f(sum)} {unit}</strong></>}</div>
        <div className="en-chart" aria-label={`Termelés grafikon, ${title(span, day)}`}>
          <ResponsiveContainer width="100%" height="100%">
            {span === "day" ? <AreaChart data={chartData} margin={{ top: 8, right: 6, bottom: 0, left: -18 }}>
              <defs><linearGradient id="enFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--home-energy)" stopOpacity={0.5} /><stop offset="100%" stopColor="var(--home-energy)" stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid stroke="var(--border)" vertical={false} /><XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={11} minTickGap={28} /><YAxis stroke="var(--muted-foreground)" fontSize={11} />
              <Tooltip contentStyle={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--foreground)", borderRadius: 12 }} formatter={(v) => [`${f(Number(v))} ${unit}`, "Termelés"]} />
              <Area dataKey="value" stroke="var(--home-energy)" strokeWidth={2} fill="url(#enFill)" connectNulls={false} isAnimationActive={false} />
            </AreaChart> : <BarChart data={chartData} margin={{ top: 8, right: 6, bottom: 0, left: -18 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} /><XAxis dataKey="label" tickFormatter={(l) => tick(span, String(l))} stroke="var(--muted-foreground)" fontSize={11} minTickGap={8} /><YAxis stroke="var(--muted-foreground)" fontSize={11} />
              <Tooltip cursor={{ fill: "var(--secondary)" }} contentStyle={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--foreground)", borderRadius: 12 }} labelFormatter={(l) => tick(span, String(l))} formatter={(v) => [`${f(Number(v))} ${unit}`, "Termelés"]} />
              <Bar dataKey="value" fill="var(--home-energy)" radius={[6, 6, 0, 0]} isAnimationActive={false} />
            </BarChart>}
          </ResponsiveContainer>
        </div>
        {missing > 0 && <p className="en-note">{missing} időpontra nincs adat; ezek hiányként (üresen) látszanak, nem nullaként.</p>}
      </>}
    <p className="en-note">Forrás: Growatt erőmű-előzmények. A Growatt itt csak termelést ad; fogyasztás, vételezés és visszatáplálás előzménye ebből nem érhető el. Heti bontást a szolgáltató nem kínál.</p>
  </div>;
}
function mergePlants(plants: { points: { label: string; value: number | null }[] }[]) {
  const map = new Map<string, number | null>();
  for (const p of plants) for (const pt of p.points) { const cur = map.get(pt.label); map.set(pt.label, pt.value == null ? (cur ?? null) : (cur ?? 0) + pt.value); }
  return [...map.entries()].map(([label, value]) => ({ label, value }));
}
