/** Streaming services we highlight; availability itself always comes from TMDB's HU watch-provider data. */
export const KNOWN_PROVIDERS = ["Netflix", "HBO Max", "Max", "Disney Plus", "Amazon Prime Video", "Apple TV+", "Apple TV Plus", "SkyShowtime", "RTL+", "Hulu", "Paramount Plus"];
export type StreamMode = "new" | "popular";
export type Provider = { id: number; name: string; logo: string };
export const WINDOWS = [7, 30, 90] as const;
export function pickProviders(raw: { provider_id: number; provider_name: string; logo_path?: string; display_priorities?: Record<string, number> }[]): Provider[] {
  return raw
    .filter((p) => KNOWN_PROVIDERS.includes(p.provider_name))
    .sort((a, b) => (a.display_priorities?.["HU"] ?? 99) - (b.display_priorities?.["HU"] ?? 99))
    .map((p) => ({ id: p.provider_id, name: p.provider_name.replace("Disney Plus", "Disney+").replace("Amazon Prime Video", "Prime Video").replace("Apple TV Plus", "Apple TV+"), logo: p.logo_path ? `https://image.tmdb.org/t/p/w92${p.logo_path}` : "" }));
}
export function streamParams(kind: "movie" | "tv", providers: number[], mode: StreamMode, days: number, today = new Date()) {
  const date = kind === "movie" ? "primary_release_date" : "first_air_date";
  const p: Record<string, string> = { watch_region: "HU", with_watch_providers: providers.join("|"), with_watch_monetization_types: "flatrate", include_adult: "false" };
  if (mode === "new") {
    const d = WINDOWS.includes(days as 7) ? days : 30;
    p[`${date}.gte`] = new Date(today.getTime() - d * 86400000).toISOString().slice(0, 10);
    p[`${date}.lte`] = today.toISOString().slice(0, 10);
    p["sort_by"] = "popularity.desc";
  } else { p["sort_by"] = "popularity.desc"; p["vote_count.gte"] = "50"; }
  return p;
}
