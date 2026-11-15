import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Shell, Card } from "@/components/Shell";
import { getStatus, getConfig, saveConfig } from "@/lib/nas.functions";
const sq = queryOptions({ queryKey: ["status"], queryFn: () => getStatus() });
const cq = queryOptions({ queryKey: ["config"], queryFn: () => getConfig() });
export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [
    { title: "Kapcsolatok – NAS Vezérlő" }, { name: "description", content: "Plex, Radarr, Sonarr és qBittorrent kapcsolatok beállítása." },
    { property: "og:title", content: "Kapcsolatok – NAS Vezérlő" }, { property: "og:description", content: "Szolgáltatás-kapcsolatok beállítása." },
  ] }),
  loader: ({ context }) => Promise.all([context.queryClient.ensureQueryData(sq), context.queryClient.ensureQueryData(cq)]),
  component: Settings,
});
const services = [
  { key: "ha", name: "Home Assistant (okosotthon)", fields: [["HA_URL", "Cím", "http://valami.synology.me:8123"], ["HA_TOKEN", "Hosszú élettartamú token", ""]] },
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
  const qc = useQueryClient();
  const [form, setForm] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(cfg).map(([k, v]) => [k, v === "__set__" ? "" : v])));
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try { await saveConfig({ data: form }); await qc.invalidateQueries(); } finally { setSaving(false); }
  };
  return (
    <Shell>
      <h1 className="mb-2 font-display text-3xl font-bold">Kapcsolatok</h1>
      <p className="mb-6 text-sm text-muted-foreground">Add meg a külső címeket és kulcsokat. A titkos mezőket üresen hagyva a korábbi érték megmarad. Az adatok ebben a böngészőben, védett sütiben tárolódnak.</p>
      <div className="grid gap-4 md:grid-cols-2">{services.map((s) => {
        const st = status[s.key];
        return (
          <Card key={s.key} title={s.name}>
            <div className="space-y-3">{s.fields.map(([f, label, ph]) => (
              <label key={f} className="block">
                <span className="mb-1 block text-xs text-muted-foreground">{label}{secret(f) && cfg[f] === "__set__" && " · elmentve"}</span>
                <input type={secret(f) ? "password" : "text"} value={form[f] || ""} placeholder={secret(f) && cfg[f] === "__set__" ? "••••••• (változatlan)" : ph}
                  onChange={(e) => setForm({ ...form, [f]: e.target.value })} autoComplete="off"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
              </label>))}</div>
            <div className={`mt-3 font-mono text-xs ${st === "ok" ? "text-primary" : st === "nincs beállítva" ? "text-muted-foreground" : "text-destructive"}`}>
              ● {st === "ok" ? "Elérhető" : st}</div>
          </Card>);
      })}</div>
      <button onClick={save} disabled={saving} className="mt-6 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60">
        {saving ? "Mentés és tesztelés…" : "Mentés és tesztelés"}</button>
    </Shell>
  );
}
