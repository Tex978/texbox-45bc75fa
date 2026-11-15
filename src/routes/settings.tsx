import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Shell, Card } from "@/components/Shell";
import { getStatus, getConfig, saveConfig, getConnectionStorage } from "@/lib/nas.functions";
import { Button } from "@/components/ui/button";
import { greeQuery } from "@/components/Gree";
const sq = queryOptions({ queryKey: ["status"], queryFn: () => getStatus() });
const cq = queryOptions({ queryKey: ["config"], queryFn: () => getConfig() });
const storageQuery = queryOptions({ queryKey: ["connection-storage"], queryFn: () => getConnectionStorage() });
export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
    { title: "Kapcsolatok – NAS Vezérlő" }, { name: "description", content: "Plex, Radarr, Sonarr és qBittorrent kapcsolatok beállítása." },
    { property: "og:title", content: "Kapcsolatok – NAS Vezérlő" }, { property: "og:description", content: "Szolgáltatás-kapcsolatok beállítása." },
  ] }),
  loader: ({ context }) => Promise.all([context.queryClient.ensureQueryData(sq), context.queryClient.ensureQueryData(cq), context.queryClient.ensureQueryData(storageQuery)]),
  component: Settings,
});
const services = [
  { key: "media", name: "Filmadatok és IMDb", fields: [["TMDB_TOKEN", "TMDB API Read Access Token", ""], ["OMDB_KEY", "OMDb API kulcs · IMDb pontszámok", ""]] },
  { key: "gree", name: "Gree+ klímák", fields: [["GREE_USER", "Gree+ fiók e-mail", ""], ["GREE_PASS", "Gree+ fiók jelszó", ""], ["GREE_REGION", "Fiók régiója", "Europe"], ["GREE_UNITS", "Helyi IP-címek (fiókos belépésnél nem szükséges)", "192.168.1.60=Nappali, 192.168.1.61=Hálószoba"]] },
  { key: "blinds", name: "Redőnyök (Connector hub)", fields: [["BLINDS_IP", "Hub IP címe (otthoni hálózat)", "192.168.1.50"], ["BLINDS_KEY", "Kulcs (Connector app → Névjegy, 5 koppintás)", ""], ["BLINDS_NAMES", "Nevek (nem kötelező)", "1=Nappali, 2=Hálószoba"]] },
  { key: "xiaomi", name: "Xiaomi (Mi Home) hőmérők", fields: [["XIAOMI_USER", "Mi fiók e-mail / telefonszám / azonosító", ""], ["XIAOMI_PASS", "Mi fiók jelszó", ""], ["XIAOMI_REGION", "Régió (de = Európa, cn, us, sg, ru, i2)", "de"]] },
  { key: "growatt", name: "Growatt napelem", fields: [["GROWATT_USER", "ShinePhone felhasználónév", ""], ["GROWATT_PASS", "ShinePhone jelszó", ""], ["GROWATT_SN", "Inverter sorozatszám (SN)", "pl. TKJ4CJ704D"], ["GROWATT_SERVER", "Szerver (általában üresen hagyható)", "https://server.growatt.com"]] },
  { key: "dsm", name: "Synology (DSM)", fields: [["DSM_URL", "Cím", "https://valami.synology.me:5001"], ["DSM_USER", "Felhasználónév", "admin"], ["DSM_PASS", "Jelszó", ""]] },
  { key: "qbit", name: "qBittorrent", fields: [["QBIT_URL", "Cím", "http://valami.synology.me:8080"], ["QBIT_USER", "Felhasználónév", "admin"], ["QBIT_PASS", "Jelszó", ""]] },
  { key: "radarr", name: "Radarr", fields: [["RADARR_URL", "Cím", "http://valami.synology.me:7878"], ["RADARR_KEY", "API kulcs", ""]] },
  { key: "sonarr", name: "Sonarr", fields: [["SONARR_URL", "Cím", "http://valami.synology.me:8989"], ["SONARR_KEY", "API kulcs", ""]] },
  { key: "plex", name: "Plex", fields: [["PLEX_URL", "Cím", "http://valami.synology.me:32400"], ["PLEX_TOKEN", "Plex token", ""]] },
] as const;
const secret = (f: string) => /PASS|KEY|TOKEN/.test(f);
function Settings() {
  const { data: status } = useSuspenseQuery(sq);
  const { data: cfg } = useSuspenseQuery(cq);
  const { data: storage } = useSuspenseQuery(storageQuery);
  const qc = useQueryClient();
  const [form, setForm] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(cfg).map(([k, v]) => [k, v === "__set__" ? "" : v])));
  const [saving, setSaving] = useState(false);
  const [greeStatus, setGreeStatus] = useState("");
  const [saveError, setSaveError] = useState("");
  const save = async () => {
    setSaving(true);
    setSaveError("");
    try {
      await saveConfig({ data: form }); await qc.invalidateQueries();
      if (form["GREE_USER"] || form["GREE_UNITS"]) {
        const result = await qc.fetchQuery(greeQuery);
        setGreeStatus(result.error || (result.units.length ? `${result.units.length} klíma · ${result.units.filter((unit) => unit.online).length} elérhető` : "Nem találtunk klímát a fiókban."));
      }
    } catch (error) { setSaveError(error instanceof Error ? error.message : "Nem sikerült menteni a beállításokat."); }
    finally { setSaving(false); }
  };
  return (
    <Shell>
      <h1 className="mb-2 font-display text-3xl font-bold">Kapcsolatok</h1>
      <p className="mb-6 text-sm text-muted-foreground">{storage.shared ? storage.saved ? "Beállítások a Synologyra mentve · minden eszközön közösek" : "A Synologyn még nincsenek mentett beállítások" : "Csak ebben a böngészőben mentett beállítások · nem közösek a telefonnal"}</p>
      <div className="grid gap-4 md:grid-cols-2">{services.map((s) => {
        const st = s.key === "gree" || s.key === "media" ? undefined : status[s.key];
        return (
          <Card key={s.key} title={s.name}>
            <div className="space-y-3">{s.fields.map(([f, label, ph]) => (
              <label key={f} className="block">
                <span className="mb-1 block text-xs text-muted-foreground">{label}{secret(f) && cfg[f] === "__set__" && " · elmentve"}</span>
                {f === "GREE_REGION" ? <select value={form[f] || "Europe"} onChange={(e) => setForm({ ...form, [f]: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  {["Europe", "China Mainland", "East South Asia", "North American", "South American", "India", "Middle East", "Australia", "Russia"].map((region) => <option key={region} value={region}>{region === "Europe" ? "Európa" : region}</option>)}
                </select> : <input type={secret(f) ? "password" : "text"} value={form[f] || ""} placeholder={secret(f) && cfg[f] === "__set__" ? "••••••• (változatlan)" : ph}
                  onChange={(e) => setForm({ ...form, [f]: e.target.value })} autoComplete="off"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />}
              </label>))}</div>
            <div className={`mt-3 font-mono text-xs ${st === "ok" ? "text-primary" : st === "nincs beállítva" ? "text-muted-foreground" : "text-destructive"}`}>
              {s.key === "media" ? (cfg["TMDB_TOKEN"] ? "TMDB elmentve" : "TMDB nincs csatlakoztatva") + " · " + (cfg["OMDB_KEY"] ? "OMDb elmentve" : "OMDb nincs csatlakoztatva") : s.key === "gree" ? greeStatus : `● ${st === "ok" ? "Elérhető" : st}`}</div>
          </Card>);
      })}</div>
      <Button onClick={save} disabled={saving} className="mt-6">
        {saving ? "Mentés és tesztelés…" : "Mentés és tesztelés"}</Button>
      {saveError && <p role="alert" className="mt-3 text-sm text-destructive">{saveError}</p>}
    </Shell>
  );
}
