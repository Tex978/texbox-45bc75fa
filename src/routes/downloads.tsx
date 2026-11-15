import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Shell, Card, Bar } from "@/components/Shell";
import { torrents as initial } from "@/lib/mock";
export const Route = createFileRoute("/downloads")({
  head: () => ({ meta: [
    { title: "Letöltések – NAS Vezérlő" }, { name: "description", content: "qBittorrent letöltések kezelése egy helyen." },
    { property: "og:title", content: "Letöltések – NAS Vezérlő" }, { property: "og:description", content: "qBittorrent letöltések kezelése." },
  ] }),
  component: Downloads,
});
function Downloads() {
  const [list, setList] = useState(initial);
  const btn = "rounded-md border border-border px-3 py-1 text-xs hover:bg-secondary";
  return (
    <Shell>
      <h1 className="mb-6 font-display text-3xl font-bold">Aktív letöltések</h1>
      <div className="space-y-3">{list.map((t) => (
        <Card key={t.id}>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="break-all font-mono text-sm">{t.name}</div>
            <div className="flex gap-2">
              <button className={btn} onClick={() => setList(list.map((x) => x.id === t.id ? { ...x, paused: !x.paused } : x))}>{t.paused ? "Folytatás" : "Szünet"}</button>
              <button className={`${btn} text-destructive`} onClick={() => setList(list.filter((x) => x.id !== t.id))}>Törlés</button>
            </div>
          </div>
          <Bar value={t.progress} />
          <div className="mt-2 flex flex-wrap gap-4 font-mono text-xs text-muted-foreground">
            <span>{t.progress}% · {t.size}</span><span>↓ {t.paused ? 0 : t.down} MB/s</span><span>↑ {t.paused ? 0 : t.up} MB/s</span><span>{t.paused ? "Szüneteltetve" : t.eta}</span>
          </div>
        </Card>))}
        {list.length === 0 && <p className="text-muted-foreground">Nincs aktív letöltés.</p>}
      </div>
    </Shell>
  );
}
