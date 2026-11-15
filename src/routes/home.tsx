import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Shell } from "@/components/Shell";
import { SmartSection as Card, SensorDetails } from "@/components/SmartHomeUI";
import { SmartEnergy } from "@/components/SmartEnergy";
import { Button } from "@/components/ui/button";
import { Blinds as BlindsIcon, Check, ChevronRight, Fan, House, LayoutGrid, LockKeyhole, Power, RefreshCw, Settings2, Sun, Thermometer } from "lucide-react";
import { getSolar, getThermometers, saveThermometerMeta, xiaomiSendCode, xiaomiVerify, getPurifiers, purifierAction, getLocks } from "@/lib/nas.functions";
import { visibleThermometers, type ThermometerMeta } from "@/lib/thermometer-meta";
import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Blinds, blindsQuery as bq } from "@/components/Blinds";
import { Appliances, appliancesQuery } from "@/components/Appliances";
import { Tuya, tuyaQuery } from "@/components/Tuya";
import { Gree, greeQuery } from "@/components/Gree";
import { SOLAR_REFRESH_MS } from "@/lib/growatt-cache";
import { ThermometerHistory } from "@/components/ThermometerHistory";
import childFullBody from "@/assets/child-full-body.png";
const tq = queryOptions({ queryKey: ["thermo"], queryFn: () => getThermometers(), refetchInterval: 120000 });
const pq = queryOptions({ queryKey: ["purifier"], queryFn: () => getPurifiers(), refetchInterval: 60000 });
const lq = queryOptions({ queryKey: ["locks"], queryFn: () => getLocks(), refetchInterval: 60000 });
const q = queryOptions({ queryKey: ["solar"], queryFn: () => getSolar(), staleTime: SOLAR_REFRESH_MS, refetchInterval: SOLAR_REFRESH_MS, refetchOnWindowFocus: false, retry: false });
export const Route = createFileRoute("/home")({
  head: () => ({ meta: [
    { title: "Okosotthon – NAS Vezérlő" }, { name: "description", content: "Napelem termelés és okosotthon eszközök egy helyen." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
    { property: "og:title", content: "Okosotthon – NAS Vezérlő" }, { property: "og:description", content: "Napelem termelés és okosotthon eszközök." },
  ] }),
  loader: ({ context }) => Promise.all([context.queryClient.ensureQueryData(q), context.queryClient.ensureQueryData(bq), context.queryClient.ensureQueryData(tq), context.queryClient.ensureQueryData(pq), context.queryClient.ensureQueryData(lq), context.queryClient.ensureQueryData(appliancesQuery), context.queryClient.ensureQueryData(tuyaQuery), context.queryClient.ensureQueryData(greeQuery)]),
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
function Thermometers() {
  const { data } = useSuspenseQuery(tq);
  const qc = useQueryClient();
  const [names, setNames] = useState<ThermometerMeta>(data.meta);
  const [edit, setEdit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { if (!edit) setNames(data.meta); }, [data.meta, edit]);
  useEffect(() => {
    let active = true;
    const migrate = async () => {
      try {
        const raw = localStorage.getItem("thermo-names"); if (!raw) return;
        const meta = await saveThermometerMeta({ data: { items: JSON.parse(raw), onlyMissing: true } });
        localStorage.removeItem("thermo-names");
        if (active) qc.setQueryData(tq.queryKey, (current: typeof data | undefined) => current ? { ...current, meta } : current);
      } catch { if (active) setError("A korábbi hőmérőnevek átvétele nem sikerült; a böngészőben megmaradtak."); }
    };
    void migrate(); return () => { active = false; };
  }, [qc]);
  const upd = (did: string, values: ThermometerMeta[string]) => setNames(n => ({ ...n, [did]: { ...n[did], ...values } }));
  const finish = async () => {
    setBusy(true); setError("");
    try {
      const meta = await saveThermometerMeta({ data: { items: names } });
      qc.setQueryData(tq.queryKey, (current: typeof data | undefined) => current ? { ...current, meta } : current);
      setEdit(false);
    } catch (e) { setError(e instanceof Error ? e.message : "Nem sikerült menteni a hőmérőket."); }
    finally { setBusy(false); }
  };
  const shown = visibleThermometers(data.sensors, data.meta);
  return (
    <Card title="Hőmérők (Xiaomi)" className="mt-4">
      {!data.verifyUrl && !data.error && data.sensors.length > 0 && <div className="-mt-2 mb-2 text-right">
        <Button variant="outline" disabled={busy} onClick={() => edit ? void finish() : setEdit(true)} className="text-sm text-muted-foreground hover:text-foreground" aria-label={edit ? "Hőmérők mentése" : "Hőmérők eszközkezelője"}>{edit ? <Check /> : <Settings2 />}{busy ? "Mentés…" : edit ? "Kész" : "Eszközkezelő"}</Button></div>}
      {data.verifyUrl ? <XiaomiVerify url={data.verifyUrl} /> : data.error ? <p className="break-all font-mono text-sm text-destructive">● {data.error}</p> : <>
        {edit && <div className="mb-4 space-y-2 rounded-lg border border-border p-3">{data.sensors.map((t) => (
          <div key={t.did} className="grid grid-cols-2 gap-2 border-b border-border py-2 last:border-0">
            <span className="col-span-2 text-sm font-medium">{t.name}</span>
            <input aria-label={`${t.name} neve`} disabled={busy} value={names[t.did]?.name ?? ""} placeholder={t.name} onChange={(e) => upd(t.did, { name: e.target.value })} className={inp} />
            <input aria-label={`${t.name} helye`} disabled={busy} value={names[t.did]?.room ?? ""} placeholder="Hely (pl. Nappali)" onChange={(e) => upd(t.did, { room: e.target.value })} className={inp} />
            <label className="col-span-2 flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" disabled={busy} checked={names[t.did]?.hidden === true} onChange={(e) => upd(t.did, { hidden: e.target.checked })} aria-label={`${t.name} elrejtése`} />Elrejtés</label>
          </div>))}</div>}
        {!edit && <div className="home-sensor-grid">{shown.map((t) => (
          <div key={t.did} className="smart-device sensor-device">
            <div className="flex min-w-0 items-center gap-2"><Thermometer size={17} className="shrink-0 text-home-water" /><div className="min-w-0 truncate text-sm font-medium">{names[t.did]?.name || t.name}</div></div>
            {names[t.did]?.room && <div className="truncate text-xs text-muted-foreground">{names[t.did]?.room}</div>}
            <div className="mt-5 text-3xl font-semibold tabular-nums">{t.temp != null ? `${t.temp.toLocaleString("hu-HU", { maximumFractionDigits: 1 })}°` : "–"}</div>
             <SensorDetails humidity={t.hum} battery={t.battery} online={t.online} />
             <ThermometerHistory did={t.did} name={names[t.did]?.name || t.name} />
          </div>))}</div>}
        {!edit && data.sensors.length > 0 && shown.length === 0 && <p className="text-sm text-muted-foreground">Minden hőmérő elrejtve.</p>}
        {data.sensors.length === 0 && <p className="text-sm text-muted-foreground">Nem találtunk hőmérőt a Mi fiókban.</p>}
        {data.raw && <details className="mt-3 text-xs text-muted-foreground"><summary className="cursor-pointer">Nyers adatok (hibakereséshez)</summary><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all font-mono">{data.raw}</pre></details>}
      </>}
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
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
  const refresh = async () => { setRefreshing(true); try { await qc.invalidateQueries({ predicate: (query) => ["solar", "thermo", "purifier", "locks", "blinds", "hc", "tuya", "gree"].includes(String(query.queryKey[0])) }); } finally { setRefreshing(false); } };
  const { data: thermometers } = useSuspenseQuery(tq);
  const { data: blinds } = useSuspenseQuery(bq);
  const { data: gree } = useSuspenseQuery(greeQuery);
  const { data: appliances } = useSuspenseQuery(appliancesQuery);
  const { data: tuya } = useSuspenseQuery(tuyaQuery);
  const [view, setView] = useState("overview");
  const sections = [
    { id: "overview", name: "Áttekintés", icon: LayoutGrid },
    { id: "climate", name: "Klíma", icon: Thermometer },
    { id: "blinds", name: "Redőnyök", icon: BlindsIcon },
    { id: "devices", name: "Eszközök", icon: Power },
    { id: "energy", name: "Energia", icon: Sun },
  ];
  const shownThermometers = visibleThermometers(thermometers.sensors, thermometers.meta);
  const temperatures = shownThermometers.flatMap((sensor) => sensor.temp == null ? [] : [sensor.temp]);
  const climateValue = temperatures.length ? `${Math.min(...temperatures).toLocaleString("hu-HU")}–${Math.max(...temperatures).toLocaleString("hu-HU")}°` : "–";
  const summaries = [
    { id: "climate", title: "Hőmérséklet", value: climateValue, detail: `${shownThermometers.length} hőmérő · ${gree.units.length} klíma${thermometers.demo ? " · Minta" : ""}`, icon: Thermometer, tone: "climate" },
    { id: "energy", title: "Napelem", value: data.error ? "–" : `${(data.currentW / 1000).toLocaleString("hu-HU", { maximumFractionDigits: 2 })} kW`, detail: data.error ? "Kapcsolati hiba" : `Ma ${data.todayKwh.toLocaleString("hu-HU", { maximumFractionDigits: 1 })} kWh${data.demo ? " · Minta" : ""}`, icon: Sun, tone: "energy" },
    { id: "blinds", title: "Árnyékolás", value: `${blinds.blinds.length}`, detail: `redőny${blinds.demo ? " · Minta" : ""}`, icon: BlindsIcon, tone: "blinds" },
    { id: "devices", title: "Eszközök", value: `${appliances.appliances.length + tuya.devices.filter((d) => !tuya.meta[d.id]?.hidden).length}`, detail: appliances.error || tuya.error ? "Kapcsolati hiba" : "Bosch · Smart Life", icon: Power, tone: "devices" },
  ];
  return (
    <Shell demo={data.demo} className="smart-home">
      <div className="home-title-row home-title-with-child">
        <div className="min-w-0"><div className="mb-1 flex items-center gap-2 text-xs font-medium text-muted-foreground"><House size={14} /> Az én otthonom</div><h1 className="font-display text-3xl font-semibold">Okosotthon</h1></div>
        <img src={childFullBody} alt="A gyermek teljes alakos, körbevágott fotója" className="family-cutout" width={300} height={1024} />
        <Button variant="outline" size="icon" onClick={refresh} disabled={refreshing} className="shrink-0" title="Frissítés" aria-label="Okosotthon frissítése"><RefreshCw className={refreshing ? "animate-spin" : ""} /></Button>
      </div>
      <div className="home-status-grid">{summaries.map(({ id, title, value, detail, icon: Icon, tone }) => <Button key={id} variant="ghost" className={`home-status-tile home-tone-${tone}`} onClick={() => setView(id)}>
        <span className="home-status-top"><Icon size={20} strokeWidth={1.7} /><ChevronRight size={14} /></span>
        <span className="home-status-label">{title}</span><strong>{value}</strong><span className="home-status-detail">{detail}</span>
      </Button>)}</div>
      <div className="home-view-tabs" role="tablist" aria-label="Okosotthon nézetek">{sections.map(({ id, name, icon: Icon }) => <Button key={id} id={`tab-${id}`} role="tab" aria-selected={view === id} aria-controls="home-panel" variant="ghost" className={view === id ? "home-tab-active" : ""} onClick={() => setView(id)}><Icon size={17} />{name}</Button>)}</div>
      <div id="home-panel" role="tabpanel" aria-labelledby={`tab-${view}`} className="home-view-panel">
        {view === "overview" && <><div className="home-dashboard-grid"><Thermometers /><Blinds /></div><div className="home-comfort-grid"><Purifiers /><Locks /></div></>}
        {view === "climate" && <><Thermometers /><Gree /><Purifiers /></>}
        {view === "blinds" && <Blinds />}
        {view === "energy" && <SmartEnergy data={data} />}
        {view === "devices" && <><div className="home-dashboard-grid"><Tuya /><Appliances /></div><Locks /></>}
      </div>
    </Shell>
  );
}
