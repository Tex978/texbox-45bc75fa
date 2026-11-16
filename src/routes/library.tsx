import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Shell, Card, Poster, PageHeader, EmptyState, meQuery } from "@/components/Shell";
import { Button } from "@/components/ui/button";
import { Trash2, X } from "lucide-react";
import { getLibrary, deleteMedia } from "@/lib/nas.functions";
const q = queryOptions({ queryKey: ["library"], queryFn: () => getLibrary() });
export const Route = createFileRoute("/library")({
  head: () => ({ meta: [
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
    { title: "Tárhely – NAS Vezérlő" }, { name: "description", content: "Melyik film és sorozat mennyi helyet foglal, és a régiek törlése." },
    { property: "og:title", content: "Tárhely – NAS Vezérlő" }, { property: "og:description", content: "Tárhelykezelés filmekhez és sorozatokhoz." },
  ] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(q),
  component: Library,
});
const gb = (b: number) => (b >= 1e12 ? `${(b / 1e12).toFixed(2)} TB` : `${(b / 1e9).toFixed(1)} GB`);
function Library() {
  const { data } = useSuspenseQuery(q); const qc = useQueryClient();
  const me = useQuery(meQuery).data;
  const canManage = me?.mode === "open" || !!me?.user?.can.downloads;
  const [message, setMessage] = useState("");
  const [type, setType] = useState("Mind"); const [sort, setSort] = useState("size");
  const [sel, setSel] = useState<string[]>([]); const [busy, setBusy] = useState(false);
  const items = useMemo(() => data.items.filter((i) => type === "Mind" || i.type === type)
    .sort((a, b) => sort === "size" ? b.size - a.size : a.added.localeCompare(b.added)), [data, type, sort]);
  const total = items.reduce((s, i) => s + i.size, 0);
  const selItems = data.items.filter((i) => sel.includes(i.type + i.id));
  const selSize = selItems.reduce((s, i) => s + i.size, 0);
  const del = async () => {
    if (busy || !canManage || !selItems.length) return;
    if (!confirm(`Véglegesen törlöd a(z) ${selItems.length} elemet a fájlokkal együtt? (${gb(selSize)} szabadul fel)`)) return;
    const selectedItems = [...selItems];
    const completed: string[] = [];
    setBusy(true); setMessage("");
    try {
      if (data.demo) { qc.setQueryData(q.queryKey, { ...data, items: data.items.filter((i) => !sel.includes(i.type + i.id)) }); completed.push(...sel); }
      else { for (const i of selectedItems) { await deleteMedia({ data: { id: i.id, type: i.type } }); completed.push(i.type + i.id); } }
    } catch { setMessage(`${completed.length} elem törölve; a többi törlése sikertelen. A megmaradt kijelölésekkel újra próbálhatod.`); }
    finally {
      setSel((current) => current.filter((id) => !completed.includes(id)));
      if (!data.demo) { await qc.invalidateQueries({ queryKey: q.queryKey }); await qc.invalidateQueries({ queryKey: ["overview"] }); }
      setBusy(false);
    }
  };
  const chip = (on: boolean) => `rounded-md px-3 py-1.5 text-sm ${on ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`;
  return (
    <Shell demo={data.demo}>
      <PageHeader title="Tárhely" />
      {message && <p role="alert" className="mb-4 text-sm text-destructive">{message}</p>}
      <p className="mb-6 text-sm text-muted-foreground">{items.length} elem · összesen {gb(total)}</p>
      <div className="mb-4 flex flex-wrap items-center gap-1">
        {["Mind", "Film", "Sorozat"].map((t) => <Button variant="ghost" key={t} aria-pressed={type === t} className={chip(type === t)} onClick={() => setType(t)}>{t}</Button>)}
        <span className="mx-2 text-border">|</span>
        <Button variant="ghost" aria-pressed={sort === "size"} className={chip(sort === "size")} onClick={() => setSort("size")}>Legnagyobb elöl</Button>
        <Button variant="ghost" aria-pressed={sort === "old"} className={chip(sort === "old")} onClick={() => setSort("old")}>Legrégebbi elöl</Button>
      </div>
      {sel.length > 0 && (
        <Card className="sticky top-2 z-10 mb-4"><div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm">{sel.length} kijelölve · <b className="text-primary">{gb(selSize)}</b> szabadulna fel</span>
          <div className="flex gap-2">
            <Button disabled={busy} variant="ghost" onClick={() => setSel([])} className="rounded-md border border-border px-3 py-1.5 text-sm"><X />Mégse</Button>
            <Button variant="destructive" disabled={busy || !canManage} onClick={del} className="rounded-md bg-destructive px-3 py-1.5 text-sm font-medium text-destructive-foreground"><Trash2 />{busy ? "Törlés…" : "Törlés"}</Button>
          </div></div></Card>)}
      <div className="space-y-2">{items.map((i, n) => {
        const k = i.type + i.id, on = sel.includes(k);
        return (
          <label key={k} className={`flex cursor-pointer items-center gap-4 rounded-lg border p-3 ${on ? "border-destructive bg-card" : "border-border bg-card"}`}>
            <input disabled={busy || !canManage} type="checkbox" checked={on} onChange={() => setSel(on ? sel.filter((x) => x !== k) : [...sel, k])} className="size-4 accent-current" />
            <div className="hidden sm:block w-10 shrink-0"><Poster src={i.poster} title="" hue={(n * 47) % 360} /></div>
            <div className="min-w-0 flex-1"><div className="line-clamp-2 font-medium">{i.title} <span className="text-muted-foreground">({i.year})</span></div>
              <div className="text-xs text-muted-foreground">{i.type} · hozzáadva: {i.added || "?"}</div></div>
            <div className="w-20 sm:w-28 shrink-0 text-right">
              <div className="font-mono text-sm">{gb(i.size)}</div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary"><div className="h-full bg-primary" style={{ width: `${Math.min(100, (i.size / (items[0]?.size || 1)) * 100)}%` }} /></div>
            </div>
          </label>);
      })}</div>
      {!items.length && <EmptyState title="Nincs megjeleníthető tartalom">Válassz másik típust, vagy ellenőrizd a médiakapcsolatot.</EmptyState>}
    </Shell>
  );
}
