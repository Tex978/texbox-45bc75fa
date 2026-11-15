import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Shell, Card } from "@/components/Shell";
import { getSolar, getThermometers, xiaomiSendCode, xiaomiVerify } from "@/lib/nas.functions";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Blinds, blindsQuery as bq } from "@/components/Blinds";
const tq = queryOptions({ queryKey: ["thermo"], queryFn: () => getThermometers(), refetchInterval: 120000 });
const q = queryOptions({ queryKey: ["solar"], queryFn: () => getSolar(), refetchInterval: 60000 });
export const Route = createFileRoute("/home")({
  head: () => ({ meta: [
    { title: "Okosotthon – NAS Vezérlő" }, { name: "description", content: "Napelem termelés és okosotthon eszközök egy helyen." },
    { property: "og:title", content: "Okosotthon – NAS Vezérlő" }, { property: "og:description", content: "Napelem termelés és okosotthon eszközök." },
  ] }),
  loader: ({ context }) => Promise.all([context.queryClient.ensureQueryData(q), context.queryClient.ensureQueryData(bq), context.queryClient.ensureQueryData(tq)]),
  component: Home,
});
function Stat({ value, unit, label }: { value: string; unit: string; label: string }) {
  return <div><div className="font-mono text-4xl font-bold text-primary">{value}<span className="ml-1 text-base text-muted-foreground">{unit}</span></div>
    <div className="text-sm text-muted-foreground">{label}</div></div>;
}
function XiaomiVerify({ url }: { url: string }) {
  const qc = useQueryClient();
  const [st, setSt] = useState<{ ick: string; flag: number; via: string } | null>(null);
  const [code, setCode] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const run = async (f: () => Promise<void>) => { setBusy(true); setErr(""); try { await f(); } catch (e) { setErr(String((e as Error).message || e)); } finally { setBusy(false); } };
  const btn = "rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60";
  return <div className="space-y-3 text-sm">
    <p>A Xiaomi egyszeri ellenőrző kódot kér ehhez az apphoz. Utána megjegyzi, és nem kér többet.</p>
    {!st ? <button className={btn} disabled={busy} onClick={() => run(async () => setSt(await xiaomiSendCode({ data: { url } })))}>{busy ? "Küldés…" : "Kód kérése"}</button>
      : <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground">Kódot küldtünk ({st.via}):</span>
        <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" placeholder="123456"
          className="w-32 rounded-md border border-input bg-background px-3 py-2 font-mono outline-none focus:ring-2 focus:ring-ring" />
        <button className={btn} disabled={busy || !code} onClick={() => run(async () => { await xiaomiVerify({ data: { url, ...st, code } }); await qc.invalidateQueries({ queryKey: ["thermo"] }); })}>{busy ? "Ellenőrzés…" : "Megerősítés"}</button>
      </div>}
    {err && <p className="break-all font-mono text-destructive">● {err}</p>}
  </div>;
}
function Thermometers() {
  const { data } = useSuspenseQuery(tq);
  return (
    <Card title="Hőmérők (Xiaomi)" className="mt-4">
      {data.verifyUrl ? <XiaomiVerify url={data.verifyUrl} /> : data.error ? <p className="break-all font-mono text-sm text-destructive">● {data.error}</p> : <>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{data.sensors.map((t) => (
          <div key={t.did} className="rounded-lg border border-border bg-secondary/40 p-3">
            <div className="truncate text-sm font-medium">{t.name}</div>
            <div className="mt-1 font-mono text-2xl font-bold text-primary">{t.temp != null ? `${t.temp.toLocaleString("hu-HU", { maximumFractionDigits: 1 })}°` : "–"}</div>
            <div className="font-mono text-xs text-muted-foreground">{t.hum != null ? `${t.hum}% pára` : ""}{t.battery != null ? ` · 🔋${t.battery}%` : ""}{!t.online ? " · offline" : ""}</div>
          </div>))}</div>
        {data.sensors.length === 0 && <p className="text-sm text-muted-foreground">Nem találtunk hőmérőt a Mi fiókban.</p>}
        {data.raw && <details className="mt-3 text-xs text-muted-foreground"><summary className="cursor-pointer">Nyers adatok (hibakereséshez)</summary><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all font-mono">{data.raw}</pre></details>}
      </>}
    </Card>
  );
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
      <Thermometers />
      <Blinds />
      <p className="mt-6 text-sm text-muted-foreground">További eszközök (Samsung TV, Tuya, Bosch, Tapo, Xiaomi) bekötése folyamatban.</p>
    </Shell>
  );
}


