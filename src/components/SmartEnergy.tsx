import {
  BatteryCharging,
  BatteryFull,
  Clock,
  House,
  PlugZap,
  Sun,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { EnergyHistory } from "@/components/EnergyHistory";
import type { getSolar } from "@/lib/nas.functions";

type Solar = Awaited<ReturnType<typeof getSolar>>;
const f = (n: number, d = 1) => n.toLocaleString("hu-HU", { maximumFractionDigits: d });
const power = (w: number | null) =>
  w === null ? "Nincs adat" : w >= 1000 ? `${f(w / 1000, 2)} kW` : `${f(w, 0)} W`;

/** Self-sufficiency from current real readings only: share of the load not drawn from the grid. */
export function selfSufficiency(load: number | null, fromGrid: number | null) {
  return load !== null && fromGrid !== null && load > 0
    ? Math.max(0, Math.min(100, Math.round((1 - fromGrid / load) * 100)))
    : null;
}

function Node({
  icon: Icon,
  label,
  value,
  detail,
  tone,
  active,
  className,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
  tone: string;
  active: boolean;
  className: string;
}) {
  return (
    <div className={`en-node en-${tone} ${active ? "en-node-on" : ""} ${className}`}>
      <span className="en-node-icon">
        <Icon size={24} strokeWidth={1.7} />
      </span>
      <span className="en-node-label">{label}</span>
      <strong>{value}</strong>
      <span className="en-node-detail">{detail}</span>
    </div>
  );
}
function Ring({ value, label, tone }: { value: number | null; label: string; tone: string }) {
  const r = 34,
    c = 2 * Math.PI * r;
  return (
    <div className={`en-ring en-${tone}`}>
      <svg viewBox="0 0 80 80" aria-hidden>
        <circle cx="40" cy="40" r={r} className="en-ring-bg" />
        <circle
          cx="40"
          cy="40"
          r={r}
          className="en-ring-fg"
          strokeDasharray={c}
          strokeDashoffset={value == null ? c : c * (1 - value / 100)}
        />
      </svg>
      <div>
        <strong>{value == null ? "–" : `${value}%`}</strong>
        <span>{label}</span>
      </div>
    </div>
  );
}

export function SmartEnergy({ data }: { data: Solar }) {
  const flow = data.flow;
  const pv = data.currentW;
  const flowPv = flow?.pv ?? null;
  const flowPlant = data.plants.find((p) => p.flow)?.name;
  const grid =
    flow && flow.toGrid !== null && flow.fromGrid !== null
      ? flow.toGrid > 0
        ? { w: flow.toGrid, t: "Visszatáplálás" }
        : flow.fromGrid > 0
          ? { w: flow.fromGrid, t: "Vételezés" }
          : { w: 0, t: "Nincs forgalom" }
      : null;
  const batt =
    flow && flow.charge !== null && flow.discharge !== null
      ? flow.charge > 0
        ? { w: flow.charge, t: "Töltés" }
        : flow.discharge > 0
          ? { w: flow.discharge, t: "Merítés" }
          : { w: 0, t: "Nyugalomban" }
      : null;
  const self = flow ? selfSufficiency(flow.load, flow.fromGrid) : null;
  const bars = [
    { label: "Termelés", w: flow?.pv, tone: "solar" },
    { label: "Fogyasztás", w: flow?.load, tone: "load" },
    { label: grid?.t ?? "Hálózat", w: grid?.w, tone: "grid" },
    { label: `Akku · ${batt?.t.toLowerCase() ?? "nincs adat"}`, w: batt?.w, tone: "battery" },
  ].filter((b): b is { label: string; w: number; tone: string } => typeof b.w === "number");
  const max = Math.max(1, ...bars.map((b) => b.w));
  const plants = data.plants.map((p) => p.name).join(", ") || "Napelem";
  if (data.error)
    return (
      <section className="en">
        <div className="en-error">
          <PlugZap size={22} />
          <div>
            <strong>A Growatt most nem elérhető</strong>
            <p>{data.error}</p>
          </div>
        </div>
      </section>
    );
  return (
    <section className="en" aria-label="Energiaközpont">
      <div className="en-top">
        <div className="en-hero">
          <div className="en-hero-head">
            <span className="en-badge">
              <Sun size={14} />
              Growatt · {plants}
            </span>
            <span className="en-live">
              <span className={`hd-dot ${pv > 0 ? "hd-dot-on" : ""}`} />
              {data.demo ? "Mintaadatok" : "Frissítés 15 percenként"}
            </span>
          </div>
          <span className="en-hero-label">Jelenlegi termelés</span>
          <strong className="en-hero-value">
            {pv >= 1000 ? f(pv / 1000, 2) : f(pv, 0)}
            <small>{pv >= 1000 ? "kW" : "W"}</small>
          </strong>
          <div className="en-hero-stats">
            <div>
              <span>Mai termelés</span>
              <strong>
                {f(data.todayKwh)} <small>kWh</small>
              </strong>
            </div>
            <div>
              <span>Összes termelés</span>
              <strong>
                {f(data.totalKwh, 0)} <small>kWh</small>
              </strong>
            </div>
            {flow && (
              <div>
                <span>Fogyasztás most</span>
                <strong>{power(flow.load)}</strong>
              </div>
            )}
          </div>
        </div>
        <div className="en-rings">
          <Ring value={self} label="Önellátás most" tone="solar" />
          <Ring value={flow ? flow.soc : null} label="Akkumulátor" tone="battery" />
        </div>
      </div>

      <h2 className="en-title">Energiaáramlás{flowPlant ? ` · ${flowPlant}` : ""}</h2>
      <div className="en-flow" aria-label="Energiaáramlás">
        <svg className="en-lines" viewBox="0 0 300 300" preserveAspectRatio="none" aria-hidden>
          <path d="M150 62 V128" className={`en-path en-solar ${pv > 0 ? "en-path-on" : ""}`} />
          <path
            d="M150 172 V238"
            className={`en-path en-load ${(flow?.load ?? 0) > 0 ? "en-path-on" : ""}`}
          />
          <path
            d={(flow?.charge ?? 0) > 0 ? "M128 150 H62" : "M62 150 H128"}
            className={`en-path en-battery ${batt && batt.w > 0 ? "en-path-on" : ""}`}
          />
          <path
            d={(flow?.toGrid ?? 0) > 0 ? "M172 150 H238" : "M238 150 H172"}
            className={`en-path en-grid ${grid && grid.w > 0 ? "en-path-on" : ""}`}
          />
        </svg>
        <Node
          className="en-pos-top"
          icon={Sun}
          label="Napelem"
          value={power(flowPv)}
          detail="Termelés"
          tone="solar"
          active={(flowPv ?? 0) > 0}
        />
        <Node
          className="en-pos-left"
          icon={(flow?.charge ?? 0) > 0 ? BatteryCharging : BatteryFull}
          label="Akkumulátor"
          value={flow?.soc != null ? `${flow.soc}%` : "Nincs adat"}
          detail={
            batt ? (batt.w ? `${power(batt.w)} · ${batt.t.toLowerCase()}` : batt.t) : "Nincs adat"
          }
          tone="battery"
          active={!!batt?.w}
        />
        <div className="en-home">
          <House size={30} strokeWidth={1.6} />
          <span>Otthon</span>
        </div>
        <Node
          className="en-pos-right"
          icon={PlugZap}
          label="Hálózat"
          value={grid ? power(grid.w) : "–"}
          detail={grid?.t ?? "Nincs adat"}
          tone="grid"
          active={!!grid?.w}
        />
        <Node
          className="en-pos-bottom"
          icon={Zap}
          label="Fogyasztás"
          value={flow ? power(flow.load) : "–"}
          detail="Jelenlegi felhasználás"
          tone="load"
          active={!!(flow?.load ?? 0) > 0}
        />
      </div>

      <h2 className="en-title">Előzmények</h2>
      <EnergyHistory />

      <div className="en-bottom">
        {bars.length > 0 && (
          <div className="en-card">
            <h3>Pillanatnyi teljesítmények</h3>
            <ul className="en-bars">
              {bars.map((b) => (
                <li key={b.label} className={`en-${b.tone}`}>
                  <span>{b.label}</span>
                  <span className="en-bar">
                    <i style={{ width: `${(b.w / max) * 100}%` }} />
                  </span>
                  <strong>{power(b.w)}</strong>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="en-card">
          <h3>Erőművek</h3>
          <ul className="en-plants">
            {data.plants.map((p) => (
              <li key={p.name}>
                <span className="en-node-icon en-solar">
                  <Sun size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <strong>{p.name}</strong>
                  <span>{p.online || "Állapot nem ismert"}</span>
                </div>
                <div className="text-right">
                  <strong>{power(p.currentW)}</strong>
                  <span>ma {f(p.todayKwh)} kWh</span>
                </div>
              </li>
            ))}
          </ul>
          <p className="en-note">
            <Clock size={13} />A pillanatnyi értékek 15 percenként frissülnek.
          </p>
        </div>
      </div>
      {!data.demo && (
        <details className="smart-debug">
          <summary>Nyers adatok (hibakereséshez)</summary>
          <pre>
            {data.raw}
            {"\n\n"}
            {data.plants.map((p) => p.raw).join("\n\n")}
          </pre>
        </details>
      )}
    </section>
  );
}
