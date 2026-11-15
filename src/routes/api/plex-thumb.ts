import { createFileRoute } from "@tanstack/react-router";
import { getCookie } from "@tanstack/react-start/server";
export const Route = createFileRoute("/api/plex-thumb")({
  server: { handlers: { GET: async ({ request }) => {
    let cfg: Record<string, string> = {};
    try { cfg = JSON.parse(getCookie("nas-cfg") || "{}"); } catch { /* ignore */ }
    const path = new URL(request.url).searchParams.get("path") || "";
    let base = (cfg["PLEX_URL"] || process.env["PLEX_URL"] || "").trim().replace(/\/+$/, "");
    if (base && !/^https?:\/\//i.test(base)) base = `http://${base}`;
    const token = cfg["PLEX_TOKEN"] || process.env["PLEX_TOKEN"] || "";
    if (!base || !path.startsWith("/library/")) return new Response("Not found", { status: 404 });
    try {
      const r = await fetch(`${base}/photo/:/transcode?width=300&height=450&minSize=1&url=${encodeURIComponent(path)}&X-Plex-Token=${token}`);
      if (!r.ok) return new Response("Plex error", { status: r.status });
      return new Response(r.body, { headers: { "content-type": r.headers.get("content-type") || "image/jpeg", "cache-control": "private, max-age=86400" } });
    } catch { return new Response("Plex unreachable", { status: 502 }); }
  } } },
});
