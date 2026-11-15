import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { Shell, Card, Bar } from "@/components/Shell";
import { Button } from "@/components/ui/button";
import { Pause, Play, Trash2 } from "lucide-react";
import { getTorrents, torrentAction } from "@/lib/nas.functions";
const q = queryOptions({ queryKey: ["torrents"], queryFn: () => getTorrents(), refetchInterval: 3000 });
export const Route = createFileRoute("/downloads")({
  head: () => ({ meta: [
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
    { title: "Letöltések – NAS Vezérlő" }, { name: "description", content: "qBittorrent letöltések kezelése egy helyen." },
    { property: "og:title", content: "Letöltések – NAS Vezérlő" }, { property: "og:description", content: "qBittorrent letöltések kezelése." },
  ] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(q),
  component: Downloads,
});
function Downloads() {
  const { data } = useSuspenseQuery(q);
  const qc = useQueryClient();
  const act = async (hash: string, action: "pause" | "resume" | "delete") => {
    if (data.demo) {
      qc.setQueryData(q.queryKey, { ...data, list: action === "delete" ? data.list.filter((t) => t.hash !== hash) : data.list.map((t) => t.hash === hash ? { ...t, paused: action === "pause" } : t) });
      return;
    }
    await torrentAction({ data: { hash, action } }); qc.invalidateQueries({ queryKey: q.queryKey });
  };
  return (
    <Shell demo={data.demo}>
      <h1 className="mb-6 font-display text-3xl font-bold">Letöltések</h1>
      <div className="space-y-3">{data.list.map((t) => (
        <Card key={t.hash} className="app-download">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="break-all font-mono text-sm">{t.name}</div>
            <div className="flex gap-2">
              <Button variant="outline" size="icon" title={t.paused ? "Folytatás" : "Szünet"} aria-label={t.paused ? "Folytatás" : "Szünet"} onClick={() => act(t.hash, t.paused ? "resume" : "pause")}>{t.paused ? <Play /> : <Pause />}</Button>
              <Button variant="ghost" size="icon" className="text-destructive" title="Törlés" aria-label="Törlés" onClick={() => confirm("Törlöd a listából? (A fájlok maradnak)") && act(t.hash, "delete")}><Trash2 /></Button>
            </div>
          </div>
          <Bar value={t.progress} />
          <div className="mt-2 flex flex-wrap gap-4 font-mono text-xs text-muted-foreground">
            <span>{t.progress}% · {t.size}</span><span>↓ {t.paused ? 0 : t.down} MB/s</span><span>↑ {t.paused ? 0 : t.up} MB/s</span><span>{t.paused ? "Szüneteltetve" : t.eta}</span>
          </div>
        </Card>))}
        {data.list.length === 0 && <p className="text-muted-foreground">Nincs letöltés.</p>}
      </div>
    </Shell>
  );
}
