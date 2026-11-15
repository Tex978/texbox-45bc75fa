import { createFileRoute } from "@tanstack/react-router";
import { Shell, Card, Bar } from "@/components/Shell";
import { volumes, streams, recent } from "@/lib/mock";
export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "Áttekintő – NAS Vezérlő" }, { name: "description", content: "Tárhely, Plex aktivitás és friss médiák egy helyen." },
    { property: "og:title", content: "Áttekintő – NAS Vezérlő" }, { property: "og:description", content: "Tárhely, Plex aktivitás és friss médiák egy helyen." },
  ] }),
  component: Index,
});
function Index() {
  return (
    <Shell>
      <h1 className="mb-6 font-display text-3xl font-bold">Áttekintő</h1>
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Tárhely">
          <div className="space-y-4">{volumes.map((v) => (
            <div key={v.name}><div className="mb-1 flex justify-between text-sm"><span>{v.name}</span>
              <span className="font-mono text-muted-foreground">{v.used} / {v.total} TB · {(v.total - v.used).toFixed(1)} TB szabad</span></div>
              <Bar value={(v.used / v.total) * 100} /></div>))}</div>
        </Card>
        <Card title={`Most nézik · ${streams.length} stream`}>
          <div className="space-y-4">{streams.map((s) => (
            <div key={s.user}><div className="flex justify-between text-sm"><span className="font-medium">{s.title}</span><span className="font-mono text-xs text-primary">{s.mode}</span></div>
              <div className="mb-1 text-xs text-muted-foreground">{s.user} · {s.device} · {s.quality}</div><Bar value={s.progress} /></div>))}</div>
        </Card>
        <Card title="Legutóbb hozzáadva" className="md:col-span-2">
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">{recent.map((r) => (
            <div key={r.title}>
              <div className="flex aspect-[2/3] items-end rounded-lg p-2 text-sm font-bold" style={{ background: `linear-gradient(160deg, oklch(0.45 0.12 ${r.hue}), oklch(0.2 0.04 ${r.hue}))` }}>{r.title}</div>
              <div className="mt-1 text-xs text-muted-foreground">{r.type} · {r.year}</div></div>))}</div>
        </Card>
      </div>
    </Shell>
  );
}
