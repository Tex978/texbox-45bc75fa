import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Shell, Poster, PageHeader } from "@/components/Shell";
import { Button } from "@/components/ui/button";
import { MediaDetail } from "@/components/MediaDetail";
import { Cable, Check, ChevronLeft, ChevronRight, Film, Flame, Plus, Sparkles, Star, Tv } from "lucide-react";
import { getStreaming, requestMedia } from "@/lib/nas.functions";
import type { MediaItem, MediaType } from "@/lib/media";
import { WINDOWS, type StreamMode } from "@/lib/streaming";

const opts = (type: MediaType, provider: number, mode: StreamMode, days: number, page: number) => queryOptions({
  queryKey: ["streaming", type, provider, mode, days, page],
  queryFn: () => getStreaming({ data: { type, provider, mode, days, page } }), staleTime: 3600000, retry: false,
});
const initial = opts("Film", 0, "new", 30, 1);
const SAVED = "streaming-state";
export const Route = createFileRoute("/streaming")({
  head: () => ({ meta: [
    { title: "Streaming újdonságok – NAS Vezérlő" },
    { name: "description", content: "Netflix, Max, Disney+, Prime Video és Apple TV+ új és népszerű címei magyarországi elérhetőséggel." },
    { property: "og:title", content: "Streaming újdonságok – NAS Vezérlő" },
    { property: "og:description", content: "Szolgáltatónként szűrhető új megjelenések és népszerű filmek, sorozatok." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(initial),
  component: Streaming,
});
const windowLabel: Record<number, string> = { 7: "Elmúlt hét", 30: "Elmúlt hónap", 90: "Elmúlt 3 hónap" };

function Streaming() {
  useSuspenseQuery(initial);
  const [type, setType] = useState<MediaType>("Film");
  const [provider, setProvider] = useState(0);
  const [mode, setMode] = useState<StreamMode>("new");
  const [days, setDays] = useState(30);
  const [page, setPage] = useState(1);
  const [restored, setRestored] = useState(false);
  const [selected, setSelected] = useState<MediaItem | null>(null);
  const [state, setState] = useState<Record<string, string>>({});
  const request = useServerFn(requestMedia);
  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem(SAVED) || "null");
      if (v) { setType(v.type === "Sorozat" ? "Sorozat" : "Film"); setProvider(Number(v.provider) || 0); setMode(v.mode === "popular" ? "popular" : "new"); setDays(WINDOWS.includes(v.days) ? v.days : 30); }
    } catch { /* ignore */ }
    setRestored(true);
  }, []);
  useEffect(() => { if (restored) try { localStorage.setItem(SAVED, JSON.stringify({ type, provider, mode, days })); } catch { /* ignore */ } }, [restored, type, provider, mode, days]);
  const { data, isFetching, isError, refetch } = useQuery(opts(type, provider, mode, days, page));
  const reset = () => setPage(1);
  const req = async (item: MediaItem) => {
    const key = item.type + item.id;
    setState((s) => ({ ...s, [key]: "busy" }));
    try { await request({ data: { id: item.id, type: item.type, profile: "1080p" } }); setState((s) => ({ ...s, [key]: "done" })); }
    catch { setState((s) => ({ ...s, [key]: "error" })); }
  };
  const providerName = data?.providers.find((p) => p.id === provider)?.name;
  return <Shell>
    <div className="flex flex-wrap items-end justify-between gap-4">
      <PageHeader title="Streaming újdonságok" subtitle="Csak olyan címek, amelyeket a TMDB szerint Magyarországon előfizetéssel nézhetsz." />
      <div className="media-segment" aria-label="Médiatípus">{(["Film", "Sorozat"] as const).map((v) => <Button key={v} variant={type === v ? "default" : "ghost"} aria-pressed={type === v} onClick={() => { setType(v); reset(); }}>{v === "Film" ? <Film size={17} /> : <Tv size={17} />}{v === "Film" ? "Filmek" : "Sorozatok"}</Button>)}</div>
    </div>
    {data && !data.configured ? <div className="mt-8 rounded-lg border border-border bg-card p-6"><p className="font-medium">A streaming felfedezőhöz TMDB-kapcsolat kell.</p><p className="mt-1 text-sm text-muted-foreground">A TMDB adja meg, melyik cím melyik szolgáltatónál érhető el Magyarországon.</p><Button asChild className="mt-4"><Link to="/settings"><Cable size={16} />Kapcsolatok</Link></Button></div> : <>
      <div className="stream-providers" aria-label="Szolgáltató">
        <button className="stream-provider" aria-pressed={provider === 0} onClick={() => { setProvider(0); reset(); }}><span className="stream-provider-all">Mind</span>Összes</button>
        {data?.providers.map((p) => <button key={p.id} className="stream-provider" aria-pressed={provider === p.id} onClick={() => { setProvider(p.id); reset(); }}>{p.logo ? <img src={p.logo} alt="" loading="lazy" /> : <span className="stream-provider-all">{p.name[0]}</span>}{p.name}</button>)}
      </div>
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Button variant={mode === "new" ? "secondary" : "ghost"} aria-pressed={mode === "new"} onClick={() => { setMode("new"); reset(); }}><Sparkles size={16} />Új megjelenések</Button>
        <Button variant={mode === "popular" ? "secondary" : "ghost"} aria-pressed={mode === "popular"} onClick={() => { setMode("popular"); reset(); }}><Flame size={16} />Népszerű most</Button>
        {mode === "new" && <select aria-label="Időszak" value={days} onChange={(e) => { setDays(Number(e.target.value)); reset(); }} className="ml-auto min-h-10 rounded-md border border-input bg-card px-3">{WINDOWS.map((d) => <option key={d} value={d}>{windowLabel[d]}</option>)}</select>}
      </div>
      {mode === "new" && <p className="-mt-3 mb-5 text-xs text-muted-foreground">Az „új” a cím megjelenési dátuma szerint értendő; azt, hogy mikor került fel a szolgáltatóra, a TMDB nem adja meg.</p>}
      {isFetching && <p role="status" className="mb-4 text-sm text-muted-foreground">Kínálat betöltése…</p>}
      {(isError || data?.error) && <div role="alert" className="mb-4 flex flex-wrap items-center gap-3 text-destructive">{data?.error || "A betöltés nem sikerült."}<Button variant="outline" onClick={() => void refetch()}>Újrapróbálás</Button></div>}
      <div className="media-grid">{data?.items.map((item) => {
        const status = state[item.type + item.id];
        return <article key={item.type + item.id} className="flex min-w-0 flex-col">
          <Button variant="ghost" className="media-poster-button" aria-label={`${item.title} adatlapja`} onClick={() => setSelected(item)}><Poster src={item.poster} title={item.title} /><span className="media-rating"><Star size={12} />IMDb {item.imdbRating?.toFixed(1) || "–"}</span></Button>
          <h2 className="media-item-title">{item.title}</h2><p className="mb-3 mt-1 text-xs text-muted-foreground">{item.year || "–"}{providerName ? ` · ${providerName}` : ""}</p>
          <Button variant="outline" className="mt-auto w-full" disabled={item.inLibrary || status === "busy" || status === "done"} onClick={() => void req(item)}>{item.inLibrary || status === "done" ? <Check size={15} /> : <Plus size={15} />}{item.inLibrary ? "Már megvan" : status === "busy" ? "Kérés…" : status === "done" ? "Kérve" : status === "error" ? "Újrapróbálás" : "Kérés"}</Button>
        </article>;
      })}</div>
      {!isFetching && !isError && !data?.error && data?.items.length === 0 && <p className="py-12 text-center text-muted-foreground">Ebben az időszakban nincs új cím ennél a szolgáltatónál.</p>}
      {(page > 1 || data?.hasMore) && <div className="mt-8 flex items-center justify-center gap-4"><Button variant="outline" size="icon" aria-label="Előző oldal" disabled={page === 1 || isFetching} onClick={() => setPage(page - 1)}><ChevronLeft /></Button><span className="text-sm">{page}. oldal</span><Button variant="outline" size="icon" aria-label="Következő oldal" disabled={!data?.hasMore || isFetching} onClick={() => setPage(page + 1)}><ChevronRight /></Button></div>}
      <p className="mt-10 text-xs text-muted-foreground">Elérhetőségi adatok: TMDB és JustWatch.</p>
    </>}
    {selected && <MediaDetail key={selected.type + selected.id} item={selected} onClose={() => setSelected(null)} request={(item) => void req(item)} requestState={state[selected.type + selected.id]} />}
  </Shell>;
}
