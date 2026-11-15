import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Shell, Poster } from "@/components/Shell";
import { Button } from "@/components/ui/button";
import { Plus, Check } from "lucide-react";
import { searchMedia, requestMedia, getRecommendations } from "@/lib/nas.functions";
export const Route = createFileRoute("/search")({
  head: () => ({ meta: [
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
    { title: "Keresés – NAS Vezérlő" }, { name: "description", content: "Filmek és sorozatok keresése és kérése Radarr/Sonarr felé." },
    { property: "og:title", content: "Keresés – NAS Vezérlő" }, { property: "og:description", content: "Filmek és sorozatok keresése és kérése." },
  ] }),
  component: Search,
});
function Search() {
  const [q, setQ] = useState(""); const [dq, setDq] = useState("");
  const [profile, setProfile] = useState("1080p");
  const [state, setState] = useState<Record<string, string>>({});
  useEffect(() => { const t = setTimeout(() => setDq(q), 400); return () => clearTimeout(t); }, [q]);
  const { data = [], isFetching } = useQuery({ queryKey: ["search", dq], queryFn: () => searchMedia({ data: { q: dq } }), enabled: !!dq });
  const { data: recs = [] } = useQuery({ queryKey: ["recs"], queryFn: () => getRecommendations(), staleTime: 600000 });
  const shown = dq ? data : recs;
  const req = async (c: (typeof data)[number]) => {
    const k = c.type + c.id; setState((s) => ({ ...s, [k]: "…" }));
    try { await requestMedia({ data: { id: c.id, type: c.type, profile } }); setState((s) => ({ ...s, [k]: `Kérve (${profile})` })); }
    catch { setState((s) => ({ ...s, [k]: "Hiba" })); }
  };
  return (
    <Shell>
      <h1 className="mb-6 font-display text-3xl font-bold">Keresés és kérés</h1>
      <div className="mb-6 flex flex-wrap gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Film vagy sorozat címe…"
          className="min-w-0 flex-1 rounded-md border border-input bg-card px-3 py-2 outline-none focus:ring-2 focus:ring-ring" />
        <select value={profile} onChange={(e) => setProfile(e.target.value)} className="rounded-md border border-input bg-card px-3 py-2">
          <option>720p</option><option>1080p</option><option>4K</option></select>
      </div>
      {isFetching && <p className="mb-3 text-sm text-muted-foreground">Keresés…</p>}
      {!dq && <h2 className="mb-3 text-sm font-medium text-muted-foreground">Ajánlott neked · népszerű és felkapott</h2>}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">{shown.map((c, i) => {
        const s = state[c.type + c.id];
        return (
          <div key={c.type + c.id} className="flex flex-col" title={c.overview}>
            <Poster src={c.poster} title={c.title} hue={(i * 53) % 360} />
            <div className="mt-2 line-clamp-1 text-sm font-medium">{c.title}</div>
            <div className="mb-2 text-xs text-muted-foreground">{c.type} · {c.year}</div>
            <Button disabled={!!s || c.inLibrary} onClick={() => req(c)}
              className="mt-auto">
              {c.inLibrary ? <Check /> : <Plus />}
              {c.inLibrary ? "Már megvan" : s || "Kérés"}</Button>
          </div>);
      })}</div>
    </Shell>
  );
}
