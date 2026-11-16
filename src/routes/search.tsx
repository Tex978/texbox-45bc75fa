import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { Shell, Poster, PageHeader, meQuery } from "@/components/Shell";
import { Button } from "@/components/ui/button";
import { MediaDetail } from "@/components/MediaDetail";
import { Plus, Check, Film, Tv, Sparkles, CalendarDays, Flame, TrendingUp, Star, Search as SearchIcon, ChevronLeft, ChevronRight, Cable, SlidersHorizontal, X } from "lucide-react";
import { browseMedia, requestMedia } from "@/lib/nas.functions";
import type { MediaType, MediaCategory, MediaItem } from "@/lib/media";
import { activeCount, DEFAULT_FILTERS, GENRES, normalizeFilters, type MediaFilters } from "@/lib/media-filters";
import { StreamingBrowse } from "@/components/StreamingBrowse";
import { useMediaPref } from "@/lib/use-media-pref";
const browseOptions = (type: MediaType, category: MediaCategory, q: string, page: number, filters: MediaFilters = DEFAULT_FILTERS) => queryOptions({
  queryKey: ["media-browse", type, category, q, page, filters], queryFn: () => browseMedia({ data: { type, category, q, page, filters } }), staleTime: 600000, retry: false,
});
const initial = browseOptions("Film", "recommended", "", 1);
const categories = [
  { id: "recommended", title: "Neked ajánlott", icon: Sparkles }, { id: "new", title: "Új megjelenések", icon: CalendarDays },
  { id: "popular", title: "Népszerű", icon: Flame }, { id: "trending", title: "Felkapott", icon: TrendingUp },
] as const;
export const Route = createFileRoute("/search")({
  validateSearch: (input: Record<string, unknown>): { view?: string } => typeof input["view"] === "string" ? { view: input["view"] } : {},
  head: () => ({ meta: [
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
    { title: "Filmek és sorozatok – NAS Vezérlő" }, { name: "description", content: "Filmes és sorozatos ajánlások, új megjelenések, történetek, szereplők és előzetesek." },
    { property: "og:title", content: "Filmek és sorozatok – NAS Vezérlő" }, { property: "og:description", content: "Fedezz fel filmeket és sorozatokat részletes adatlapokkal és IMDb-hivatkozásokkal." },
  ] }),
  loaderDeps: ({ search }) => ({ streaming: search.view === "streaming" }),
  loader: ({ context, deps }) => deps.streaming ? undefined : context.queryClient.ensureQueryData(initial),
  component: Search,
});
function Search() {
  const { view } = Route.useSearch();
  return <Shell><PageHeader title="Filmek és sorozatok" />
    <nav className="media-view-switch media-segment" aria-label="Filmek és sorozatok nézete">
      <Button asChild variant={view !== "streaming" ? "default" : "ghost"}><Link to="/search" search={{ view: "search" }} aria-current={view !== "streaming" ? "page" : undefined}><SearchIcon size={17} />Keresés</Link></Button>
      <Button asChild variant={view === "streaming" ? "default" : "ghost"}><Link to="/search" search={{ view: "streaming" }} aria-current={view === "streaming" ? "page" : undefined}><Sparkles size={17} />Streaming újdonságok</Link></Button>
    </nav>
    <div hidden={view === "streaming"}><SearchBrowse /></div>
    <div hidden={view !== "streaming"}>{view === "streaming" && <StreamingBrowse />}</div>
  </Shell>;
}
function SearchBrowse() {

  const [q, setQ] = useState(""); const [dq, setDq] = useState("");
  const [type, setType] = useState<MediaType>("Film");
  const [category, setCategory] = useState<MediaCategory>("recommended");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<MediaItem | null>(null);
  const [profile, setProfile] = useState("1080p");
  const [state, setState] = useState<Record<string, string>>({});
  const [filters, setFiltersRaw] = useState<MediaFilters>(DEFAULT_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [restored, setRestored] = useState(false);
  const request = useServerFn(requestMedia);
  const pref = useMediaPref<{ type: MediaType; category: MediaCategory; filters: MediaFilters }>("media-search-state");
  const lastSaved = useRef("");
  const me = useQuery(meQuery);
  const canRequest = me.data?.mode === "open" || !!me.data?.user?.can.request;
  const canSettings = me.data?.mode === "open" || !!me.data?.user?.can.settings;
  useEffect(() => {
    if (pref.loading || restored) return;
    if (pref.value) { setType(pref.value.type); setCategory(pref.value.category); setFiltersRaw(normalizeFilters(pref.value.filters, pref.value.type)); }
    lastSaved.current = JSON.stringify(pref.value || { type: "Film", category: "recommended", filters: DEFAULT_FILTERS });
    setRestored(true);
  }, [pref.loading, pref.value, restored]);
  useEffect(() => {
    const next = { type, category, filters }; const raw = JSON.stringify(next);
    if (!restored || raw === lastSaved.current) return;
    const timer = setTimeout(() => { lastSaved.current = raw; void pref.save(next); }, 500);
    return () => clearTimeout(timer);
  }, [restored, type, category, filters, pref.save]);
  const setFilters = (next: Partial<MediaFilters>) => { setFiltersRaw((f) => normalizeFilters({ ...f, ...next }, type)); setPage(1); };
  const count = activeCount(filters);
  useEffect(() => { const timer = setTimeout(() => { setDq(q); setPage(1); }, 400); return () => clearTimeout(timer); }, [q]);
  const { data, isFetching, isError, refetch } = useQuery({ ...browseOptions(type, category, dq, page, filters), enabled: restored && Route.useSearch().view !== "streaming" });
  const req = async (item: MediaItem) => {
    const key = item.type + item.id;
    setState((s) => ({ ...s, [key]: "busy" }));
    try { await request({ data: { id: item.id, type: item.type, profile } }); setState((s) => ({ ...s, [key]: "done" })); }
    catch { setState((s) => ({ ...s, [key]: "error" })); }
  };
  return <section aria-label="Keresési találatok">
    {pref.error && <p role="alert" className="mb-4 text-sm text-destructive">{pref.error}</p>}
    <div className="media-toolbar">
      <div className="media-segment" aria-label="Médiatípus">{(["Film", "Sorozat"] as const).map((value) => <Button key={value} variant={type === value ? "default" : "ghost"} aria-pressed={type === value} onClick={() => { setType(value); setFiltersRaw((f) => normalizeFilters(f, value)); setPage(1); }}>{value === "Film" ? <Film size={17} /> : <Tv size={17} />}{value === "Film" ? "Filmek" : "Sorozatok"}</Button>)}</div>
      <div className="media-search-inputs flex min-w-0 flex-1 sm:max-w-lg gap-2">
        <label className="relative min-w-0 flex-1"><SearchIcon size={17} className="absolute left-3 top-3 text-muted-foreground" /><input aria-label="Film vagy sorozat keresése" value={q} onChange={(e) => setQ(e.target.value)} placeholder={type === "Film" ? "Film keresése…" : "Sorozat keresése…"} className="w-full min-w-0 rounded-md border border-input bg-card pl-10 pr-3 py-2 outline-none focus:ring-2 focus:ring-ring" /></label>
        <select aria-label="Kért minőség" value={profile} onChange={(e) => setProfile(e.target.value)} className="rounded-md border border-input bg-card px-2 py-2"><option>720p</option><option>1080p</option><option>4K</option></select>
      </div>
    </div>
    <div className="media-category-nav" aria-label="Kínálat kategóriája">{categories.map(({ id, title, icon: Icon }) => <Button key={id} variant={category === id ? "secondary" : "ghost"} aria-pressed={category === id} onClick={() => { setCategory(id); setQ(""); setDq(""); setPage(1); }}><Icon size={16} />{title}</Button>)}</div>
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <Button variant={count ? "default" : "outline"} aria-expanded={showFilters} aria-controls="media-filters" onClick={() => setShowFilters((v) => !v)}><SlidersHorizontal size={16} />Szűrők{count ? ` (${count})` : ""}</Button>
      {filters.genre > 0 && <Button variant="secondary" size="sm" onClick={() => setFilters({ genre: 0 })}>{GENRES[type].find((g) => g.id === filters.genre)?.name}<X size={14} /></Button>}
      {(filters.yearFrom > 0 || filters.yearTo > 0) && <Button variant="secondary" size="sm" onClick={() => setFilters({ yearFrom: 0, yearTo: 0 })}>{filters.yearFrom || "…"}–{filters.yearTo || "…"}<X size={14} /></Button>}
      {filters.minRating > 0 && <Button variant="secondary" size="sm" onClick={() => setFilters({ minRating: 0 })}>{filters.minRating}+ pont<X size={14} /></Button>}
      {count > 0 && <Button variant="ghost" size="sm" onClick={() => { setFiltersRaw(DEFAULT_FILTERS); setPage(1); }}>Összes törlése</Button>}
    </div>
    {showFilters && <div className="media-filter-backdrop" onClick={() => setShowFilters(false)} />}
    {showFilters && <section id="media-filters" className="media-filter-panel" aria-label="Szűrők">
      <div className="flex items-center justify-between gap-2"><h2 className="text-lg font-semibold">Szűrők</h2><Button variant="ghost" size="icon" aria-label="Szűrők bezárása" onClick={() => setShowFilters(false)}><X /></Button></div>
      <fieldset><legend>Műfaj</legend><div className="media-chip-row">
        <Button size="sm" variant={!filters.genre ? "default" : "outline"} aria-pressed={!filters.genre} onClick={() => setFilters({ genre: 0 })}>Mind</Button>
        {GENRES[type].map((g) => <Button key={g.id} size="sm" variant={filters.genre === g.id ? "default" : "outline"} aria-pressed={filters.genre === g.id} onClick={() => setFilters({ genre: filters.genre === g.id ? 0 : g.id })}>{g.name}</Button>)}
      </div></fieldset>
      <div className="media-filter-grid">
        <label>Évtől<input type="number" inputMode="numeric" min={1900} max={new Date().getFullYear()} placeholder="pl. 2010" value={filters.yearFrom || ""} onChange={(e) => setFilters({ yearFrom: Number(e.target.value) })} /></label>
        <label>Évig<input type="number" inputMode="numeric" min={1900} max={new Date().getFullYear() + 2} placeholder="pl. 2025" value={filters.yearTo || ""} onChange={(e) => setFilters({ yearTo: Number(e.target.value) })} /></label>
        <label>Minimum értékelés (TMDB)<select value={filters.minRating} onChange={(e) => setFilters({ minRating: Number(e.target.value) })}><option value={0}>Bármely</option>{[5, 6, 7, 8].map((r) => <option key={r} value={r}>{r}+</option>)}</select></label>
        <label>Rendezés<select value={filters.sort} onChange={(e) => setFilters({ sort: e.target.value as MediaFilters["sort"] })}><option value="popularity">Népszerűség</option><option value="rating">Értékelés</option><option value="newest">Legújabb</option></select></label>
        <label>Elérhetőség<select value={filters.availability} onChange={(e) => setFilters({ availability: e.target.value as MediaFilters["availability"] })}><option value="all">Mind</option><option value="library">Már megvan a NAS-on</option><option value="missing">Még nincs meg</option></select></label>
      </div>
      <p className="text-xs text-muted-foreground">Szűrés esetén a kategória helyett a TMDB teljes kínálatából keresünk. Kulcsszavas keresésnél a szűrők az aktuális találati oldalra vonatkoznak. A szűrők a NAS-on, a saját fiókodhoz mentődnek.</p>
      <Button className="w-full sm:hidden" onClick={() => setShowFilters(false)}>{data?.items.length ?? 0} találat mutatása</Button>
    </section>}
    {data?.notice && <div className="mb-6 flex flex-wrap items-center gap-3 text-sm text-muted-foreground"><span>{data.notice}</span>{canSettings && <Button asChild variant="outline" size="sm"><Link to="/settings"><Cable size={15} />Kapcsolatok</Link></Button>}</div>}
    {isFetching && <p role="status" className="mb-4 text-sm text-muted-foreground">Kínálat betöltése…</p>}
    {isError && <div role="alert" className="mb-4 flex flex-wrap items-center gap-3 text-destructive">A keresés nem sikerült.<Button variant="outline" onClick={() => void refetch()}>Újrapróbálás</Button></div>}
    <div className="media-grid">{data?.items.map((item) => {
      const status = state[item.type + item.id];
      return <article key={item.type + item.id} className="min-w-0 flex flex-col">
        <Button variant="ghost" className="media-poster-button" aria-label={`${item.title} adatlapja`} onClick={() => setSelected(item)}><Poster src={item.poster} title={item.title} /><span className="media-rating"><Star size={12} />IMDb {item.imdbRating?.toFixed(1) || "–"}</span></Button>
        <h2 className="media-item-title">{item.title}</h2><p className="mt-1 mb-3 text-xs text-muted-foreground">{item.year || "–"} · {item.type}</p>
        <Button variant="outline" className="mt-auto w-full" disabled={!canRequest || data.demo || item.inLibrary || status === "busy" || status === "done"} onClick={() => void req(item)}>{item.inLibrary || status === "done" ? <Check size={15} /> : <Plus size={15} />}{item.inLibrary ? "Már megvan" : status === "busy" ? "Kérés…" : status === "done" ? "Kérve" : status === "error" ? "Újrapróbálás" : "Kérés"}</Button>
        {status === "error" && <p role="alert" className="mt-2 text-xs text-destructive">A kérés sikertelen.</p>}
      </article>;
    })}</div>
    {!isFetching && !isError && data?.items.length === 0 && <p className="py-12 text-center text-muted-foreground">{count ? "Nincs a szűrőknek megfelelő cím. Lazíts a feltételeken." : "Nincs találat ebben a kategóriában."}</p>}
    {(page > 1 || data?.hasMore) && <div className="flex justify-center items-center gap-4 mt-8"><Button variant="outline" size="icon" aria-label="Előző oldal" disabled={page === 1 || isFetching} onClick={() => setPage(page - 1)}><ChevronLeft /></Button><span className="text-sm">{page}. oldal</span><Button variant="outline" size="icon" aria-label="Következő oldal" disabled={!data?.hasMore || isFetching} onClick={() => setPage(page + 1)}><ChevronRight /></Button></div>}
    {selected && <MediaDetail key={selected.type + selected.id} item={selected} onClose={() => setSelected(null)} request={(item) => void req(item)} requestState={state[selected.type + selected.id]} canRequest={canRequest} />}
  </section>;
}
