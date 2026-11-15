import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Shell, Card } from "@/components/Shell";
export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [
    { title: "Beállítások – NAS Vezérlő" }, { name: "description", content: "Plex, Radarr, Sonarr és qBittorrent kapcsolatok beállítása." },
    { property: "og:title", content: "Beállítások – NAS Vezérlő" }, { property: "og:description", content: "Szolgáltatás-kapcsolatok beállítása." },
  ] }),
  component: Settings,
});
const services = [
  { key: "qbit", name: "qBittorrent", fields: ["URL", "Felhasználónév", "Jelszó"] },
  { key: "radarr", name: "Radarr", fields: ["URL", "API kulcs"] },
  { key: "sonarr", name: "Sonarr", fields: ["URL", "API kulcs"] },
  { key: "plex", name: "Plex", fields: ["URL", "Plex Token"] },
];
function Settings() {
  const [cfg, setCfg] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<Record<string, "ok" | "fail">>({});
  useEffect(() => { setCfg(JSON.parse(localStorage.getItem("nas-cfg") || "{}")); }, []);
  const set = (k: string, v: string) => { const n = { ...cfg, [k]: v }; setCfg(n); localStorage.setItem("nas-cfg", JSON.stringify(n)); };
  const test = async (key: string) => {
    const url = cfg[`${key}.URL`];
    try { if (!url) throw 0; await fetch(url, { mode: "no-cors" }); setStatus({ ...status, [key]: "ok" }); }
    catch { setStatus({ ...status, [key]: "fail" }); }
  };
  return (
    <Shell>
      <h1 className="mb-2 font-display text-3xl font-bold">Beállítások</h1>
      <p className="mb-6 text-sm text-muted-foreground">Az adatok csak ebben a böngészőben tárolódnak. Pl. URL: http://192.168.1.10:7878</p>
      <div className="grid gap-4 md:grid-cols-2">{services.map((s) => (
        <Card key={s.key} title={s.name}>
          <div className="space-y-2">{s.fields.map((f) => (
            <input key={f} type={f === "Jelszó" ? "password" : "text"} placeholder={f} value={cfg[`${s.key}.${f}`] || ""}
              onChange={(e) => set(`${s.key}.${f}`, e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />))}</div>
          <div className="mt-3 flex items-center gap-3">
            <button onClick={() => test(s.key)} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">Kapcsolat teszt</button>
            {status[s.key] && <span className={`font-mono text-xs ${status[s.key] === "ok" ? "text-primary" : "text-destructive"}`}>● {status[s.key] === "ok" ? "Elérhető" : "Nem elérhető"}</span>}
          </div>
        </Card>))}</div>
    </Shell>
  );
}
