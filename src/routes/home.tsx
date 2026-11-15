import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { Shell, Card } from "@/components/Shell";
import { getHome, homeAction } from "@/lib/nas.functions";
const q = queryOptions({ queryKey: ["home"], queryFn: () => getHome(), refetchInterval: 10000 });
export const Route = createFileRoute("/home")({
  head: () => ({ meta: [
    { title: "Okosotthon – NAS Vezérlő" }, { name: "description", content: "Napelem termelés, lámpák, redőnyök és eszközök egy helyen." },
    { property: "og:title", content: "Okosotthon – NAS Vezérlő" }, { property: "og:description", content: "Napelem és okosotthon eszközök egy helyen." },
  ] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(q),
  component: Home,
});
const name = (e: { entity_id: string; attributes: { friendly_name?: string | undefined } }) => e.attributes.friendly_name || e.entity_id;
const label: Record<string, string> = { on: "Be", off: "Ki", open: "Nyitva", closed: "Zárva", opening: "Nyílik", closing: "Záródik", docked: "Dokkolva", cleaning: "Takarít", playing: "Lejátszás", idle: "Tétlen" };
function Home() {
  const { data } = useSuspenseQuery(q); const qc = useQueryClient();
  const act = async (entity_id: string, service: string, optimistic?: string) => {
    if (data.demo) {
      if (optimistic) qc.setQueryData(q.queryKey, { ...data, entities: data.entities.map((e) => e.entity_id === entity_id ? { ...e, state: optimistic } : e) });
      return;
    }
    await homeAction({ data: { entity_id, service } }); setTimeout(() => qc.invalidateQueries({ queryKey: q.queryKey }), 800);
  };
  const by = (d: string) => data.entities.filter((e) => e.entity_id.startsWith(d + "."));
  const solar = by("sensor");
  const toggles = [...by("light"), ...by("switch"), ...by("fan")];
  const btn = "rounded-md border border-border px-3 py-1 text-xs hover:bg-secondary";
  return (
    <Shell demo={data.demo}>
      <h1 className="mb-6 font-display text-3xl font-bold">Okosotthon</h1>
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Napelem és energia" className="md:col-span-2">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">{solar.map((e) => (
            <div key={e.entity_id}><div className="font-mono text-3xl font-bold text-primary">{Number.isFinite(+e.state) ? (+e.state).toLocaleString("hu-HU") : e.state}
              <span className="ml-1 text-base text-muted-foreground">{e.attributes.unit_of_measurement}</span></div>
              <div className="text-xs text-muted-foreground">{name(e)}</div></div>))}
            {solar.length === 0 && <p className="text-sm text-muted-foreground">Nincs energia érzékelő.</p>}</div>
        </Card>
        <Card title="Lámpák és konnektorok">
          <div className="space-y-2">{toggles.map((e) => (
            <div key={e.entity_id} className="flex items-center justify-between gap-2">
              <span className="text-sm">{name(e)}</span>
              <button onClick={() => act(e.entity_id, "toggle", e.state === "on" ? "off" : "on")}
                className={`w-14 rounded-full px-2 py-1 text-xs font-medium ${e.state === "on" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>{label[e.state] || e.state}</button>
            </div>))}</div>
        </Card>
        <Card title="Redőnyök">
          <div className="space-y-2">{by("cover").map((e) => (
            <div key={e.entity_id} className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm">{name(e)} <span className="text-xs text-muted-foreground">· {label[e.state] || e.state}</span></span>
              <div className="flex gap-1">
                <button className={btn} onClick={() => act(e.entity_id, "open_cover", "open")}>▲ Fel</button>
                <button className={btn} onClick={() => act(e.entity_id, "stop_cover")}>■</button>
                <button className={btn} onClick={() => act(e.entity_id, "close_cover", "closed")}>▼ Le</button>
              </div></div>))}</div>
        </Card>
        <Card title="Egyéb eszközök" className="md:col-span-2">
          <div className="grid gap-2 sm:grid-cols-2">{[...by("vacuum"), ...by("media_player"), ...by("climate")].map((e) => (
            <div key={e.entity_id} className="flex items-center justify-between gap-2 rounded-lg bg-secondary px-3 py-2">
              <span className="text-sm">{name(e)}</span>
              <div className="flex items-center gap-2"><span className="font-mono text-xs text-muted-foreground">{label[e.state] || e.state}</span>
                {e.entity_id.startsWith("vacuum.") && <button className={btn} onClick={() => act(e.entity_id, e.state === "cleaning" ? "return_to_base" : "start", e.state === "cleaning" ? "docked" : "cleaning")}>{e.state === "cleaning" ? "Haza" : "Indít"}</button>}
              </div></div>))}</div>
        </Card>
      </div>
    </Shell>
  );
}
