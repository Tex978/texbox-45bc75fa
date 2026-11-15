import { ArrowDownLeft, ArrowUpRight, BatteryCharging, BatteryFull, House, PlugZap, Sun, Zap, type LucideIcon } from "lucide-react";
import type { getSolar } from "@/lib/nas.functions";

type Solar = Awaited<ReturnType<typeof getSolar>>;
const f = (n: number, d = 1) => n.toLocaleString("hu-HU", { maximumFractionDigits: d });
const power = (w: number) => `${f(w / 1000, 2)} kW`;

function FlowNode({ icon: Icon, label, value, detail, role, active }: { icon: LucideIcon; label: string; value: string; detail?: string; role: string; active?: boolean }) {
  return <div className={`energy-node energy-${role} ${active ? "energy-active" : ""}`}>
    <span className="energy-node-icon"><Icon size={24} strokeWidth={1.6} /></span>
    <span className="text-xs text-muted-foreground">{label}</span>
    <strong className="text-xl font-semibold tabular-nums">{value}</strong>
    <span className="min-h-4 text-xs text-muted-foreground">{detail}</span>
  </div>;
}

export function SmartEnergy({ data }: { data: Solar }) {
  const flow = data.flow;
  return <section className="smart-energy">
    <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3"><span className="smart-icon energy-heading-icon"><Sun size={22} /></span><div><h2 className="text-lg font-semibold">Energia</h2><p className="text-xs text-muted-foreground">Growatt · {data.plants.map((p) => p.name).join(", ") || "Napelem"}</p></div></div>
      {!data.error && <span className="inline-flex items-center gap-2 text-xs text-muted-foreground"><span className="status-dot bg-home-success" />{data.demo ? "Mintaadatok" : "Frissítés 15 percenként"}</span>}
    </header>
    {data.error ? <p className="break-words text-sm text-destructive">{data.error}</p> : <>
      <div className="energy-layout">
        <div className="energy-flow" aria-label="Energiaáramlás">
          <FlowNode icon={Sun} label="Napelem" value={power(flow?.pv ?? data.currentW)} detail="Termelés" role="solar" active={(flow?.pv ?? data.currentW) > 0} />
          <div className={`energy-line energy-line-top ${flow && flow.pv > 0 ? "flowing" : ""}`}><ArrowDownLeft size={16} /></div>
          <FlowNode icon={flow && flow.charge > 0 ? BatteryCharging : BatteryFull} label="Akkumulátor" value={flow ? `${flow.soc}%` : "–"} detail={flow ? flow.charge > 0 ? `${power(flow.charge)} · töltés` : flow.discharge > 0 ? `${power(flow.discharge)} · merítés` : "Nyugalomban" : "Nincs adat"} role="battery" active={!!flow && (flow.charge > 0 || flow.discharge > 0)} />
          <div className={`energy-line energy-line-left ${flow && (flow.charge > 0 || flow.discharge > 0) ? "flowing" : ""}`}><span>{flow && flow.charge > 0 ? "←" : "→"}</span></div>
          <div className="energy-center"><House size={31} strokeWidth={1.5} /><span>Otthon</span></div>
          <div className={`energy-line energy-line-right ${flow && (flow.toGrid > 0 || flow.fromGrid > 0) ? "flowing" : ""}`}>{flow && flow.fromGrid > 0 ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}</div>
          <FlowNode icon={PlugZap} label="Hálózat" value={flow ? power(flow.toGrid > 0 ? flow.toGrid : flow.fromGrid) : "–"} detail={flow ? flow.toGrid > 0 ? "Betáplálás" : flow.fromGrid > 0 ? "Vételezés" : "Nincs forgalom" : "Nincs adat"} role="grid" active={!!flow && (flow.toGrid > 0 || flow.fromGrid > 0)} />
          <div className={`energy-line energy-line-bottom ${flow && flow.load > 0 ? "flowing" : ""}`}><ArrowDownLeft size={16} /></div>
          <FlowNode icon={Zap} label="Fogyasztás" value={flow ? power(flow.load) : "–"} detail="Jelenlegi felhasználás" role="load" active={!!flow && flow.load > 0} />
        </div>
        <div className="energy-totals">
          <div><span className="text-xs text-muted-foreground">Jelenlegi termelés</span><p className="mt-2 text-4xl font-semibold tabular-nums text-home-energy">{data.currentW >= 1000 ? f(data.currentW / 1000, 2) : f(data.currentW, 0)}<span className="ml-2 text-base font-normal text-muted-foreground">{data.currentW >= 1000 ? "kW" : "W"}</span></p></div>
          <div className="grid grid-cols-2 gap-4 border-t border-border pt-5"><div><p className="text-xs text-muted-foreground">Mai termelés</p><p className="mt-1 text-xl font-semibold tabular-nums">{f(data.todayKwh)} <span className="text-xs font-normal text-muted-foreground">kWh</span></p></div><div><p className="text-xs text-muted-foreground">Összes termelés</p><p className="mt-1 text-xl font-semibold tabular-nums">{f(data.totalKwh, 0)} <span className="text-xs font-normal text-muted-foreground">kWh</span></p></div></div>
          {data.plants.map((p) => <div key={p.name} className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground"><span>{p.name}</span><span>{power(p.currentW)} · ma {f(p.todayKwh)} kWh</span>{p.online && <span className="w-full">{p.online}</span>}</div>)}
        </div>
      </div>
      {!data.demo && <details className="smart-debug"><summary>Nyers adatok (hibakereséshez)</summary><pre>{data.raw}{"\n\n"}{data.plants.map((p) => p.raw).join("\n\n")}</pre></details>}
    </>}
  </section>;
}