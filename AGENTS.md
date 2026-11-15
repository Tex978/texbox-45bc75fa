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
- Xiaomi thermometer reads select service/property IDs per model; Monitor 3 has a distinct layout, so avoid applying legacy BLE IDs universally.
- Growatt reads share a credential-scoped cache with the same duration as the polling interval, in-flight deduplication, reusable session and one-hour failure cooldown; connection tests must use the same guarded read path to avoid repeated logins. Memory-only protection is per process and resets on restart.
- Gree units use the installed gree-hvac-client over local UDP from Docker only; keep its runtime dependency in the image and load it dynamically from gree.server.ts to preserve hosted preview compatibility.
- Transfer the request-scoped React Query cache through router dehydrate/hydrate callbacks so SSR and initial browser rendering share one data snapshot; use a short default staleTime to avoid immediate duplicate reads.
- Smart-home presentation uses SmartHomeUI and SmartEnergy with CSS scoped to .smart-home; keep vendor commands unchanged and other pages' appearance intact.
- Service integrations (qBittorrent/Radarr/Sonarr/Plex/Synology DSM; smart home via direct vendor clouds — user rejected Home Assistant) live in src/lib/nas.functions.ts, configured via an httpOnly cookie set from the Connections page (env vars as fallback), falling back to demo data when unset — the app is self-hosted in Docker on the user LAN (NITRO_PRESET=node-server); GitHub Action builds ghcr.io image, Watchtower auto-updates, APP_PASSWORD gate in src/lib/app-gate.ts (off when unset, so preview is open).
<!-- AGENT-MEMORY:END -->
