import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Shell, Card } from "@/components/Shell";
import { catalog } from "@/lib/mock";
export const Route = createFileRoute("/search")({
  head: () => ({ meta: [
    { title: "Keresés – NAS Vezérlő" }, { name: "description", content: "Filmek és sorozatok keresése és kérése Radarr/Sonarr felé." },
    { property: "og:title", content: "Keresés – NAS Vezérlő" }, { property: "og:description", content: "Filmek és sorozatok keresése és kérése." },
  ] }),
  component: Search,
});
function Search() {
  const [q, setQ] = useState("");
  const [profile, setProfile] = useState("1080p");
  const [requested, setRequested] = useState<string[]>([]);
  const res = catalog.filter((c) => c.title.toLowerCase().includes(q.toLowerCase()));
  return (
    <Shell>
      <h1 className="mb-6 font-display text-3xl font-bold">Keresés és kérés</h1>
      <div className="mb-6 flex flex-wrap gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Film vagy sorozat címe…"
          className="min-w-0 flex-1 rounded-md border border-input bg-card px-3 py-2 outline-none focus:ring-2 focus:ring-ring" />
        <select value={profile} onChange={(e) => setProfile(e.target.value)} className="rounded-md border border-input bg-card px-3 py-2">
          <option>720p</option><option>1080p</option><option>4K</option></select>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">{res.map((c) => {
        const done = requested.includes(c.title);
        return (
          <Card key={c.title}><div className="flex items-center justify-between gap-3">
            <div><div className="font-medium">{c.title}</div><div className="text-xs text-muted-foreground">{c.type} · {c.year} → {c.type === "Film" ? "Radarr" : "Sonarr"}</div></div>
            <button disabled={done} onClick={() => setRequested([...requested, c.title])}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:bg-secondary disabled:text-muted-foreground">
              {done ? `Kérve (${profile})` : "Kérés"}</button></div></Card>);
      })}</div>
    </Shell>
  );
}
