import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { getMe } from "@/lib/auth.functions";
import { Shell } from "@/components/Shell";
import { SmartSection as Card, SensorDetails } from "@/components/SmartHomeUI";
import { SmartEnergy } from "@/components/SmartEnergy";
import { Scenes } from "@/components/Scenes";
import { Button } from "@/components/ui/button";
import {
  Blinds as BlindsIcon,
  Cable,
  Check,
  ChevronRight,
  DoorOpen,
  Droplets,
  Fan,
  House,
  LayoutGrid,
  LockKeyhole,
  Moon,
  Power,
  RefreshCw,
  Settings2,
  Snowflake,
  Star,
  Sun,
  SunMoon,
  Thermometer,
  WashingMachine,
  Lightbulb,
  Wifi,
  WifiOff,
  Sparkles,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import {
  getSolar,
  getThermometers,
  saveThermometerMeta,
  xiaomiSendCode,
  xiaomiVerify,
  getPurifiers,
  purifierAction,
  getLocks,
} from "@/lib/nas.functions";
import { visibleThermometers, type ThermometerMeta } from "@/lib/thermometer-meta";
import React, { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Blinds, blindsQuery as bq } from "@/components/Blinds";
import { Appliances, appliancesQuery } from "@/components/Appliances";
import { Tuya, tuyaQuery } from "@/components/Tuya";
import { Gree, GreeQuickControls, greeQuery } from "@/components/Gree";
import { SOLAR_REFRESH_MS } from "@/lib/growatt-cache";
import { ThermometerHistory } from "@/components/ThermometerHistory";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { buildHomeDevices, groupByRoom, type HomeDevice } from "@/lib/home-devices";
import { useGreeRooms } from "@/lib/gree-rooms";
import { useSharedPref } from "@/lib/use-shared-pref";
const tq = queryOptions({
  queryKey: ["thermo"],
  queryFn: () => getThermometers(),
  refetchInterval: 120000,
});
const pq = queryOptions({
  queryKey: ["purifier"],
  queryFn: () => getPurifiers(),
  refetchInterval: 60000,
});
const lq = queryOptions({
  queryKey: ["locks"],
  queryFn: async () => {
    const me = await getMe();
    if (me.mode !== "open" && !me.user?.can.locks)
      return {
        demo: false,
        error: "A zárak megtekintéséhez nincs jogosultságod.",
        raw: "",
        locks: [],
      };
    return getLocks();
  },
  refetchInterval: 60000,
});
const q = queryOptions({
  queryKey: ["solar"],
  queryFn: () => getSolar(),
  staleTime: SOLAR_REFRESH_MS,
  refetchInterval: SOLAR_REFRESH_MS,
  refetchOnWindowFocus: false,
  retry: false,
});
export const Route = createFileRoute("/home")({
  head: () => ({
    meta: [
      { title: "Okosotthon – NAS Vezérlő" },
      { name: "description", content: "Napelem termelés és okosotthon eszközök egy helyen." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:title", content: "Okosotthon – NAS Vezérlő" },
      { property: "og:description", content: "Napelem termelés és okosotthon eszközök." },
    ],
  }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(q),
      context.queryClient.ensureQueryData(bq),
      context.queryClient.ensureQueryData(tq),
      context.queryClient.ensureQueryData(pq),
      context.queryClient.ensureQueryData(lq),
      context.queryClient.ensureQueryData(appliancesQuery),
      context.queryClient.ensureQueryData(tuyaQuery),
      context.queryClient.ensureQueryData(greeQuery),
    ]),
  component: Home,
});
function XiaomiVerify({ url }: { url: string }) {
  const qc = useQueryClient();
  const [st, setSt] = useState<{ ick: string; flag: number; via: string } | null>(null);
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async (f: () => Promise<void>) => {
    setBusy(true);
    setErr("");
    try {
      await f();
    } catch (e) {
      setErr(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  };
  const btn =
    "rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60";
  return (
    <div className="space-y-3 text-sm">
      <p>
        A Xiaomi egyszeri ellenőrző kódot kér ehhez az apphoz. Utána megjegyzi, és nem kér többet.
      </p>
      {!st ? (
        <Button
          variant="outline"
          className={btn}
          disabled={busy}
          onClick={() => run(async () => setSt(await xiaomiSendCode({ data: { url } })))}
        >
          {busy ? "Küldés…" : "Kód kérése"}
        </Button>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground">Kódot küldtünk ({st.via}):</span>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            inputMode="numeric"
            placeholder="123456"
            className="w-32 rounded-md border border-input bg-background px-3 py-2 font-mono outline-none focus:ring-2 focus:ring-ring"
          />
          <Button
            variant="outline"
            className={btn}
            disabled={busy || !code}
            onClick={() =>
              run(async () => {
                await xiaomiVerify({ data: { url, ...st, code } });
                await qc.invalidateQueries({ queryKey: ["thermo"] });
              })
            }
          >
            {busy ? "Ellenőrzés…" : "Megerősítés"}
          </Button>
        </div>
      )}
      {err && <p className="break-all font-mono text-destructive">● {err}</p>}
    </div>
  );
}
const inp =
  "w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring";
function Thermometers() {
  const { data } = useSuspenseQuery(tq);
  const qc = useQueryClient();
  const [names, setNames] = useState<ThermometerMeta>(data.meta);
  const [edit, setEdit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!edit) setNames(data.meta);
  }, [data.meta, edit]);
  useEffect(() => {
    let active = true;
    const migrate = async () => {
      try {
        const raw = localStorage.getItem("thermo-names");
        if (!raw) return;
        const meta = await saveThermometerMeta({
          data: { items: JSON.parse(raw), onlyMissing: true },
        });
        localStorage.removeItem("thermo-names");
        if (active)
          qc.setQueryData(tq.queryKey, (current: typeof data | undefined) =>
            current ? { ...current, meta } : current,
          );
      } catch {
        if (active)
          setError("A korábbi hőmérőnevek átvétele nem sikerült; a böngészőben megmaradtak.");
      }
    };
    void migrate();
    return () => {
      active = false;
    };
  }, [qc]);
  const upd = (did: string, values: ThermometerMeta[string]) =>
    setNames((n) => ({ ...n, [did]: { ...n[did], ...values } }));
  const finish = async () => {
    setBusy(true);
    setError("");
    try {
      const meta = await saveThermometerMeta({ data: { items: names } });
      qc.setQueryData(tq.queryKey, (current: typeof data | undefined) =>
        current ? { ...current, meta } : current,
      );
      setEdit(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nem sikerült menteni a hőmérőket.");
    } finally {
      setBusy(false);
    }
  };
  const shown = visibleThermometers(data.sensors, data.meta);
  return (
    <Card
      title="Hőmérők (Xiaomi)"
      className="mt-4"
      action={
        !data.verifyUrl && !data.error && data.sensors.length > 0 ? (
          <Button
            variant="outline"
            size="icon"
            disabled={busy}
            onClick={() => (edit ? void finish() : setEdit(true))}
            className="text-muted-foreground hover:text-foreground"
            title={edit ? "Mentés" : "Eszközkezelő"}
            aria-label={edit ? "Hőmérők mentése" : "Hőmérők eszközkezelője"}
          >
            {edit ? <Check /> : <Settings2 />}
          </Button>
        ) : undefined
      }
    >
      {data.verifyUrl ? (
        <XiaomiVerify url={data.verifyUrl} />
      ) : data.error ? (
        <p className="break-all font-mono text-sm text-destructive">● {data.error}</p>
      ) : (
        <>
          {edit && (
            <div className="mb-4 space-y-2 rounded-lg border border-border p-3">
              {data.sensors.map((t) => (
                <div
                  key={t.did}
                  className="grid grid-cols-2 gap-2 border-b border-border py-2 last:border-0"
                >
                  <span className="col-span-2 text-sm font-medium">{t.name}</span>
                  <input
                    aria-label={`${t.name} neve`}
                    disabled={busy}
                    value={names[t.did]?.name ?? ""}
                    placeholder={t.name}
                    onChange={(e) => upd(t.did, { name: e.target.value })}
                    className={inp}
                  />
                  <input
                    aria-label={`${t.name} helye`}
                    disabled={busy}
                    value={names[t.did]?.room ?? ""}
                    placeholder="Hely (pl. Nappali)"
                    onChange={(e) => upd(t.did, { room: e.target.value })}
                    className={inp}
                  />
                  <label className="col-span-2 flex min-h-11 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      disabled={busy}
                      checked={names[t.did]?.hidden === true}
                      onChange={(e) => upd(t.did, { hidden: e.target.checked })}
                      aria-label={`${t.name} elrejtése`}
                    />
                    Elrejtés
                  </label>
                </div>
              ))}
            </div>
          )}
          {!edit && (
            <div className="home-sensor-grid">
              {shown.map((t) => (
                <div key={t.did} className="smart-device sensor-device">
                  <div className="sensor-heading flex min-w-0 items-center gap-2">
                    <Thermometer size={17} className="shrink-0 text-home-water" />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {names[t.did]?.name || t.name}
                      </div>
                      {names[t.did]?.room && (
                        <div className="truncate text-xs text-muted-foreground">
                          {names[t.did]?.room}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="sensor-reading mt-5 text-3xl font-semibold tabular-nums">
                    {t.temp != null
                      ? `${t.temp.toLocaleString("hu-HU", { maximumFractionDigits: 1 })}°`
                      : "–"}
                  </div>
                  <SensorDetails humidity={t.hum} battery={t.battery} online={t.online} />
                  <ThermometerHistory did={t.did} name={names[t.did]?.name || t.name} />
                </div>
              ))}
            </div>
          )}
          {!edit && data.sensors.length > 0 && shown.length === 0 && (
            <p className="text-sm text-muted-foreground">Minden hőmérő elrejtve.</p>
          )}
          {data.sensors.length === 0 && (
            <p className="text-sm text-muted-foreground">Nem találtunk hőmérőt a Mi fiókban.</p>
          )}
          {data.raw && (
            <details className="mt-3 text-xs text-muted-foreground">
              <summary className="cursor-pointer">Nyers adatok (hibakereséshez)</summary>
              <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all font-mono">
                {data.raw}
              </pre>
            </details>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
    </Card>
  );
}
const MODES = ["Auto", "Alvó", "Kedvenc", "Kézi"];
function Purifiers() {
  const { data } = useSuspenseQuery(pq);
  const qc = useQueryClient();
  const [err, setErr] = useState("");
  const act = async (did: string, key: "on" | "mode", value: boolean | number) => {
    setErr("");
    try {
      await purifierAction({ data: { did, key, value } });
      await qc.invalidateQueries({ queryKey: ["purifier"] });
    } catch (e) {
      setErr(String((e as Error).message || e));
    }
  };
  if (!data.error && data.purifiers.length === 0) return null;
  const b = (on: boolean) =>
    `rounded-md px-3 py-1.5 text-sm ${on ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`;
  return (
    <Card title="Légtisztító" className="mt-4">
      {data.error ? (
        <p className="break-all font-mono text-sm text-destructive">● {data.error}</p>
      ) : (
        data.purifiers.map((p) => (
          <div key={p.did} className="smart-device space-y-4">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
              <span className="inline-flex min-w-0 items-center gap-2 font-medium">
                <Fan size={19} className="shrink-0 text-home-water" />
                <span className="truncate">{p.name}</span>
                {!p.online && <span className="text-xs text-muted-foreground">offline</span>}
              </span>
              <Button
                variant="outline"
                size="icon"
                aria-label={`${p.name} ${p.on ? "kikapcsolás" : "bekapcsolás"}`}
                title={p.on ? "Kikapcsolás" : "Bekapcsolás"}
                className={b(!!p.on)}
                onClick={() => act(p.did, "on", !p.on)}
              >
                <Power size={16} />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3 border-y border-border py-4 xl:grid-cols-4">
              {[
                ["PM2.5", p.pm25 != null ? `${p.pm25} µg/m³` : "–"],
                ["Pára", p.hum != null ? `${p.hum}%` : "–"],
                ["Hőmérséklet", p.temp != null ? `${p.temp}°` : "–"],
                ["Szűrő", p.filter != null ? `${p.filter}%` : "–"],
              ].map(([l, v]) => (
                <div key={l}>
                  <div className="text-xs text-muted-foreground">{l}</div>
                  <div className="mt-1 text-sm font-medium tabular-nums">{v}</div>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {MODES.map((m, i) => (
                <Button
                  variant="outline"
                  key={m}
                  className={b(p.mode === i)}
                  disabled={!p.on}
                  onClick={() => act(p.did, "mode", i)}
                >
                  {m}
                </Button>
              ))}
            </div>
          </div>
        ))
      )}
      {err && <p className="mt-2 break-all font-mono text-sm text-destructive">● {err}</p>}
      {data.raw && (
        <details className="mt-3 text-xs text-muted-foreground">
          <summary className="cursor-pointer">Nyers adatok (hibakereséshez)</summary>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all font-mono">
            {data.raw}
          </pre>
        </details>
      )}
    </Card>
  );
}
function Locks() {
  const { data } = useSuspenseQuery(lq);
  if (!data.error && data.locks.length === 0) return null;
  return (
    <Card title="Okoszár" className="mt-4">
      {data.error ? (
        <p className="break-all font-mono text-sm text-destructive">● {data.error}</p>
      ) : (
        data.locks.map((l) => (
          <div
            key={l.did}
            className="smart-device flex flex-wrap items-center justify-between gap-3"
          >
            <span className="inline-flex items-center gap-3 font-medium">
              <LockKeyhole size={21} className="text-home-success" />
              {l.name}
            </span>
            <SensorDetails battery={l.battery} online={l.online} />
          </div>
        ))
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        Távoli nyitást a Xiaomi biztonsági okból nem enged, csak az állapot látszik.
      </p>
      {data.raw && (
        <details className="mt-3 text-xs text-muted-foreground">
          <summary className="cursor-pointer">Nyers adatok (hibakereséshez)</summary>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all font-mono">
            {data.raw}
          </pre>
        </details>
      )}
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
type CategoryId = (typeof CATEGORIES)[number]["id"];
function CategoryPanel({
  id,
  greeIp,
  onGreeSelect,
}: {
  id: CategoryId;
  greeIp?: string | null;
  onGreeSelect?: (ip: string) => void;
}) {
  if (id === "sensors") return <Thermometers />;
  if (id === "gree") return <Gree selectedIp={greeIp} onSelect={onGreeSelect} />;
  if (id === "air") return <Purifiers />;
  if (id === "blinds") return <Blinds />;
  if (id === "tuya") return <Tuya />;
  if (id === "bosch") return <Appliances />;
  return <Locks />;
}
type Theme = "system" | "light" | "dark";
function usePref<T>(key: "home-favorites" | "home-theme", initial: T) {
  const { value, save } = useSharedPref<T>(key, initial);
  return [value, (next: T) => void save(next)] as const;
}
function useMedia(query: string) {
  const [match, setMatch] = useState(false);
  useEffect(() => {
    const m = window.matchMedia(query);
    setMatch(m.matches);
    const f = () => setMatch(m.matches);
    m.addEventListener("change", f);
    return () => m.removeEventListener("change", f);
  }, [query]);
  return match;
}
function greeting() {
  const h = new Date().getHours();
  return h < 10 ? "Jó reggelt" : h < 18 ? "Szép napot" : "Jó estét";
}
const catOf = (id: CategoryId) => CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[0];
const fmt = (n: number) => n.toLocaleString("hu-HU", { maximumFractionDigits: 1 });
const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;

function DeviceTile({
  d,
  onOpen,
}: {
  d: HomeDevice;
  onOpen: (c: CategoryId, deviceKey?: string) => void;
}) {
  const Icon = catOf(d.category).icon;
  const { data: greeData } = useSuspenseQuery(greeQuery);
  const unit =
    d.category === "gree" ? greeData.units.find((u) => `gree:${u.ip}` === d.key) : undefined;
  const tile = (
    <Button
      variant="ghost"
      type="button"
      className={`hd-tile ${d.active ? "hd-tile-on" : ""} ${d.online ? "" : "hd-tile-offline"} hd-cat-${d.category}`}
      onClick={() => onOpen(d.category, d.key)}
      aria-label={`${d.name}: ${d.state}. Vezérlés megnyitása`}
    >
      <span className="hd-tile-top">
        <span className="hd-tile-icon">
          <Icon size={22} strokeWidth={1.8} />
        </span>
        {d.value && <span className="hd-tile-value">{d.value}</span>}
      </span>
      <span className="hd-tile-name">{d.name}</span>
      <span className="hd-tile-state">
        <span className={`hd-dot ${d.online ? "hd-dot-on" : "hd-dot-off"}`} />
        {d.state}
        {d.room ? ` · ${d.room}` : ""}
      </span>
    </Button>
  );
  return unit ? (
    <div className="hd-climate-tile">
      {tile}
      <GreeQuickControls unit={unit} />
    </div>
  ) : (
    tile
  );
}
function TileGrid({
  list,
  onOpen,
}: {
  list: HomeDevice[];
  onOpen: (c: CategoryId, deviceKey?: string) => void;
}) {
  return (
    <div className="hd-grid">
      {list.map((d) => (
        <DeviceTile key={d.key} d={d} onOpen={onOpen} />
      ))}
    </div>
  );
}
function SectionTitle({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="hd-section-title">
      <h2>{children}</h2>
      {action}
    </div>
  );
}

function Home() {
  const { data } = useSuspenseQuery(q);
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => {
    setRefreshing(true);
    try {
      await qc.invalidateQueries({
        predicate: (query) =>
          ["solar", "thermo", "purifier", "locks", "blinds", "hc", "tuya", "gree"].includes(
            String(query.queryKey[0]),
          ),
      });
    } finally {
      setRefreshing(false);
    }
  };
  const { data: thermometers } = useSuspenseQuery(tq);
  const { data: blinds } = useSuspenseQuery(bq);
  const { data: gree } = useSuspenseQuery(greeQuery);
  const { data: appliances } = useSuspenseQuery(appliancesQuery);
  const { data: tuya } = useSuspenseQuery(tuyaQuery);
  const { data: purifiers } = useSuspenseQuery(pq);
  const { data: locks } = useSuspenseQuery(lq);
  const [view, setView] = useState("overview");
  const [category, setCategory] = useState<CategoryId | "all">("all");
  const [greeIp, setGreeIp] = useState<string | null>(null);
  const { state: greeRooms } = useGreeRooms();
  const [panel, setPanel] = useState<CategoryId>("sensors");
  const [sheet, setSheet] = useState<CategoryId | null>(null);
  const [favorites, setFavorites] = usePref<CategoryId[]>("home-favorites", ["sensors", "blinds"]);
  const [theme, setTheme] = usePref<Theme>("home-theme", "system");
  const [hello, setHello] = useState("Otthon");
  useEffect(() => setHello(greeting()), []);
  const systemLight = useMedia("(prefers-color-scheme: light)");
  const desktop = useMedia("(min-width: 1024px)");
  const light = theme === "light" || (theme === "system" && systemLight);
  useEffect(() => {
    document.body.classList.toggle("home-light-portal", light);
    return () => document.body.classList.remove("home-light-portal");
  }, [light]);
  const selectView = (id: string) => {
    setView(id);
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const openDevice = (id: CategoryId, deviceKey?: string) => {
    if (id === "gree" && deviceKey) setGreeIp(deviceKey.slice(5));
    setPanel(id);
    if (!(desktop && view === "devices")) setSheet(id);
  };
  const toggleFavorite = (id: CategoryId) =>
    setFavorites(favorites.includes(id) ? favorites.filter((f) => f !== id) : [...favorites, id]);
  const sections = [
    { id: "overview", name: "Otthon", icon: House },
    { id: "rooms", name: "Szobák", icon: DoorOpen },
    { id: "devices", name: "Eszközök", icon: LayoutGrid },
    { id: "scenes", name: "Jelenetek", icon: Sparkles },
    { id: "energy", name: "Energia", icon: Sun },
    { id: "more", name: "Több", icon: Settings2 },
  ];
  const shownThermometers = visibleThermometers(thermometers.sensors, thermometers.meta);
  const vendorDevices = buildHomeDevices({
    sensors: shownThermometers,
    sensorMeta: thermometers.meta,
    gree: gree.units,
    purifiers: purifiers.purifiers,
    blinds: blinds.blinds,
    tuya: tuya.devices,
    tuyaMeta: tuya.meta,
    appliances: appliances.appliances,
    locks: locks.locks,
  });
  const devices = vendorDevices.map((d) =>
    d.category === "gree" ? { ...d, room: greeRooms.assignments[d.key.slice(5)] ?? "" } : d,
  );
  const online = devices.filter((d) => d.online).length;
  const offline = devices.length - online;
  const activeCount = devices.filter((d) => d.active && d.category !== "sensors").length;
  const temps = shownThermometers.flatMap((s) => (s.temp == null ? [] : [s.temp]));
  const hums = shownThermometers.flatMap((s) => (s.hum == null ? [] : [s.hum]));
  const anyDemo = data.demo || thermometers.demo || blinds.demo;
  const { rooms, other } = groupByRoom(devices);
  const count = (id: CategoryId) => devices.filter((d) => d.category === id).length;
  const errors: Partial<Record<CategoryId, boolean>> = {
    sensors: !!(thermometers.error || thermometers.verifyUrl),
    gree: !!gree.error,
    air: !!purifiers.error,
    blinds: !!blinds.error,
    tuya: !!tuya.error,
    bosch: !!appliances.error,
    locks: !!locks.error,
  };
  const ThemeIcon = theme === "system" ? SunMoon : theme === "light" ? Sun : Moon;
  const nextTheme: Record<Theme, Theme> = { system: "light", light: "dark", dark: "system" };
  const themeName: Record<Theme, string> = {
    system: "Rendszer szerint",
    light: "Világos",
    dark: "Sötét",
  };
  const favDevices = devices.filter((d) => favorites.includes(d.category));
  const filtered = category === "all" ? devices : devices.filter((d) => d.category === category);
  const sheetCat = sheet ? catOf(sheet) : null;
  const solarKw = data.error ? null : data.currentW / 1000;

  return (
    <Shell demo={anyDemo} className={`smart-home hd ${light ? "home-light" : ""}`}>
      <div className="hd-layout">
        <nav className="hd-nav" aria-label="Okosotthon nézetek">
          <div className="hd-nav-brand">
            <House size={20} />
            <span>Otthonom</span>
          </div>
          {sections.map(({ id, name, icon: Icon }) => (
            <button
              type="button"
              key={id}
              id={`tab-${id}`}

              aria-pressed={view === id}
              aria-controls="home-panel"
              className={view === id ? "hd-nav-active" : ""}
              onClick={() => selectView(id)}
            >
              <Icon size={22} strokeWidth={view === id ? 2.3 : 1.7} />
              <span>{name}</span>
            </button>
          ))}
        </nav>

        <div className="hd-content">
          <header className="hd-header">
            <div className="min-w-0">
              <p className="hd-kicker">{hello}</p>
              <h1 className="hd-title">
                {view === "overview" ? "Otthonom" : sections.find((s) => s.id === view)?.name}
              </h1>
            </div>
            <div className="hd-header-actions">
              <Button
                variant="ghost"
                size="icon"
                className="hd-round"
                onClick={() => setTheme(nextTheme[theme])}
                title={`Téma: ${themeName[theme]}`}
                aria-label={`Téma váltása (most: ${themeName[theme]})`}
              >
                <ThemeIcon />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="hd-round"
                onClick={refresh}
                disabled={refreshing}
                title="Frissítés"
                aria-label="Okosotthon frissítése"
              >
                <RefreshCw className={refreshing ? "animate-spin" : ""} />
              </Button>
            </div>
          </header>

          <div id="home-panel" role="tabpanel" aria-labelledby={`tab-${view}`} className="hd-panel">
            {view === "scenes" && <Scenes />}
            {view === "overview" && (
              <div className="hd-overview">
                <section className="hd-hero" aria-label="Otthoni körülmények">
                  <div className="hd-hero-main">
                    <span className="hd-hero-label">
                      <Thermometer size={15} />
                      Bent most
                    </span>
                    <strong className="hd-hero-temp">
                      {temps.length ? `${fmt(avg(temps))}°` : "–"}
                    </strong>
                    <span className="hd-hero-sub">
                      {temps.length > 1
                        ? `${fmt(Math.min(...temps))}° – ${fmt(Math.max(...temps))}° · `
                        : ""}
                      {shownThermometers.length} hőmérő{thermometers.demo ? " · Minta" : ""}
                    </span>
                  </div>
                  <div className="hd-hero-stats">
                    <div>
                      <Droplets size={16} />
                      <strong>{hums.length ? `${Math.round(avg(hums))}%` : "–"}</strong>
                      <span>Pára</span>
                    </div>
                    <button type="button" onClick={() => selectView("energy")}>
                      <Sun size={16} />
                      <strong>{solarKw != null ? `${fmt(solarKw)} kW` : "–"}</strong>
                      <span>{data.error ? "Napelem hiba" : `Ma ${fmt(data.todayKwh)} kWh`}</span>
                    </button>
                    <div>
                      <Power size={16} />
                      <strong>{activeCount}</strong>
                      <span>Bekapcsolva</span>
                    </div>
                  </div>
                  <div className="hd-hero-status">
                    <span className="hd-pill hd-pill-on">
                      <Wifi size={14} />
                      {online} online
                    </span>
                    <span className={`hd-pill ${offline ? "hd-pill-off" : ""}`}>
                      <WifiOff size={14} />
                      {offline} offline
                    </span>
                  </div>
                </section>

                <section className="hd-block hd-quick-block">
                  <SectionTitle>Gyors elérés</SectionTitle>
                  <div className="hd-quick">
                    {CATEGORIES.map(({ id, name, icon: Icon }) =>
                      count(id) > 0 || errors[id] ? (
                        <button
                          type="button"
                          key={id}
                          className={`hd-quick-btn hd-cat-${id}`}
                          onClick={() => openDevice(id)}
                        >
                          <span className="hd-quick-icon">
                            <Icon size={24} strokeWidth={1.8} />
                          </span>
                          <span>{name}</span>
                          {errors[id] ? (
                            <em className="hd-quick-err">hiba</em>
                          ) : (
                            <em>{count(id)}</em>
                          )}
                        </button>
                      ) : null,
                    )}
                  </div>
                </section>

                <section className="hd-block hd-fav-block">
                  <SectionTitle
                    action={
                      <button type="button" className="hd-link" onClick={() => selectView("more")}>
                        Szerkesztés
                        <ChevronRight size={14} />
                      </button>
                    }
                  >
                    Kedvencek
                  </SectionTitle>
                  {favDevices.length === 0 ? (
                    <p className="hd-empty">
                      Nincs kedvenc eszköz. A „Több” fülön csillaggal választhatsz.
                    </p>
                  ) : (
                    <TileGrid list={favDevices.slice(0, desktop ? 12 : 8)} onOpen={openDevice} />
                  )}
                </section>

                <section className="hd-block hd-rooms-block">
                  <SectionTitle
                    action={
                      rooms.length > 0 ? (
                        <button
                          type="button"
                          className="hd-link"
                          onClick={() => selectView("rooms")}
                        >
                          Összes
                          <ChevronRight size={14} />
                        </button>
                      ) : undefined
                    }
                  >
                    Szobák
                  </SectionTitle>
                  {rooms.length === 0 ? (
                    <p className="hd-empty">
                      Még nincs szoba megadva. A hőmérők, redőnyök és Smart Life eszközök
                      beállításában adhatsz meg helyet.
                    </p>
                  ) : (
                    <div className="hd-room-row">
                      {rooms.map(([room, list]) => (
                        <RoomCard
                          key={room}
                          room={room}
                          list={list}
                          onClick={() => selectView("rooms")}
                        />
                      ))}
                    </div>
                  )}
                </section>
              </div>
            )}

            {view === "rooms" && (
              <>
                {rooms.length === 0 && (
                  <p className="hd-empty">
                    Még nincs szoba megadva. A hőmérők, redőnyök és Smart Life eszközök
                    beállításában adhatsz meg helyet.
                  </p>
                )}
                {rooms.map(([room, list]) => (
                  <section key={room} className="hd-block">
                    <RoomHeader room={room} list={list} />
                    <TileGrid list={list} onOpen={openDevice} />
                  </section>
                ))}
                {other.length > 0 && (
                  <section className="hd-block">
                    <SectionTitle>Egyéb eszközök</SectionTitle>
                    <TileGrid list={other} onOpen={openDevice} />
                  </section>
                )}
              </>
            )}

            {view === "devices" && (
              <>
                <div className="hd-filters" aria-label="Eszköztípusok">
                  <button
                    type="button"

                    aria-selected={category === "all"}
                    className={`hd-filter ${category === "all" ? "hd-filter-active" : ""}`}
                    onClick={() => setCategory("all")}
                  >
                    <LayoutGrid size={16} />
                    Összes<em>{devices.length}</em>
                  </button>
                  {CATEGORIES.map(({ id, name, icon: Icon }) => (
                    <button
                      type="button"
                      key={id}

                      aria-selected={category === id}
                      className={`hd-filter ${category === id ? "hd-filter-active" : ""}`}
                      onClick={() => {
                        setCategory(id);
                        setPanel(id);
                      }}
                    >
                      <Icon size={16} />
                      {name}
                      <em>{errors[id] ? "!" : count(id)}</em>
                    </button>
                  ))}
                </div>
                <div className="hd-devices">
                  <div className="hd-devices-list">
                    {(category === "all" ? CATEGORIES : [catOf(category)]).map(
                      ({ id, name, icon: Icon }) => {
                        const list = filtered.filter((d) => d.category === id);
                        return (
                          <section key={id} className="hd-block">
                            <SectionTitle
                              action={
                                <button
                                  type="button"
                                  className="hd-link"
                                  onClick={() => openDevice(id)}
                                >
                                  Vezérlés
                                  <ChevronRight size={14} />
                                </button>
                              }
                            >
                              <Icon size={18} className="hd-title-icon" />
                              {name}
                            </SectionTitle>
                            {list.length > 0 ? (
                              <TileGrid list={list} onOpen={openDevice} />
                            ) : (
                              <button
                                type="button"
                                className="hd-empty-card"
                                onClick={() => openDevice(id)}
                              >
                                {errors[id]
                                  ? "Kapcsolati hiba vagy ellenőrzés szükséges – megnyitás"
                                  : "Nincs megjeleníthető eszköz – beállítások megnyitása"}
                                <ChevronRight size={16} />
                              </button>
                            )}
                          </section>
                        );
                      },
                    )}
                  </div>
                  {desktop && (
                    <aside className="hd-detail" aria-label={`${catOf(panel).name} vezérlés`}>
                      <CategoryPanel id={panel} greeIp={greeIp} onGreeSelect={setGreeIp} />
                    </aside>
                  )}
                </div>
              </>
            )}

            {view === "energy" && (
              <div className="hd-energy">
                <SmartEnergy data={data} />
              </div>
            )}

            {view === "more" && (
              <div className="hd-more">
                <section>
                  <SectionTitle>Kedvencek a kezdőlapon</SectionTitle>
                  <div className="home-settings-list">
                    {CATEGORIES.map(({ id, name, icon: Icon }) => {
                      const on = favorites.includes(id);
                      return (
                        <button
                          type="button"
                          key={id}
                          className="home-setting"
                          aria-pressed={on}
                          onClick={() => toggleFavorite(id)}
                        >
                          <span className="home-chip-icon">
                            <Icon size={18} />
                          </span>
                          <span className="flex-1 text-left">{name}</span>
                          <Star
                            size={20}
                            className={on ? "home-star-on" : "text-muted-foreground"}
                          />
                        </button>
                      );
                    })}
                  </div>
                </section>
                <section>
                  <SectionTitle>Megjelenés</SectionTitle>
                  <div className="home-segment" role="radiogroup" aria-label="Téma">
                    {(["system", "light", "dark"] as Theme[]).map((t) => (
                      <button
                        type="button"
                        key={t}
                        role="radio"
                        aria-checked={theme === t}
                        className={theme === t ? "home-segment-active" : ""}
                        onClick={() => setTheme(t)}
                      >
                        {themeName[t]}
                      </button>
                    ))}
                  </div>
                  <SectionTitle>Eszközkezelők</SectionTitle>
                  <div className="home-settings-list">
                    {CATEGORIES.map(({ id, name, icon: Icon }) => (
                      <button
                        type="button"
                        key={id}
                        className="home-setting"
                        onClick={() => openDevice(id)}
                      >
                        <span className="home-chip-icon">
                          <Icon size={18} />
                        </span>
                        <span className="flex-1 text-left">{name}</span>
                        <ChevronRight size={18} className="text-muted-foreground" />
                      </button>
                    ))}
                  </div>
                  <p className="hd-empty">
                    Átnevezés, hely megadása és elrejtés az egyes eszköztípusok fogaskerék
                    gombjával.
                  </p>
                  <Link to="/settings" className="home-setting mt-3">
                    <span className="home-chip-icon">
                      <Cable size={18} />
                    </span>
                    <span className="flex-1">Kapcsolatok és fiókok</span>
                    <ChevronRight size={18} className="text-muted-foreground" />
                  </Link>
                </section>
              </div>
            )}
          </div>
        </div>
      </div>

      <Sheet
        open={sheet != null}
        onOpenChange={(o) => {
          if (!o) setSheet(null);
        }}
      >
        <SheetContent
          side={desktop ? "right" : "bottom"}
          className={`smart-home hd hd-sheet ${light ? "home-light" : ""}`}
        >
          {sheetCat && (
            <>
              <SheetHeader className="hd-sheet-header">
                <span className={`hd-tile-icon hd-cat-${sheetCat.id}`}>
                  <sheetCat.icon size={22} />
                </span>
                <div>
                  <SheetTitle>{sheetCat.name}</SheetTitle>
                  <SheetDescription>{count(sheetCat.id)} eszköz · teljes vezérlés</SheetDescription>
                </div>
              </SheetHeader>
              <div className="hd-sheet-body">
                <CategoryPanel id={sheetCat.id} greeIp={greeIp} onGreeSelect={setGreeIp} />
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </Shell>
  );
}
function roomStats(list: HomeDevice[]) {
  const temps = list
    .filter((d) => d.category === "sensors" && d.value)
    .map((d) => Number(d.value?.replace("°", "").replace(",", ".")));
  return {
    temp: temps.length ? `${fmt(avg(temps))}°` : null,
    active: list.filter((d) => d.active && d.category !== "sensors").length,
    offline: list.filter((d) => !d.online).length,
    cats: [...new Set(list.map((d) => d.category))],
  };
}
function RoomCard({
  room,
  list,
  onClick,
}: {
  room: string;
  list: HomeDevice[];
  onClick: () => void;
}) {
  const s = roomStats(list);
  return (
    <button type="button" className="hd-room" onClick={onClick}>
      <span className="hd-room-head">
        <span className="hd-room-name">{room}</span>
        {s.temp && <strong>{s.temp}</strong>}
      </span>
      <span className="hd-room-icons">
        {s.cats.map((c) => {
          const I = catOf(c).icon;
          return (
            <span key={c} className={`hd-cat-${c}`}>
              <I size={15} />
            </span>
          );
        })}
      </span>
      <span className="hd-room-meta">
        {list.length} eszköz{s.active ? ` · ${s.active} aktív` : ""}
        {s.offline ? ` · ${s.offline} offline` : ""}
      </span>
    </button>
  );
}
function RoomHeader({ room, list }: { room: string; list: HomeDevice[] }) {
  const s = roomStats(list);
  return (
    <div className="hd-room-header">
      <div>
        <h2>{room}</h2>
        <p>
          {list.length} eszköz{s.active ? ` · ${s.active} aktív` : ""}
          {s.offline ? ` · ${s.offline} offline` : ""}
        </p>
      </div>
      {s.temp && <strong>{s.temp}</strong>}
    </div>
  );
}
