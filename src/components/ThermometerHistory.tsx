import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { History, LoaderCircle, Thermometer, Droplets } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { getThermometerHistory } from "@/lib/nas.functions";

export function ThermometerHistory({ did, name }: { did: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState(1);
  const [metric, setMetric] = useState<"temp" | "hum">("temp");
  const query = useQuery({ queryKey: ["thermo-history", did, days], queryFn: () => getThermometerHistory({ data: { did, days } }), enabled: open, staleTime: 300_000, retry: false });
  const points = query.data?.points ?? [];
  const values = points.flatMap((point) => typeof point[metric] === "number" ? [point[metric]] : []);
  const unit = metric === "temp" ? "°C" : "%";
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><Button variant="ghost" className="mt-3 w-full justify-between border-t border-border rounded-none" aria-label={`${name} előzmények`}><span className="text-xs">Előzmények</span><History size={16} /></Button></DialogTrigger>
    <DialogContent className="smart-home history-dialog max-h-[90dvh] overflow-y-auto">
      <DialogHeader><DialogTitle className="pr-6">{name}</DialogTitle><DialogDescription>Mérési előzmények · Xiaomi</DialogDescription></DialogHeader>
      <div className="grid grid-cols-2 gap-2">{[1, 7].map((period) => <Button key={period} variant={days === period ? "default" : "outline"} aria-pressed={days === period} onClick={() => setDays(period)}>{period === 1 ? "24 óra" : "7 nap"}</Button>)}</div>
      <div className="grid grid-cols-2 gap-2"><Button variant={metric === "temp" ? "secondary" : "ghost"} aria-pressed={metric === "temp"} onClick={() => setMetric("temp")}><Thermometer size={16} />Hőmérséklet</Button><Button variant={metric === "hum" ? "secondary" : "ghost"} aria-pressed={metric === "hum"} onClick={() => setMetric("hum")}><Droplets size={16} />Pára</Button></div>
      {query.isPending ? <div className="grid h-64 place-items-center" role="status"><LoaderCircle className="animate-spin" aria-label="Mérések betöltése" /></div> : query.isError || query.data?.error ? <p className="py-8 text-sm text-destructive" role="alert">{query.data?.error || "Nem sikerült lekérni az előzményeket."}</p> : values.length === 0 ? <p className="py-12 text-center text-sm text-muted-foreground">{query.data?.demo ? "A mintaeszközhöz nincs mérési előzmény." : "A Xiaomi ehhez az időszakhoz nem adott vissza mérést."}</p> : <>
        <div className="grid grid-cols-3 gap-2 border-y border-border py-4">{[["Minimum", Math.min(...values)], ["Átlag", values.reduce((a, b) => a + b, 0) / values.length], ["Maximum", Math.max(...values)]].map(([label, value]) => <div key={label}><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-lg font-semibold tabular-nums">{Number(value).toLocaleString("hu-HU", { maximumFractionDigits: 1 })}<span className="ml-1 text-xs">{unit}</span></p></div>)}</div>
        <div className="h-64 min-w-0" aria-label={`${name} ${metric === "temp" ? "hőmérséklet" : "páratartalom"} grafikon`}>
          <ResponsiveContainer width="100%" height="100%"><LineChart data={points} margin={{ top: 12, right: 10, bottom: 0, left: -24 }}><CartesianGrid stroke="var(--border)" vertical={false} /><XAxis dataKey="time" type="number" domain={["dataMin", "dataMax"]} tickFormatter={(time) => new Date(time * 1000).toLocaleString("hu-HU", days === 1 ? { hour: "2-digit", minute: "2-digit" } : { month: "2-digit", day: "2-digit" })} minTickGap={36} stroke="var(--muted-foreground)" fontSize={11} /><YAxis domain={["auto", "auto"]} stroke="var(--muted-foreground)" fontSize={11} /><Tooltip contentStyle={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--foreground)" }} labelFormatter={(time) => new Date(Number(time) * 1000).toLocaleString("hu-HU")} /><Line name={metric === "temp" ? "Hőmérséklet" : "Pára"} unit={unit} dataKey={metric} stroke={metric === "temp" ? "var(--primary)" : "var(--home-water)"} strokeWidth={2} dot={values.length < 3} connectNulls={false} isAnimationActive={false} /></LineChart></ResponsiveContainer>
        </div><p className="text-xs text-muted-foreground">{values.length} mérés · A Xiaomi által visszaadott legutóbbi adatok.</p>
      </>}
    </DialogContent>
  </Dialog>;
}