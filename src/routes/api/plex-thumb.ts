import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/plex-thumb")({
  server: { handlers: { GET: async ({ request }) => {
    const path = new URL(request.url).searchParams.get("path") || "";
    const base = (process.env["PLEX_URL"] || "").replace(/\/$/, "");
    if (!base || !path.startsWith("/library/")) return new Response("Not found", { status: 404 });
    const r = await fetch(`${base}/photo/:/transcode?width=300&height=450&url=${encodeURIComponent(path)}&X-Plex-Token=${process.env["PLEX_TOKEN"]}`);
    return new Response(r.body, { status: r.status, headers: { "content-type": r.headers.get("content-type") || "image/jpeg", "cache-control": "max-age=86400" } });
  } } },
});
