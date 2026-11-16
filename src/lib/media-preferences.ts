import { normalizeFilters } from "./media-filters";
import type { MediaCategory, MediaType } from "./media";
import { WINDOWS } from "./streaming";

export type MediaPrefKey = "media-search-state" | "streaming-state";
export function normalizeMediaPref(key: MediaPrefKey, value: unknown) {
  const v = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const type: MediaType = v.type === "Sorozat" ? "Sorozat" : "Film";
  if (key === "media-search-state") {
    const category: MediaCategory = ["recommended", "new", "popular", "trending"].includes(String(v.category)) ? v.category as MediaCategory : "recommended";
    return { type, category, filters: normalizeFilters(v.filters, type) };
  }
  return { type, provider: Math.max(0, Math.floor(Number(v.provider)) || 0), mode: v.mode === "popular" ? "popular" as const : "new" as const, days: WINDOWS.includes(Number(v.days)) ? Number(v.days) : 30 };
}
export function mediaPrefStoreKey(userId: string | undefined) {
  return `media-prefs:${userId ?? "legacy"}`;
}