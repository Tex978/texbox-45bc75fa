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
- Vehicle accounts use a separate pinned Python environment and private JSON-lines bridge in Docker, with credential-scoped 15-minute read/failure caches and in-memory Renault verification sessions; the cars page never substitutes demo measurements for unavailable data. Return allowlisted brand/stage/reason diagnostics rather than vendor exception text to protect credentials; VW construction runs off the event loop and fetch_all is not followed by a duplicate status fetch.
- App icons share one photographic cutout and resized public PNGs; use manifest-only home-screen metadata without a service worker so previews and live device reads remain uncached.
- Overview and smart-home headings reuse the bundled full-body photographic cutout in normal layout flow so the photo never covers device controls.
- Thermometer history is requested on demand from Xiaomi with bounded reads, decoded in thermo-history.ts, and never synthesized as real measurements; dashboard mobile CSS remains scoped to smart-home.
- Xiaomi thermometer reads select service/property IDs per model; Monitor 3 has a distinct layout, so avoid applying legacy BLE IDs universally.
- Growatt reads share a credential-scoped cache with the same duration as the polling interval, in-flight deduplication, reusable session and one-hour failure cooldown; connection tests must use the same guarded read path to avoid repeated logins. Memory-only protection is per process and resets on restart.
- Gree local units use dynamically loaded gree-hvac-client UDP; cloud accounts use a private stdin/stdout Python bridge with pinned greeclimate-davo22 in Debian-based Docker, build tools for native dependencies and an import smoke check to catch installation failures. Keep credentials out of process arguments/logs and return only sanitized states; hosted preview must report Docker-only availability.
- Transfer the request-scoped React Query cache through router dehydrate/hydrate callbacks so SSR and initial browser rendering share one data snapshot; use a short default staleTime to avoid immediate duplicate reads.
- All content pages share Shell navigation, unframed section headings, semantic global theme tokens and shadcn Button controls; smart-home layout remains scoped while inheriting the shared palette, so visual updates never change vendor commands.
- Service integrations (qBittorrent/Radarr/Sonarr/Plex/Synology DSM; smart home via direct vendor clouds — user rejected Home Assistant) live in src/lib/nas.functions.ts, configured via an httpOnly cookie set from the Connections page (env vars as fallback), falling back to demo data when unset — the app is self-hosted in Docker on the user LAN (NITRO_PRESET=node-server); GitHub Action builds ghcr.io image, Watchtower auto-updates, APP_PASSWORD gate in src/lib/app-gate.ts (off when unset, so preview is open).
<!-- AGENT-MEMORY:END -->
