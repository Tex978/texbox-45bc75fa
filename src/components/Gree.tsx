import { Link } from "@tanstack/react-router";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Fan, Minus, Plus, Power, Settings2, Snowflake } from "lucide-react";
import { SmartSection } from "@/components/SmartHomeUI";
import { Button } from "@/components/ui/button";
import { getGree, greeControl } from "@/lib/nas.functions";
import { GREE_FANS, GREE_MODES } from "@/lib/gree-rules";
export const greeQuery = queryOptions({ queryKey: ["gree"], queryFn: () => getGree(), staleTime: 60_000, refetchInterval: 60_000, retry: false });
const modeLabels = { auto: "Automatikus", cool: "Hűtés", heat: "Fűtés", dry: "Páramentesítés", fan_only: "Ventilátor" };
const fanLabels = { auto: "Automatikus", low: "Alacsony", mediumLow: "Közepesen alacsony", medium: "Közepes", mediumHigh: "Közepesen magas", high: "Magas" };
type Unit = Awaited<ReturnType<typeof getGree>>["units"][number];
function GreeDevice({ unit }: { unit: Unit }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const properties = unit.properties;
  const temperature = typeof properties["temperature"] === "number" ? properties["temperature"] : null;
  const on = properties["power"] === "on";
  const send = async (property: string, value: string | number) => {
    setBusy(true); setError("");
    try {
      await greeControl({ data: { ip: unit.ip, property, value } });
      await qc.invalidateQueries({ queryKey: ["gree"] });
    } catch (e) { setError(String((e as Error).message)); }
    finally { setBusy(false); }
  };
  return <div className="smart-device space-y-4">
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3"><div className="flex min-w-0 items-center gap-2"><Snowflake size={20} className="shrink-0 text-home-water" /><div className="min-w-0"><h3 className="truncate font-medium">{unit.name}</h3><p className="text-xs text-muted-foreground">{unit.online ? "Elérhető" : "Offline"}</p></div></div>
      <Button variant={on ? "default" : "outline"} size="icon" title={on ? "Kikapcsolás" : "Bekapcsolás"} aria-label={`${unit.name} ${on ? "kikapcsolás" : "bekapcsolás"}`} disabled={busy || !unit.online} onClick={() => send("power", on ? "off" : "on")}><Power /></Button>
    </div>
    {unit.online ? <>
      <div className="flex items-center justify-center gap-5 py-2"><Button variant="outline" size="icon" aria-label={`${unit.name} hőmérséklet csökkentése`} disabled={busy || temperature == null || temperature <= 16} onClick={() => { if (temperature != null) void send("temperature", temperature - 1); }}><Minus /></Button><span className="text-3xl font-semibold tabular-nums">{temperature ?? "–"}°</span><Button variant="outline" size="icon" aria-label={`${unit.name} hőmérséklet növelése`} disabled={busy || temperature == null || temperature >= 30} onClick={() => { if (temperature != null) void send("temperature", temperature + 1); }}><Plus /></Button></div>
      <div className="grid grid-cols-2 gap-3"><label className="min-w-0 text-xs text-muted-foreground">Üzemmód<select className="mt-1 w-full rounded-md border border-input bg-background px-2 text-foreground" aria-label={`${unit.name} üzemmód`} value={String(properties["mode"] ?? "")} disabled={busy} onChange={(e) => send("mode", e.target.value)}><option value="" disabled>–</option>{GREE_MODES.map((mode) => <option key={mode} value={mode}>{modeLabels[mode]}</option>)}</select></label>
      <label className="min-w-0 text-xs text-muted-foreground"><span className="inline-flex items-center gap-1"><Fan size={12} />Ventilátor</span><select className="mt-1 w-full rounded-md border border-input bg-background px-2 text-foreground" aria-label={`${unit.name} ventilátor`} value={String(properties["fanSpeed"] ?? "")} disabled={busy} onChange={(e) => send("fanSpeed", e.target.value)}><option value="" disabled>–</option>{GREE_FANS.map((fan) => <option key={fan} value={fan}>{fanLabels[fan]}</option>)}</select></label></div>
    </> : <p className="text-xs text-muted-foreground">{unit.error}</p>}
    {error && <p role="alert" className="break-words text-xs text-destructive">{error}</p>}
  </div>;
}
export function Gree() {
  const { data } = useSuspenseQuery(greeQuery);
  return <SmartSection title="Gree klímák"><div className="mb-4 flex justify-end"><Button variant="outline" asChild><Link to="/settings"><Settings2 />Kapcsolatok</Link></Button></div>
    {data.error ? <p className="text-sm text-destructive">{data.error}</p> : !data.configured ? <p className="text-sm text-muted-foreground">Nincs csatlakoztatott klíma.</p> : data.units.length === 0 ? <p className="text-sm text-muted-foreground">Nem találtunk klímát a Gree+ fiókban.</p> : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{data.units.map((unit) => <GreeDevice key={unit.ip} unit={unit} />)}</div>}
  </SmartSection>;
}