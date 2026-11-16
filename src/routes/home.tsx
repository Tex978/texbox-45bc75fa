import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Shell } from "@/components/Shell";
import { SmartSection as Card, SensorDetails } from "@/components/SmartHomeUI";
import { SmartEnergy } from "@/components/SmartEnergy";
import { Button } from "@/components/ui/button";
import { Blinds as BlindsIcon, Cable, Check, ChevronRight, DoorOpen, Droplets, Fan, House, LayoutGrid, LockKeyhole, Moon, Power, RefreshCw, Settings2, Snowflake, Star, Sun, SunMoon, Thermometer, WashingMachine, Lightbulb, Wifi, WifiOff } from "lucide-react";
import { Link } from "@tanstack/react-router";
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
    <Card title="Hőmérők (Xiaomi)" className="mt-4" action={!data.verifyUrl && !data.error && data.sensors.length > 0 ?
        <Button variant="outline" size="icon" disabled={busy} onClick={() => edit ? void finish() : setEdit(true)} className="text-muted-foreground hover:text-foreground" title={edit ? "Mentés" : "Eszközkezelő"} aria-label={edit ? "Hőmérők mentése" : "Hőmérők eszközkezelője"}>{edit ? <Check /> : <Settings2 />}</Button> : undefined}>
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
            <div className="sensor-heading flex min-w-0 items-center gap-2"><Thermometer size={17} className="shrink-0 text-home-water" /><div className="min-w-0"><div className="truncate text-sm font-medium">{names[t.did]?.name || t.name}</div>{names[t.did]?.room && <div className="truncate text-xs text-muted-foreground">{names[t.did]?.room}</div>}</div></div>
            <div className="sensor-reading mt-5 text-3xl font-semibold tabular-nums">{t.temp != null ? `${t.temp.toLocaleString("hu-HU", { maximumFractionDigits: 1 })}°` : "–"}</div>
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
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <span className="inline-flex min-w-0 items-center gap-2 font-medium"><Fan size={19} className="shrink-0 text-home-water" /><span className="truncate">{p.name}</span>{!p.online && <span className="text-xs text-muted-foreground">offline</span>}</span>
            <Button variant="outline" size="icon" aria-label={`${p.name} ${p.on ? "kikapcsolás" : "bekapcsolás"}`} title={p.on ? "Kikapcsolás" : "Bekapcsolás"} className={b(!!p.on)} onClick={() => act(p.did, "on", !p.on)}><Power size={16} /></Button>
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
const CATEGORIES = [
  { id: "sensors", name: "Hőmérők", icon: Thermometer },
  { id: "gree", name: "Klímák", icon: Snowflake },
  { id: "air", name: "Légtisztító", icon: Fan },
  { id: "blinds", name: "Redőnyök", icon: BlindsIcon },
  { id: "tuya", name: "Smart Life", icon: Lightbulb },
  { id: "bosch", name: "Bosch", icon: WashingMachine },
  { id: "locks", name: "Zárak", icon: LockKeyhole },
] as const;
type CategoryId = typeof CATEGORIES[number]["id"];
function CategoryPanel({ id }: { id: CategoryId }) {
  if (id === "sensors") return <Thermometers />;
  if (id === "gree") return <Gree />;
  if (id === "air") return <Purifiers />;
  if (id === "blinds") return <Blinds />;
  if (id === "tuya") return <Tuya />;
  if (id === "bosch") return <Appliances />;
  return <Locks />;
}
type Theme = "system" | "light" | "dark";
function usePref<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => { try { const raw = localStorage.getItem(key); if (raw) setValue(JSON.parse(raw)); } catch { /* ignore */ } }, [key]);
  const update = (next: T) => { setValue(next); try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* ignore */ } };
  return [value, update] as const;
}
function useSystemLight() {
  const [light, setLight] = useState(false);
  useEffect(() => { const m = window.matchMedia("(prefers-color-scheme: light)"); setLight(m.matches); const f = () => setLight(m.matches); m.addEventListener("change", f); return () => m.removeEventListener("change", f); }, []);
  return light;
}
function greeting() { const h = new Date().getHours(); return h < 10 ? "Jó reggelt" : h < 18 ? "Szép napot" : "Jó estét"; }
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
  const [category, setCategory] = useState<CategoryId>("sensors");
  const [favorites, setFavorites] = usePref<CategoryId[]>("home-favorites", ["sensors", "blinds"]);
  const [theme, setTheme] = usePref<Theme>("home-theme", "system");
  const [hello, setHello] = useState("Otthon");
  useEffect(() => setHello(greeting()), []);
  const systemLight = useSystemLight();
  const light = theme === "light" || (theme === "system" && systemLight);
  const selectView = (id: string) => { setView(id); window.scrollTo({ top: 0, behavior: "instant" }); };
  const openCategory = (id: CategoryId) => { setCategory(id); selectView("devices"); };
  const toggleFavorite = (id: CategoryId) => setFavorites(favorites.includes(id) ? favorites.filter((f) => f !== id) : [...favorites, id]);
  const sections = [
    { id: "overview", name: "Otthon", icon: House },
    { id: "rooms", name: "Szobák", icon: DoorOpen },
    { id: "devices", name: "Eszközök", icon: LayoutGrid },
    { id: "energy", name: "Energia", icon: Sun },
    { id: "more", name: "Több", icon: Settings2 },
  ];
  const shownThermometers = visibleThermometers(thermometers.sensors, thermometers.meta);
  const tuyaShown = tuya.devices.filter((d) => !tuya.meta[d.id]?.hidden);
  const statuses = [...shownThermometers.map((s) => s.online), ...gree.units.map((u) => u.online), ...tuyaShown.map((d) => d.online)];
  const online = statuses.filter(Boolean).length; const offline = statuses.length - online;
  const temperatures = shownThermometers.flatMap((sensor) => sensor.temp == null ? [] : [sensor.temp]);
  const climateValue = temperatures.length ? `${Math.min(...temperatures).toLocaleString("hu-HU")}–${Math.max(...temperatures).toLocaleString("hu-HU")}°` : "–";
  const anyDemo = data.demo || thermometers.demo || blinds.demo;
  const summaries = [
    { id: "sensors" as const, title: "Hőmérséklet", value: climateValue, detail: `${shownThermometers.length} hőmérő · ${gree.units.length} klíma${thermometers.demo ? " · Minta" : ""}`, icon: Thermometer, tone: "climate" },
    { id: "energy" as const, title: "Napelem", value: data.error ? "–" : `${(data.currentW / 1000).toLocaleString("hu-HU", { maximumFractionDigits: 2 })} kW`, detail: data.error ? "Kapcsolati hiba" : `Ma ${data.todayKwh.toLocaleString("hu-HU", { maximumFractionDigits: 1 })} kWh${data.demo ? " · Minta" : ""}`, icon: Sun, tone: "energy" },
    { id: "blinds" as const, title: "Árnyékolás", value: `${blinds.blinds.length}`, detail: `redőny${blinds.demo ? " · Minta" : ""}`, icon: BlindsIcon, tone: "blinds" },
    { id: "tuya" as const, title: "Eszközök", value: `${appliances.appliances.length + tuyaShown.length}`, detail: appliances.error || tuya.error ? "Kapcsolati hiba" : "Bosch · Smart Life", icon: Power, tone: "devices" },
  ];
  const rooms = Object.entries(shownThermometers.reduce<Record<string, typeof shownThermometers>>((acc, s) => { const room = thermometers.meta[s.did]?.room?.trim() || "Szoba nélkül"; (acc[room] ||= []).push(s); return acc; }, {}));
  const fmt = (n: number) => n.toLocaleString("hu-HU", { maximumFractionDigits: 1 });
  const ThemeIcon = theme === "system" ? SunMoon : theme === "light" ? Sun : Moon;
  const nextTheme: Record<Theme, Theme> = { system: "light", light: "dark", dark: "system" };
  const themeName: Record<Theme, string> = { system: "Rendszer szerint", light: "Világos", dark: "Sötét" };
  return (
    <Shell demo={anyDemo} className={`smart-home ${light ? "home-light" : ""}`}>
      <header className="home-hero">
        <div className="min-w-0">
          <p className="home-hero-kicker">{hello}</p>
          <h1 className="home-hero-title">Okosotthon</h1>
          <div className="home-hero-status" aria-label="Eszközök állapota">
            <span className="home-pill home-pill-on"><Wifi size={14} />{online} online</span>
            <span className={`home-pill ${offline ? "home-pill-off" : ""}`}><WifiOff size={14} />{offline} offline</span>
          </div>
        </div>
        <div className="home-hero-actions">
          <Button variant="ghost" size="icon" className="home-round" onClick={() => setTheme(nextTheme[theme])} title={`Téma: ${themeName[theme]}`} aria-label={`Téma váltása (most: ${themeName[theme]})`}><ThemeIcon /></Button>
          <Button variant="ghost" size="icon" className="home-round" onClick={refresh} disabled={refreshing} title="Frissítés" aria-label="Okosotthon frissítése"><RefreshCw className={refreshing ? "animate-spin" : ""} /></Button>
        </div>
      </header>

      <div id="home-panel" role="tabpanel" aria-labelledby={`tab-${view}`} className="home-view-panel">
        {view === "overview" && <>
          <div className="home-chip-row">{summaries.map(({ id, title, value, detail, icon: Icon, tone }) => <button type="button" key={id} className={`home-chip home-tone-${tone}`} onClick={() => id === "energy" ? selectView("energy") : openCategory(id)}>
            <span className="home-chip-icon"><Icon size={20} strokeWidth={1.75} /></span>
            <span className="home-chip-label">{title}</span><strong>{value}</strong><span className="home-chip-detail">{detail}</span>
          </button>)}</div>
          <h2 className="home-heading">Gyorsműveletek</h2>
          <div className="home-quick-row">
            <button type="button" className="home-quick" onClick={() => openCategory("blinds")}><BlindsIcon size={20} />Redőnyök</button>
            <button type="button" className="home-quick" onClick={() => openCategory("gree")}><Snowflake size={20} />Klímák</button>
            <button type="button" className="home-quick" onClick={() => openCategory("tuya")}><Lightbulb size={20} />Lámpák, aljzatok</button>
            <button type="button" className="home-quick" onClick={() => openCategory("bosch")}><WashingMachine size={20} />Háztartási gépek</button>
            <button type="button" className="home-quick" onClick={() => openCategory("locks")}><LockKeyhole size={20} />Zárak</button>
          </div>
          {rooms.length > 0 && <><div className="home-heading-row"><h2 className="home-heading">Szobák</h2><button type="button" className="home-link" onClick={() => selectView("rooms")}>Összes<ChevronRight size={14} /></button></div>
            <div className="home-room-strip">{rooms.slice(0, 6).map(([room, list]) => <RoomCard key={room} room={room} list={list} fmt={fmt} onClick={() => selectView("rooms")} />)}</div></>}
          <div className="home-heading-row"><h2 className="home-heading">Kedvencek</h2><button type="button" className="home-link" onClick={() => selectView("more")}>Szerkesztés<ChevronRight size={14} /></button></div>
          {favorites.length === 0 ? <p className="home-empty">Nincs kedvenc. A „Több” fülön választhatsz.</p>
            : <div className="home-dashboard-grid">{CATEGORIES.filter((c) => favorites.includes(c.id)).map((c) => <CategoryPanel key={c.id} id={c.id} />)}</div>}
        </>}

        {view === "rooms" && <>
          <h2 className="home-heading">Szobák</h2>
          {rooms.length === 0 ? <p className="home-empty">Még nincs szoba. A hőmérők eszközkezelőjében adhatsz meg helyet (pl. Nappali).</p>
            : <div className="home-room-grid">{rooms.map(([room, list]) => <section key={room} className="home-room">
              <RoomCard room={room} list={list} fmt={fmt} />
              <ul className="home-room-list">{list.map((s) => <li key={s.did}><span className={`status-dot ${s.online ? "bg-home-success" : "bg-muted-foreground"}`} /><span className="min-w-0 flex-1 truncate">{thermometers.meta[s.did]?.name || s.name}</span><span className="tabular-nums">{s.temp != null ? `${fmt(s.temp)}°` : "–"}</span>{s.hum != null && <span className="tabular-nums text-muted-foreground">{s.hum}%</span>}</li>)}</ul>
            </section>)}</div>}
          <p className="home-note">A szobákat a hőmérők helye alapján csoportosítjuk. A többi eszköz az Eszközök fülön, típus szerint érhető el.</p>
        </>}

        {view === "devices" && <>
          <div className="home-filter-row" role="tablist" aria-label="Eszköztípusok">{CATEGORIES.map(({ id, name, icon: Icon }) => <button type="button" key={id} role="tab" aria-selected={category === id} className={`home-filter ${category === id ? "home-filter-active" : ""}`} onClick={() => setCategory(id)}><Icon size={16} />{name}</button>)}</div>
          <CategoryPanel id={category} />
        </>}

        {view === "energy" && <SmartEnergy data={data} />}

        {view === "more" && <>
          <h2 className="home-heading">Kedvencek a kezdőlapon</h2>
          <div className="home-settings-list">{CATEGORIES.map(({ id, name, icon: Icon }) => { const on = favorites.includes(id); return <button type="button" key={id} className="home-setting" aria-pressed={on} onClick={() => toggleFavorite(id)}><span className="home-chip-icon"><Icon size={18} /></span><span className="flex-1 text-left">{name}</span><Star size={20} className={on ? "home-star-on" : "text-muted-foreground"} /></button>; })}</div>
          <h2 className="home-heading">Megjelenés</h2>
          <div className="home-segment" role="radiogroup" aria-label="Téma">{(["system", "light", "dark"] as Theme[]).map((t) => <button type="button" key={t} role="radio" aria-checked={theme === t} className={theme === t ? "home-segment-active" : ""} onClick={() => setTheme(t)}>{themeName[t]}</button>)}</div>
          <h2 className="home-heading">Eszközkezelők</h2>
          <div className="home-settings-list">{CATEGORIES.map(({ id, name, icon: Icon }) => <button type="button" key={id} className="home-setting" onClick={() => openCategory(id)}><span className="home-chip-icon"><Icon size={18} /></span><span className="flex-1 text-left">{name}</span><ChevronRight size={18} className="text-muted-foreground" /></button>)}</div>
          <p className="home-note">Átnevezés és elrejtés az egyes eszköztípusok fogaskerék gombjával.</p>
          <Link to="/settings" className="home-setting mt-3"><span className="home-chip-icon"><Cable size={18} /></span><span className="flex-1">Kapcsolatok és fiókok</span><ChevronRight size={18} className="text-muted-foreground" /></Link>
        </>}
      </div>

      <nav className="home-tabbar" role="tablist" aria-label="Okosotthon nézetek">{sections.map(({ id, name, icon: Icon }) => <button type="button" key={id} id={`tab-${id}`} role="tab" aria-selected={view === id} aria-controls="home-panel" className={view === id ? "home-tab-active" : ""} onClick={() => selectView(id)}><Icon size={22} strokeWidth={view === id ? 2.2 : 1.75} /><span>{name}</span></button>)}</nav>
    </Shell>
  );
}
function RoomCard({ room, list, fmt, onClick }: { room: string; list: { temp?: number | null; hum?: number | null; online: boolean }[]; fmt: (n: number) => string; onClick?: () => void }) {
  const temps = list.flatMap((s) => s.temp == null ? [] : [s.temp]); const hums = list.flatMap((s) => s.hum == null ? [] : [s.hum]);
  const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  const off = list.filter((s) => !s.online).length;
  const body = <><span className="home-room-name"><DoorOpen size={16} />{room}</span>
    <strong className="tabular-nums">{temps.length ? `${fmt(avg(temps))}°` : "–"}</strong>
    <span className="home-chip-detail">{hums.length ? <><Droplets size={12} className="inline" /> {Math.round(avg(hums))}% · </> : null}{list.length} eszköz{off ? ` · ${off} offline` : ""}</span></>;
  return onClick ? <button type="button" className="home-room-card" onClick={onClick}>{body}</button> : <div className="home-room-card">{body}</div>;
}
