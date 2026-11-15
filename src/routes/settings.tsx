import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { Shell, Card } from "@/components/Shell";
import { getStatus } from "@/lib/nas.functions";
const q = queryOptions({ queryKey: ["status"], queryFn: () => getStatus() });
export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [
    { title: "Kapcsolatok – NAS Vezérlő" }, { name: "description", content: "Plex, Radarr, Sonarr és qBittorrent kapcsolatok állapota." },
    { property: "og:title", content: "Kapcsolatok – NAS Vezérlő" }, { property: "og:description", content: "Szolgáltatás-kapcsolatok állapota." },
  ] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(q),
  component: Settings,
});
const names = { qbit: ["qBittorrent", "QBIT_URL, QBIT_USER, QBIT_PASS"], radarr: ["Radarr", "RADARR_URL, RADARR_KEY"], sonarr: ["Sonarr", "SONARR_URL, SONARR_KEY"], plex: ["Plex", "PLEX_URL, PLEX_TOKEN"] } as const;
function Settings() {
  const { data } = useSuspenseQuery(q); const qc = useQueryClient();
  return (
    <Shell>
      <h1 className="mb-2 font-display text-3xl font-bold">Kapcsolatok</h1>
      <p className="mb-6 text-sm text-muted-foreground">A címeket és kulcsokat a Synology docker-compose.yml fájljában adod meg. Módosítás után indítsd újra a konténert.</p>
      <div className="grid gap-4 md:grid-cols-2">{(Object.keys(names) as (keyof typeof names)[]).map((k) => (
        <Card key={k} title={names[k][0]}>
          <div className={`font-mono text-sm ${data[k] === "ok" ? "text-primary" : data[k] === "nincs beállítva" ? "text-muted-foreground" : "text-destructive"}`}>
            ● {data[k] === "ok" ? "Elérhető" : data[k]}</div>
          <div className="mt-2 font-mono text-xs text-muted-foreground">{names[k][1]}</div>
        </Card>))}</div>
      <button onClick={() => qc.invalidateQueries({ queryKey: q.queryKey })} className="mt-6 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Újratesztelés</button>
    </Shell>
  );
}
