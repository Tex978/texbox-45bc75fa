import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Shell, Card } from "@/components/Shell";
import { searchMedia, requestMedia } from "@/lib/nas.functions";
export const Route = createFileRoute("/search")({
  head: () => ({ meta: [
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
      <div className="grid gap-3 sm:grid-cols-2">{data.map((c) => {
        const s = state[c.type + c.id];
        return (
          <Card key={c.type + c.id}><div className="flex items-center justify-between gap-3">
            <div><div className="font-medium">{c.title}</div><div className="text-xs text-muted-foreground">{c.type} · {c.year} → {c.type === "Film" ? "Radarr" : "Sonarr"}</div></div>
            <button disabled={!!s || c.inLibrary} onClick={() => req(c)}
              className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:bg-secondary disabled:text-muted-foreground">
              {c.inLibrary ? "Már megvan" : s || "Kérés"}</button></div></Card>);
      })}</div>
    </Shell>
  );
}
