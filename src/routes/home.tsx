import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Shell, Card } from "@/components/Shell";
import { getSolar, getBlinds, blindAction } from "@/lib/nas.functions";
const bq = queryOptions({ queryKey: ["blinds"], queryFn: () => getBlinds(), refetchInterval: 15000 });
const q = queryOptions({ queryKey: ["solar"], queryFn: () => getSolar(), refetchInterval: 60000 });
export const Route = createFileRoute("/home")({
  head: () => ({ meta: [
    { title: "Okosotthon – NAS Vezérlő" }, { name: "description", content: "Napelem termelés és okosotthon eszközök egy helyen." },
    { property: "og:title", content: "Okosotthon – NAS Vezérlő" }, { property: "og:description", content: "Napelem termelés és okosotthon eszközök." },
  ] }),
  loader: ({ context }) => Promise.all([context.queryClient.ensureQueryData(q), context.queryClient.ensureQueryData(bq)]),
  component: Home,
});
function Stat({ value, unit, label }: { value: string; unit: string; label: string }) {
  return <div><div className="font-mono text-4xl font-bold text-primary">{value}<span className="ml-1 text-base text-muted-foreground">{unit}</span></div>
    <div className="text-sm text-muted-foreground">{label}</div></div>;
}
function Home() {
  const { data } = useSuspenseQuery(q);
  const f = (n: number, d = 1) => n.toLocaleString("hu-HU", { maximumFractionDigits: d });
  return (
    <Shell demo={data.demo}>
      <h1 className="mb-6 font-display text-3xl font-bold">Okosotthon</h1>
      <Card title="Growatt napelem">
        {data.error ? <p className="font-mono text-sm text-destructive">● {data.error}</p> : <>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            <Stat value={data.currentW >= 1000 ? f(data.currentW / 1000, 2) : f(data.currentW, 0)} unit={data.currentW >= 1000 ? "kW" : "W"} label="Jelenlegi termelés" />
            <Stat value={f(data.todayKwh)} unit="kWh" label="Mai termelés" />
            <Stat value={f(data.totalKwh, 0)} unit="kWh" label="Összes termelés" />
          </div>
          {data.flow && (() => { const fl = data.flow; const kw = (w: number) => `${f(w / 1000, 2)} kW`; return (
            <div className="mt-6 grid grid-cols-2 gap-3 border-t border-border pt-4 sm:grid-cols-4">
              {[["Napelem", kw(fl.pv)], ["Akkumulátor", `${fl.soc}% · ${fl.charge > 0 ? `+${kw(fl.charge)} töltés` : fl.discharge > 0 ? `−${kw(fl.discharge)} merítés` : "áll"}`],
                ["Fogyasztás", kw(fl.load)], ["Hálózat", fl.toGrid > 0 ? `→ ${kw(fl.toGrid)} betáplálás` : fl.fromGrid > 0 ? `← ${kw(fl.fromGrid)} vételezés` : "0 kW"]].map(([l, v]) => (
                <div key={l} className="rounded-lg bg-secondary p-3"><div className="text-xs text-muted-foreground">{l}</div><div className="font-mono text-sm font-medium">{v}</div></div>))}
            </div>); })()}
          <div className="mt-6 space-y-2 border-t border-border pt-4 text-sm">{data.plants.map((p) => (
            <div key={p.name}><div className="flex justify-between gap-2"><span>{p.name}</span>
              <span className="font-mono text-muted-foreground">{f(p.currentW / 1000, 2)} kW · ma {f(p.todayKwh)} kWh</span></div>
              {p.online && <div className="font-mono text-xs text-muted-foreground">{p.online}</div>}</div>))}</div>
          {!data.demo && <details className="mt-4 text-xs text-muted-foreground"><summary className="cursor-pointer">Nyers adatok (hibakereséshez)</summary>
            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded bg-secondary p-2">{data.raw}{"\n\n"}{data.plants.map((p) => p.raw).join("\n\n")}</pre></details>}
        </>}
      </Card>
      <Blinds />
      <p className="mt-6 text-sm text-muted-foreground">További eszközök (Samsung TV, Tuya, Bosch, Tapo, Xiaomi) bekötése folyamatban.</p>
    </Shell>
  );
}

function Blinds() {
  const { data } = useSuspenseQuery(bq); const qc = useQueryClient();
  const [err, setErr] = useState("");
  const act = async (b: (typeof data.blinds)[number], action: "open" | "close" | "stop" | "position", position?: number) => {
    setErr("");
    const pos = action === "open" ? 0 : action === "close" ? 100 : position;
    if (data.demo) { if (pos != null) qc.setQueryData(bq.queryKey, { ...data, blinds: data.blinds.map((x) => x.mac === b.mac ? { ...x, position: pos } : x) }); return; }
    try { await blindAction({ data: { mac: b.mac, deviceType: b.deviceType, action, ...(position != null ? { position } : {}) } }); setTimeout(() => qc.invalidateQueries({ queryKey: bq.queryKey }), 3000); }
    catch (e) { setErr(String((e as Error).message || e)); }
  };
  const btn = "rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary";
  return (
    <Card title="Redőnyök" className="mt-4">
      {data.error ? <p className="font-mono text-sm text-destructive">● {data.error}</p> : (
        <div className="space-y-4">{data.blinds.map((b) => (
          <div key={b.mac} className="flex flex-wrap items-center gap-3">
            <div className="w-32 text-sm font-medium">{b.name}</div>
            <div className="text-xs text-muted-foreground w-24">{b.position < 0 ? "?" : b.position === 0 ? "Nyitva" : b.position === 100 ? "Zárva" : `${100 - b.position}% nyitva`}</div>
            <input type="range" min={0} max={100} defaultValue={100 - Math.max(0, b.position)} key={b.position} aria-label={`${b.name} nyitottság`}
              onPointerUp={(e) => act(b, "position", 100 - Number((e.target as HTMLInputElement).value))} className="flex-1 min-w-32 accent-current text-primary" />
            <div className="flex gap-1">
              <button className={btn} onClick={() => act(b, "open")}>▲</button>
              <button className={btn} onClick={() => act(b, "stop")}>■</button>
              <button className={btn} onClick={() => act(b, "close")}>▼</button>
            </div>
          </div>))}
          {data.blinds.length === 0 && <p className="text-sm text-muted-foreground">Nem található redőny a hubon.</p>}
        </div>)}
      {err && <p className="mt-3 font-mono text-xs text-destructive">● {err}</p>}
    </Card>
  );
}
