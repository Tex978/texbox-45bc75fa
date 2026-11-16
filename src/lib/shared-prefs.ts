import type { Permission } from "./permissions";

/** Household-wide preferences stored on the NAS. Values are plain JSON; never secrets. */
export const PREF_KEYS = {
  "home-favorites": "home",
  "home-theme": "home",
  "home-gree-rooms": "rooms",
  "blinds-excluded": "rooms",
  "hc-meta": "rooms",
} as const satisfies Record<string, Permission>;
export type PrefKey = keyof typeof PREF_KEYS;
export const isPrefKey = (k: unknown): k is PrefKey => typeof k === "string" && k in PREF_KEYS;
export const PREF_STORE_KEY = "shared-prefs";
export const MAX_PREF_BYTES = 32_000;

export function parsePrefs(raw: string | null | undefined): Partial<Record<PrefKey, unknown>> {
  try {
    const v = JSON.parse(raw ?? "{}");
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    return Object.fromEntries(Object.entries(v).filter(([k]) => isPrefKey(k)));
  } catch {
    return {};
  }
}

/** Returns the next prefs map, or the same map when onlyMissing and the key already exists. */
export function applyPref(
  prefs: Partial<Record<PrefKey, unknown>>,
  key: PrefKey,
  value: unknown,
  onlyMissing: boolean,
) {
  if (onlyMissing && key in prefs) return prefs;
  if (JSON.stringify(value ?? null).length > MAX_PREF_BYTES) throw new Error("Túl nagy beállítás.");
  return { ...prefs, [key]: value };
}
