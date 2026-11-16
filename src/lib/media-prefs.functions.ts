import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { requirePermission, SESSION_COOKIE } from "./auth.server";
import { storeGet, storeSet } from "./shared-store.server";
import { mediaPrefStoreKey, normalizeMediaPref, type MediaPrefKey } from "./media-preferences";

function read() {
  const user = requirePermission(getCookie(SESSION_COOKIE));
  const key = mediaPrefStoreKey(user?.id);
  let prefs: Record<string, unknown> = {};
  try {
    prefs = JSON.parse(storeGet(key) || "{}");
  } catch {
    /* retain a safe empty view */
  }
  return { key, prefs };
}
export const getMediaPrefs = createServerFn({ method: "GET" }).handler(async () => {
  const { prefs } = read();
  return { prefs: JSON.stringify(prefs) };
});
export const saveMediaPref = createServerFn({ method: "POST" })
  .inputValidator((input: { key: MediaPrefKey; value: string; onlyMissing?: boolean }) => {
    if (
      !input ||
      !["media-search-state", "streaming-state"].includes(input.key) ||
      typeof input.value !== "string" ||
      input.value.length > 32000
    )
      throw new Error("Érvénytelen keresési beállítás.");
    return input;
  })
  .handler(async ({ data }) => {
    const { key, prefs } = read();
    if (!data.onlyMissing || !(data.key in prefs)) {
      prefs[data.key] = normalizeMediaPref(data.key, JSON.parse(data.value));
      if (!storeSet(key, JSON.stringify(prefs)))
        throw new Error("A keresési beállítás nem menthető a NAS-ra.");
    }
    return { prefs: JSON.stringify(prefs) };
  });
