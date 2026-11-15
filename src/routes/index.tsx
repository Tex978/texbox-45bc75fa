import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Shell, Card, Bar, Poster } from "@/components/Shell";
import { getOverview } from "@/lib/nas.functions";
const q = queryOptions({ queryKey: ["overview"], queryFn: () => getOverview(), refetchInterval: 10000 });
export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "Áttekintő – NAS Vezérlő" }, { name: "description", content: "Tárhely, Plex aktivitás és friss médiák egy helyen." },
    { property: "og:title", content: "Áttekintő – NAS Vezérlő" }, { property: "og:description", content: "Tárhely, Plex aktivitás és friss médiák egy helyen." },
  ] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(q),
  component: Index,
});
function Index() {
  const { data } = useSuspenseQuery(q);
  return (
    <Shell demo={data.demo}>
      <h1 className="mb-6 font-display text-3xl font-bold">Áttekintő</h1>
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Tárhely">
          <div className="space-y-4">{data.volumes.map((v) => (
            <div key={v.name}><div className="mb-1 flex justify-between gap-2 text-sm"><span>{v.name}</span>
              <span className="font-mono text-muted-foreground">{v.used} / {v.total} TB · {(v.total - v.used).toFixed(1)} TB szabad</span></div>
              <Bar value={(v.used / v.total) * 100} /></div>))}
            {data.volumes.length === 0 && <p className="text-sm text-muted-foreground">Nincs adat (Radarr szükséges).</p>}</div>
        </Card>
        <Card title={`Most nézik · ${data.streams.length} stream`}>
          <div className="space-y-4">{data.streams.map((s, i) => (
            <div key={i}><div className="flex justify-between gap-2 text-sm"><span className="font-medium">{s.title}</span><span className="font-mono text-xs text-primary">{s.mode}</span></div>
              <div className="mb-1 text-xs text-muted-foreground">{s.user} · {s.device} · {s.quality}</div><Bar value={s.progress} /></div>))}
            {data.streams.length === 0 && <p className="text-sm text-muted-foreground">Most senki nem néz semmit.</p>}</div>
        </Card>
        <Card title="Nemrég nézett" className="md:col-span-2">
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">{data.watched.map((r, i) => (
            <div key={i}><Poster src={r.thumb ? `/api/plex-thumb?path=${encodeURIComponent(r.thumb)}` : ""} title={r.title} hue={r.hue} />
              <div className="mt-1 truncate text-xs text-muted-foreground">{r.title}{r.who && ` · ${r.who}`}</div></div>))}
            {data.watched.length === 0 && <p className="col-span-full text-sm text-muted-foreground">Nincs megtekintési előzmény (Plex szükséges).</p>}</div>
        </Card>
        <Card title="Legutóbb hozzáadva" className="md:col-span-2">
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">{data.recent.map((r, i) => (
            <div key={i}>
              {r.thumb ? <img src={`/api/plex-thumb?path=${encodeURIComponent(r.thumb)}`} alt={r.title} className="aspect-[2/3] w-full rounded-lg object-cover" loading="lazy" />
                : <div className="flex aspect-[2/3] items-end rounded-lg p-2 text-sm font-bold" style={{ background: `linear-gradient(160deg, oklch(0.45 0.12 ${r.hue}), oklch(0.2 0.04 ${r.hue}))` }}>{r.title}</div>}
              <div className="mt-1 truncate text-xs text-muted-foreground">{r.title} · {r.year}</div></div>))}</div>
        </Card>
      </div>
    </Shell>
  );
}
