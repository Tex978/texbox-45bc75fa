<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

<!-- AGENT-MEMORY:BEGIN -->
- Plex poster requests use the same shared-store-first configuration and legacy cookie fallback as overview reads; send the Plex token in a server-side header so other browsers can load posters without exposing credentials.
- Thermometer metadata shares the existing server store; retain all discovered sensors for restoration while applying one visibility filter to tiles and summaries, and migrate browser names without overwriting shared choices.
- Shared settings migrate legacy cookies only for missing keys, commit disk writes atomically before updating cache, and surface filesystem failures instead of claiming browser-only saves are shared; this prevents silent cross-device loss.
- Docker builds use native runners per architecture and slash-free matrix architecture labels for artifact names, because GitHub rejects platform strings containing `/` as artifact names.
- Smart-home presentation uses cached vendor readings for compact summary tiles and category-switched panels, not one long vendor list; preserve polling and device command semantics during layout changes.
- Home Connect reads preserve HTTP-specific sanitized errors, treat only missing active programs as normal, and allow relinking from the error state; request provider-supported English responses while keeping the UI Hungarian.
- Media discovery uses TMDB for movie/TV categories and details and OMDb or explicitly named Arr IMDb fields for IMDb scores; never relabel TMDB scores as IMDb. Preserve TMDB movie and TVDB series request IDs, keep provider credentials in the existing self-hosted configuration, and label sample catalogs and non-personalized fallbacks honestly.
- App icons share one photo cutout as resized public PNGs; manifest-only, no service worker, so live reads stay uncached.
- The overview heading reuses the bundled full-body photographic cutout in normal layout flow (not the smart-home header) so the photo never covers device controls.
- Thermometer history is requested on demand from Xiaomi with bounded reads, decoded in thermo-history.ts, and never synthesized as real measurements; dashboard mobile CSS remains scoped to smart-home.
- Xiaomi thermometer reads select service/property IDs per model; Monitor 3 has a distinct layout, so avoid applying legacy BLE IDs universally.
- Growatt reads share a credential-scoped cache with the same duration as the polling interval, in-flight deduplication, reusable session and one-hour failure cooldown; connection tests must use the same guarded read path to avoid repeated logins. Memory-only protection is per process and resets on restart.
- Gree local units use dynamically loaded gree-hvac-client UDP; cloud accounts use a private stdin/stdout Python bridge with pinned greeclimate-davo22 in Debian-based Docker, build tools and an import smoke check. Use library temperature setters and push_state_update so enum-based property access and decimal setpoint grouping remain model-aware; verify by readback. Keep credentials out of arguments/logs, return sanitized states, and report Docker-only availability in hosted preview.
- Gree cloud login and discovery use bounded timeouts and stage-specific sanitized errors; read devices with bounded concurrency so slow units do not exhaust the bridge deadline or hide healthy units.
- Transfer the request-scoped React Query cache through router dehydrate/hydrate callbacks so SSR and initial browser rendering share one data snapshot; use a short default staleTime to avoid immediate duplicate reads.
- All content pages share Shell navigation, unframed section headings, semantic global theme tokens and shadcn Button controls; smart-home layout remains scoped while inheriting the shared palette, so visual updates never change vendor commands.
- Smart-home (/home) uses the scoped `.hd` layout: left rail on desktop and a fixed bottom tab bar on phones (Otthon, Szobák, Eszközök, Energia, Több). Device tiles come from the read-only model in src/lib/home-devices.ts and open the unchanged vendor components in a sheet (or a sticky side panel on desktop). Rooms come only from stored metadata, favorites and theme are browser-stored and read after hydration, and vendor commands stay unchanged.
- Service integrations (qBittorrent/Radarr/Sonarr/Plex/Synology DSM; smart home via direct vendor clouds — user rejected Home Assistant) live in src/lib/nas.functions.ts, configured from the Connections page and persisted server-side in /data/nas-state.json (shared by all devices; browser cookie only as fallback) (env vars as fallback), falling back to demo data when unset — the app is self-hosted in Docker on the user LAN (NITRO_PRESET=node-server); GitHub Action builds ghcr.io image, Watchtower auto-updates, APP_PASSWORD gate in src/lib/app-gate.ts (off when unset, so preview is open).
- Growatt history: inverter-level "mix" series first, plant-detail fallback; shared session and cache/cooldown; weeks only from real daily values; future/empty periods shown as missing.
<!-- AGENT-MEMORY:END -->
- Gree presentation selects exactly one detail panel by stable unit IP; all quick and detail controls share a per-IP in-flight lock, preventing concurrent commands across mounted views. Room assignments are hydrated browser-only metadata keyed by IP and shared with the read-only home grouping; vendor APIs and polling remain unchanged.
