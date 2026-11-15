import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Shell, Card } from "@/components/Shell";
import { getSolar } from "@/lib/nas.functions";
const q = queryOptions({ queryKey: ["solar"], queryFn: () => getSolar(), refetchInterval: 60000 });
export const Route = createFileRoute("/home")({
  head: () => ({ meta: [
    { title: "Okosotthon – NAS Vezérlő" }, { name: "description", content: "Napelem termelés és okosotthon eszközök egy helyen." },
    { property: "og:title", content: "Okosotthon – NAS Vezérlő" }, { property: "og:description", content: "Napelem termelés és okosotthon eszközök." },
  ] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(q),
  component: Home,
});
function Stat({ value, unit, label }: { value: string; unit: string; label: string }) {
  return <div><div className="font-mono text-4xl font-bold text-primary">{value}<span className="ml-1 text-base text-muted-foreground">{unit}</span></div>
    <div className="text-sm text-muted-foreground">{label}</div></div>;
}
function Home() {
  const { data } = useSuspenseQuery(q);
  const f = (n: number, d = 1) => n.toLocaleString("hu-HU", { maximumFractionDigits: d });
  return (
    <Shell demo={data.demo}>
      <h1 className="mb-6 font-display text-3xl font-bold">Okosotthon</h1>
      <Card title="Growatt napelem">
        {data.error ? <p className="font-mono text-sm text-destructive">● {data.error}</p> : <>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            <Stat value={data.currentW >= 1000 ? f(data.currentW / 1000, 2) : f(data.currentW, 0)} unit={data.currentW >= 1000 ? "kW" : "W"} label="Jelenlegi termelés" />
            <Stat value={f(data.todayKwh)} unit="kWh" label="Mai termelés" />
            <Stat value={f(data.totalKwh, 0)} unit="kWh" label="Összes termelés" />
          </div>
          {data.plants.length > 1 && <div className="mt-6 space-y-1 border-t border-border pt-4 text-sm">{data.plants.map((p) => (
            <div key={p.name} className="flex justify-between gap-2"><span>{p.name}</span><span className="font-mono text-muted-foreground">{p.current} · ma {p.today}</span></div>))}</div>}
        </>}
      </Card>
      <p className="mt-6 text-sm text-muted-foreground">További eszközök (Samsung TV, Tuya, Bosch, Tapo, Xiaomi, redőnyök) bekötése folyamatban.</p>
    </Shell>
  );
}
