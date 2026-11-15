import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Car, Battery, Fuel, Gauge, Route as Road, PlugZap, RefreshCw, Cable } from "lucide-react";
import { Shell } from "@/components/Shell";
import { Button } from "@/components/ui/button";
import { getVehicles } from "@/lib/nas.functions";

const options = (brand: "vw" | "renault") => queryOptions({ queryKey: ["cars", brand], queryFn: () => getVehicles({ data: { brand } }), staleTime: 900000, refetchInterval: 900000, retry: false, refetchOnWindowFocus: false });
export const Route = createFileRoute("/cars")({
  head: () => ({ meta: [
    { title: "Autók – NAS Vezérlő" }, { name: "description", content: "Volkswagen és Renault töltöttség, üzemanyag, hatótáv és kilométeróra." },
    { property: "og:title", content: "Autók – NAS Vezérlő" }, { property: "og:description", content: "Autóid állapota egy helyen." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }),
  loader: ({ context }) => Promise.all([context.queryClient.ensureQueryData(options("vw")), context.queryClient.ensureQueryData(options("renault"))]),
  component: Cars,
});
const format = (value: number | null, unit: string) => value == null ? "–" : `${value.toLocaleString("hu-HU", { maximumFractionDigits: 1 })} ${unit}`;
const chargingNames: Record<string, string> = { charging: "Töltés folyamatban", off: "Nem tölt", ready_for_charging: "Töltésre kész", conservation: "Szintentartás", error: "Töltési hiba", discharging: "Kisütés" };
function VehicleSection({ brand, title }: { brand: "vw" | "renault"; title: string }) {
  const { data, isFetching } = useSuspenseQuery(options(brand));
  const qc = useQueryClient();
  const verify = useServerFn(getVehicles);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async () => {
    setBusy(true); setError("");
    try { const result = await verify({ data: { brand, code } }); qc.setQueryData(options(brand).queryKey, result); if (!result.verification) setCode(""); }
    catch { setError("Az ellenőrzés nem sikerült. Próbáld újra."); } finally { setBusy(false); }
  };
  return <section className="smart-section">
    <div className="flex items-center justify-between gap-4 mb-5"><div className="smart-section-heading mb-0"><span className="smart-icon"><Car size={21} /></span><div><h2>{title}</h2><p>{brand === "vw" ? "Volkswagen · elektromos" : "My Renault · dízel"}</p></div></div>
      {data.configured && <Button variant="outline" size="icon" aria-label={`${title} frissítése`} title="Frissítés" disabled={isFetching} onClick={() => qc.invalidateQueries({ queryKey: options(brand).queryKey })}><RefreshCw className={isFetching ? "animate-spin" : ""} /></Button>}</div>
    {!data.configured ? <div className="flex items-center justify-between flex-wrap gap-4 border-y border-border py-6"><span className="text-sm text-muted-foreground">Nincs csatlakoztatott fiók</span><Button variant="outline" asChild><Link to="/settings"><Cable />Fiók csatlakoztatása</Link></Button></div> : <>
      {data.error && <p role="alert" className="text-sm text-destructive mb-4">{data.error}</p>}
      {data.verification && <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="flex flex-wrap gap-3 items-end mb-5"><label className="text-sm">My Renault e-mailes ellenőrzőkód<input aria-label="My Renault ellenőrzőkód" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" className="block mt-2 rounded-md border border-input bg-card px-3 py-2" /></label><Button disabled={busy || !code}>{busy ? "Ellenőrzés…" : "Megerősítés"}</Button></form>}
      {error && <p role="alert" className="text-destructive text-sm">{error}</p>}
      <div className="grid gap-4">{data.vehicles.map((v) => <div key={v.id} className="smart-device"><div className="flex items-center justify-between gap-3 mb-6"><h3 className="font-medium">{v.name === "Renault" || v.name === "Volkswagen" ? title : v.name}</h3><span className="text-xs text-muted-foreground">…{v.id.slice(-6)}</span></div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">{[
          { label: brand === "vw" ? "Töltöttség" : "Üzemanyag", value: brand === "vw" ? format(v.battery, "%") : format(v.fuel, "l"), icon: brand === "vw" ? Battery : Fuel },
          { label: "Becsült hatótáv", value: format(v.range, "km"), icon: Road },
          { label: "Kilométeróra", value: format(v.odometer, "km"), icon: Gauge },
        ].map(({ label, value, icon: Icon }) => <div key={label}><div className="flex items-center gap-2 text-xs text-muted-foreground mb-2"><Icon size={16} />{label}</div><div className="text-2xl font-semibold tabular-nums">{value}</div></div>)}</div>
        {brand === "vw" && <div className="flex gap-2 items-center border-t border-border mt-6 pt-4 text-sm"><PlugZap size={17} className="text-primary" />{v.charging ? chargingNames[v.charging] || "Nem elérhető töltési állapot" : "Töltési állapot nem elérhető"}</div>}
        {v.error && <p className="text-sm text-muted-foreground mt-4">{v.error}</p>}
      </div>)}</div>
      {!data.error && !data.verification && data.vehicles.length === 0 && <p className="text-sm text-muted-foreground">Nem található autó a fiókban.</p>}
      {data.updatedAt && <p className="text-xs text-muted-foreground mt-4">Lekérdezve: {new Date(data.updatedAt).toLocaleString("hu-HU", { timeZone: "Europe/Budapest" })}</p>}
    </>}
  </section>;
}
function Cars() { return <Shell><h1>Autók</h1><VehicleSection brand="vw" title="Volkswagen ID.7" /><VehicleSection brand="renault" title="Renault Master" /></Shell>; }