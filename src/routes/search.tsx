import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Shell, Poster } from "@/components/Shell";
import { Button } from "@/components/ui/button";
import { MediaDetail } from "@/components/MediaDetail";
import { Plus, Check, Film, Tv, Sparkles, CalendarDays, Flame, TrendingUp, Star, Search as SearchIcon, ChevronLeft, ChevronRight, Cable } from "lucide-react";
import { browseMedia, requestMedia } from "@/lib/nas.functions";
import type { MediaType, MediaCategory, MediaItem } from "@/lib/media";
const browseOptions = (type: MediaType, category: MediaCategory, q: string, page: number) => queryOptions({
  queryKey: ["media-browse", type, category, q, page], queryFn: () => browseMedia({ data: { type, category, q, page } }), staleTime: 600000, retry: false,
});
const initial = browseOptions("Film", "recommended", "", 1);
const categories = [
  { id: "recommended", title: "Neked ajánlott", icon: Sparkles }, { id: "new", title: "Új megjelenések", icon: CalendarDays },
  { id: "popular", title: "Népszerű", icon: Flame }, { id: "trending", title: "Felkapott", icon: TrendingUp },
] as const;
export const Route = createFileRoute("/search")({
  head: () => ({ meta: [
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
    { title: "Filmek és sorozatok – NAS Vezérlő" }, { name: "description", content: "Filmes és sorozatos ajánlások, új megjelenések, történetek, szereplők és előzetesek." },
    { property: "og:title", content: "Filmek és sorozatok – NAS Vezérlő" }, { property: "og:description", content: "Fedezz fel filmeket és sorozatokat részletes adatlapokkal és IMDb-hivatkozásokkal." },
  ] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(initial),
  component: Search,
});
function Search() {
  useSuspenseQuery(initial);
  const [q, setQ] = useState(""); const [dq, setDq] = useState("");
  const [type, setType] = useState<MediaType>("Film");
  const [category, setCategory] = useState<MediaCategory>("recommended");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<MediaItem | null>(null);
  const [profile, setProfile] = useState("1080p");
  const [state, setState] = useState<Record<string, string>>({});
  const request = useServerFn(requestMedia);
  useEffect(() => { const timer = setTimeout(() => { setDq(q); setPage(1); }, 400); return () => clearTimeout(timer); }, [q]);
  const { data, isFetching, isError, refetch } = useQuery(browseOptions(type, category, dq, page));
  const req = async (item: MediaItem) => {
    const key = item.type + item.id;
    setState((s) => ({ ...s, [key]: "busy" }));
    try { await request({ data: { id: item.id, type: item.type, profile } }); setState((s) => ({ ...s, [key]: "done" })); }
    catch { setState((s) => ({ ...s, [key]: "error" })); }
  };
  return <Shell demo={!!data?.demo}>
    <div className="flex flex-wrap justify-between items-end gap-4"><h1>Filmek és sorozatok</h1><span className="text-xs text-muted-foreground">{data?.items.length || 0} találat</span></div>
    <div className="media-toolbar">
      <div className="media-segment" aria-label="Médiatípus">{(["Film", "Sorozat"] as const).map((value) => <Button key={value} variant={type === value ? "default" : "ghost"} aria-pressed={type === value} onClick={() => { setType(value); setPage(1); }}>{value === "Film" ? <Film size={17} /> : <Tv size={17} />}{value === "Film" ? "Filmek" : "Sorozatok"}</Button>)}</div>
      <div className="flex min-w-0 flex-1 sm:max-w-lg gap-2">
        <label className="relative min-w-0 flex-1"><SearchIcon size={17} className="absolute left-3 top-3 text-muted-foreground" /><input aria-label="Film vagy sorozat keresése" value={q} onChange={(e) => setQ(e.target.value)} placeholder={type === "Film" ? "Film keresése…" : "Sorozat keresése…"} className="w-full min-w-0 rounded-md border border-input bg-card pl-10 pr-3 py-2 outline-none focus:ring-2 focus:ring-ring" /></label>
        <select aria-label="Kért minőség" value={profile} onChange={(e) => setProfile(e.target.value)} className="rounded-md border border-input bg-card px-2 py-2"><option>720p</option><option>1080p</option><option>4K</option></select>
      </div>
    </div>
    <div className="media-category-nav" aria-label="Kínálat kategóriája">{categories.map(({ id, title, icon: Icon }) => <Button key={id} variant={category === id ? "secondary" : "ghost"} aria-pressed={category === id} onClick={() => { setCategory(id); setQ(""); setDq(""); setPage(1); }}><Icon size={16} />{title}</Button>)}</div>
    {data?.notice && <div className="mb-6 flex flex-wrap items-center gap-3 text-sm text-muted-foreground"><span>{data.notice}</span><Button asChild variant="outline" size="sm"><Link to="/settings"><Cable size={15} />Kapcsolatok</Link></Button></div>}
    {isFetching && <p role="status" className="mb-4 text-sm text-muted-foreground">Kínálat betöltése…</p>}
    {isError && <div role="alert" className="mb-4 flex flex-wrap items-center gap-3 text-destructive">A keresés nem sikerült.<Button variant="outline" onClick={() => void refetch()}>Újrapróbálás</Button></div>}
    <div className="media-grid">{data?.items.map((item) => {
      const status = state[item.type + item.id];
      return <article key={item.type + item.id} className="min-w-0 flex flex-col">
        <Button variant="ghost" className="media-poster-button" aria-label={`${item.title} adatlapja`} onClick={() => setSelected(item)}><Poster src={item.poster} title={item.title} /><span className="media-rating"><Star size={12} />IMDb {item.imdbRating?.toFixed(1) || "–"}</span></Button>
        <h2 className="media-item-title">{item.title}</h2><p className="mt-1 mb-3 text-xs text-muted-foreground">{item.year || "–"} · {item.type}</p>
        <Button variant="outline" className="mt-auto w-full" disabled={data.demo || item.inLibrary || status === "busy" || status === "done"} onClick={() => void req(item)}>{item.inLibrary || status === "done" ? <Check size={15} /> : <Plus size={15} />}{item.inLibrary ? "Már megvan" : status === "busy" ? "Kérés…" : status === "done" ? "Kérve" : status === "error" ? "Újrapróbálás" : "Kérés"}</Button>
        {status === "error" && <p role="alert" className="mt-2 text-xs text-destructive">A kérés sikertelen.</p>}
      </article>;
    })}</div>
    {!isFetching && !isError && data?.items.length === 0 && <p className="py-12 text-center text-muted-foreground">Nincs találat ebben a kategóriában.</p>}
    {(page > 1 || data?.hasMore) && <div className="flex justify-center items-center gap-4 mt-8"><Button variant="outline" size="icon" aria-label="Előző oldal" disabled={page === 1 || isFetching} onClick={() => setPage(page - 1)}><ChevronLeft /></Button><span className="text-sm">{page}. oldal</span><Button variant="outline" size="icon" aria-label="Következő oldal" disabled={!data?.hasMore || isFetching} onClick={() => setPage(page + 1)}><ChevronRight /></Button></div>}
    {selected && <MediaDetail key={selected.type + selected.id} item={selected} onClose={() => setSelected(null)} request={(item) => void req(item)} requestState={state[selected.type + selected.id]} />}
  </Shell>;
}
