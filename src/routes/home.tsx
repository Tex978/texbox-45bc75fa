import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Shell } from "@/components/Shell";
import { SmartSection as Card, SensorDetails } from "@/components/SmartHomeUI";
import { SmartEnergy } from "@/components/SmartEnergy";
import { Button } from "@/components/ui/button";
import { Activity, Check, Fan, House, LockKeyhole, Power, RefreshCw, Settings2, Thermometer } from "lucide-react";
import { getSolar, getThermometers, xiaomiSendCode, xiaomiVerify, getPurifiers, purifierAction, getLocks } from "@/lib/nas.functions";
import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Blinds, blindsQuery as bq } from "@/components/Blinds";
import { Appliances, appliancesQuery } from "@/components/Appliances";
import { Tuya, tuyaQuery } from "@/components/Tuya";
const tq = queryOptions({ queryKey: ["thermo"], queryFn: () => getThermometers(), refetchInterval: 120000 });
const pq = queryOptions({ queryKey: ["purifier"], queryFn: () => getPurifiers(), refetchInterval: 60000 });
const lq = queryOptions({ queryKey: ["locks"], queryFn: () => getLocks(), refetchInterval: 60000 });
const q = queryOptions({ queryKey: ["solar"], queryFn: () => getSolar(), refetchInterval: 60000 });
export const Route = createFileRoute("/home")({
  head: () => ({ meta: [
    { title: "Okosotthon – NAS Vezérlő" }, { name: "description", content: "Napelem termelés és okosotthon eszközök egy helyen." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
    { property: "og:title", content: "Okosotthon – NAS Vezérlő" }, { property: "og:description", content: "Napelem termelés és okosotthon eszközök." },
  ] }),
  loader: ({ context }) => Promise.all([context.queryClient.ensureQueryData(q), context.queryClient.ensureQueryData(bq), context.queryClient.ensureQueryData(tq), context.queryClient.ensureQueryData(pq), context.queryClient.ensureQueryData(lq), context.queryClient.ensureQueryData(appliancesQuery), context.queryClient.ensureQueryData(tuyaQuery)]),
  component: Home,
});
function XiaomiVerify({ url }: { url: string }) {
  const qc = useQueryClient();
  const [st, setSt] = useState<{ ick: string; flag: number; via: string } | null>(null);
  const [code, setCode] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const run = async (f: () => Promise<void>) => { setBusy(true); setErr(""); try { await f(); } catch (e) { setErr(String((e as Error).message || e)); } finally { setBusy(false); } };
  const btn = "rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60";
  return <div className="space-y-3 text-sm">
    <p>A Xiaomi egyszeri ellenőrző kódot kér ehhez az apphoz. Utána megjegyzi, és nem kér többet.</p>
    {!st ? <Button variant="outline" className={btn} disabled={busy} onClick={() => run(async () => setSt(await xiaomiSendCode({ data: { url } })))}>{busy ? "Küldés…" : "Kód kérése"}</Button>
      : <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground">Kódot küldtünk ({st.via}):</span>
        <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" placeholder="123456"
          className="w-32 rounded-md border border-input bg-background px-3 py-2 font-mono outline-none focus:ring-2 focus:ring-ring" />
        <Button variant="outline" className={btn} disabled={busy || !code} onClick={() => run(async () => { await xiaomiVerify({ data: { url, ...st, code } }); await qc.invalidateQueries({ queryKey: ["thermo"] }); })}>{busy ? "Ellenőrzés…" : "Megerősítés"}</Button>
      </div>}
    {err && <p className="break-all font-mono text-destructive">● {err}</p>}
  </div>;
}
const inp = "w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring";
type Names = Record<string, { name?: string; room?: string }>;
function Thermometers() {
  const { data } = useSuspenseQuery(tq);
  const [names, setNames] = useState<Names>({});
  const [edit, setEdit] = useState(false);
  useEffect(() => { try { setNames(JSON.parse(localStorage.getItem("thermo-names") || "{}")); } catch { /* ignore */ } }, []);
  const upd = (did: string, k: "name" | "room", v: string) => setNames((n) => {
    const next = { ...n, [did]: { ...n[did], [k]: v } }; localStorage.setItem("thermo-names", JSON.stringify(next)); return next; });
  return (
    <Card title="Hőmérők (Xiaomi)" className="mt-4">
      {!data.verifyUrl && !data.error && data.sensors.length > 0 && <div className="-mt-2 mb-2 text-right">
        <Button variant="outline" onClick={() => setEdit(!edit)} className="text-sm text-muted-foreground hover:text-foreground" aria-label="Hőmérők átnevezése">{edit ? <Check /> : <Settings2 />}{edit ? "Kész" : "Eszközkezelő"}</Button></div>}
      {data.verifyUrl ? <XiaomiVerify url={data.verifyUrl} /> : data.error ? <p className="break-all font-mono text-sm text-destructive">● {data.error}</p> : <>
        {edit && <div className="mb-4 space-y-2 rounded-lg border border-border p-3">{data.sensors.map((t) => (
          <div key={t.did} className="grid grid-cols-2 gap-2">
            <input value={names[t.did]?.name ?? ""} placeholder={t.name} onChange={(e) => upd(t.did, "name", e.target.value)} className={inp} />
            <input value={names[t.did]?.room ?? ""} placeholder="Hely (pl. Nappali)" onChange={(e) => upd(t.did, "room", e.target.value)} className={inp} />
          </div>))}</div>}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{data.sensors.map((t) => (
          <div key={t.did} className="smart-device sensor-device">
            <div className="flex items-center gap-2"><Thermometer size={17} className="text-home-water" /><div className="truncate text-sm font-medium">{names[t.did]?.name || t.name}</div></div>
            {names[t.did]?.room && <div className="truncate text-xs text-muted-foreground">{names[t.did]?.room}</div>}
            <div className="mt-5 text-3xl font-semibold tabular-nums">{t.temp != null ? `${t.temp.toLocaleString("hu-HU", { maximumFractionDigits: 1 })}°` : "–"}</div>
             <SensorDetails humidity={t.hum} battery={t.battery} online={t.online} />
          </div>))}</div>
        {data.sensors.length === 0 && <p className="text-sm text-muted-foreground">Nem találtunk hőmérőt a Mi fiókban.</p>}
        {data.raw && <details className="mt-3 text-xs text-muted-foreground"><summary className="cursor-pointer">Nyers adatok (hibakereséshez)</summary><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all font-mono">{data.raw}</pre></details>}
      </>}
    </Card>
  );
}
const MODES = ["Auto", "Alvó", "Kedvenc", "Kézi"];
function Purifiers() {
  const { data } = useSuspenseQuery(pq);
  const qc = useQueryClient();
  const [err, setErr] = useState("");
  const act = async (did: string, key: "on" | "mode", value: boolean | number) => {
    setErr(""); try { await purifierAction({ data: { did, key, value } }); await qc.invalidateQueries({ queryKey: ["purifier"] }); } catch (e) { setErr(String((e as Error).message || e)); } };
  if (!data.error && data.purifiers.length === 0) return null;
  const b = (on: boolean) => `rounded-md px-3 py-1.5 text-sm ${on ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`;
  return (
    <Card title="Légtisztító" className="mt-4">
      {data.error ? <p className="break-all font-mono text-sm text-destructive">● {data.error}</p> : data.purifiers.map((p) => (
        <div key={p.did} className="smart-device space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-2 font-medium"><Fan size={19} className="text-home-water" />{p.name}{!p.online && <span className="ml-2 text-xs text-muted-foreground">offline</span>}</span>
            <Button variant="outline" className={b(!!p.on)} onClick={() => act(p.did, "on", !p.on)}><Power size={16} />{p.on ? "Bekapcsolva" : "Kikapcsolva"}</Button>
          </div>
          <div className="grid grid-cols-2 gap-3 border-y border-border py-4 xl:grid-cols-4">
            {[["PM2.5", p.pm25 != null ? `${p.pm25} µg/m³` : "–"], ["Pára", p.hum != null ? `${p.hum}%` : "–"], ["Hőmérséklet", p.temp != null ? `${p.temp}°` : "–"], ["Szűrő", p.filter != null ? `${p.filter}%` : "–"]].map(([l, v]) => (
              <div key={l}><div className="text-xs text-muted-foreground">{l}</div><div className="mt-1 text-sm font-medium tabular-nums">{v}</div></div>))}
          </div>
          <div className="flex flex-wrap gap-2">{MODES.map((m, i) => <Button variant="outline" key={m} className={b(p.mode === i)} disabled={!p.on} onClick={() => act(p.did, "mode", i)}>{m}</Button>)}</div>
        </div>))}
      {err && <p className="mt-2 break-all font-mono text-sm text-destructive">● {err}</p>}
      {data.raw && <details className="mt-3 text-xs text-muted-foreground"><summary className="cursor-pointer">Nyers adatok (hibakereséshez)</summary><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all font-mono">{data.raw}</pre></details>}
    </Card>
  );
}
function Locks() {
  const { data } = useSuspenseQuery(lq);
  if (!data.error && data.locks.length === 0) return null;
  return (
    <Card title="Okoszár" className="mt-4">
      {data.error ? <p className="break-all font-mono text-sm text-destructive">● {data.error}</p> : data.locks.map((l) => (
        <div key={l.did} className="smart-device flex flex-wrap items-center justify-between gap-3">
          <span className="inline-flex items-center gap-3 font-medium"><LockKeyhole size={21} className="text-home-success" />{l.name}</span>
          <SensorDetails battery={l.battery} online={l.online} />
        </div>))}
      <p className="mt-2 text-xs text-muted-foreground">Távoli nyitást a Xiaomi biztonsági okból nem enged, csak az állapot látszik.</p>
      {data.raw && <details className="mt-3 text-xs text-muted-foreground"><summary className="cursor-pointer">Nyers adatok (hibakereséshez)</summary><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all font-mono">{data.raw}</pre></details>}
    </Card>
  );
}
function Home() {
  const { data } = useSuspenseQuery(q);
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => { setRefreshing(true); try { await qc.invalidateQueries({ predicate: (query) => ["solar", "thermo", "purifier", "locks", "blinds", "hc", "tuya"].includes(String(query.queryKey[0])) }); } finally { setRefreshing(false); } };
  const sections = [{ id: "climate", name: "Klíma", icon: Thermometer }, { id: "blinds", name: "Redőnyök", icon: House }, { id: "devices", name: "Eszközök", icon: Power }];
  return (
    <Shell demo={data.demo} className="smart-home">
      <div className="home-title-row">
        <div><div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground"><House size={14} /> OTTHONI VEZÉRLŐPULT</div><h1 className="font-display text-3xl font-semibold">Okosotthon</h1></div>
        <Button variant="outline" onClick={refresh} disabled={refreshing} className="gap-2"><RefreshCw className={refreshing ? "animate-spin" : ""} />Frissítés</Button>
      </div>
      <nav className="home-section-nav" aria-label="Okosotthon szakaszok"><a href="#energy"><Activity size={16} />Energia</a>{sections.map(({ id, name, icon: Icon }) => <a key={id} href={`#${id}`}><Icon size={16} />{name}</a>)}</nav>
      <div id="energy"><SmartEnergy data={data} /></div>
      <div id="climate"><Thermometers /></div>
      <div className="home-comfort-grid"><Purifiers /><Locks /></div>
      <div id="blinds"><Blinds /></div>
      <div id="devices"><Tuya /><Appliances /></div>
    </Shell>
  );
}
