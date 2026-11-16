import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { storeGet, storeSet } from "./shared-store.server";
import { requirePermission, SESSION_COOKIE } from "./auth.server";
import { applyPref, isPrefKey, parsePrefs, PREF_KEYS, PREF_STORE_KEY, type PrefKey } from "./shared-prefs";

export const getSharedPrefs = createServerFn({ method: "GET" }).handler(async () => {
  requirePermission(getCookie(SESSION_COOKIE));
  const raw = storeGet(PREF_STORE_KEY);
  return { prefs: JSON.stringify(parsePrefs(raw)), shared: raw !== null };
});

export const saveSharedPref = createServerFn({ method: "POST" })
  .inputValidator((input: { key: PrefKey; value: string; onlyMissing?: boolean }) => {
    if (!input || !isPrefKey(input.key) || typeof input.value !== "string") throw new Error("Ismeretlen beállítás.");
    return input;
  })
  .handler(async ({ data }) => {
    requirePermission(getCookie(SESSION_COOKIE), PREF_KEYS[data.key]);
    const current = parsePrefs(storeGet(PREF_STORE_KEY));
    const next = applyPref(current, data.key, JSON.parse(data.value), data.onlyMissing === true);
    if (next !== current && !storeSet(PREF_STORE_KEY, JSON.stringify(next)))
      throw new Error("A beállítás nem menthető a Synologyra. Ellenőrizd a data mappa írási jogát.");
    return { prefs: JSON.stringify(next) };
  });
