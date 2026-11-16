import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSharedPrefs, saveSharedPref } from "./prefs.functions";
import type { PrefKey } from "./shared-prefs";

export const sharedPrefsQuery = { queryKey: ["shared-prefs"], queryFn: async () => { const r = await getSharedPrefs(); return { prefs: JSON.parse(r.prefs) as Record<string, unknown>, shared: r.shared }; }, staleTime: 30_000 };

/** NAS-shared preference. Legacy browser values are migrated once (only if the NAS has none). */
export function useSharedPref<T>(key: PrefKey, initial: T) {
  const qc = useQueryClient();
  const q = useQuery(sharedPrefsQuery);
  const [error, setError] = useState("");
  const migrated = useRef(false);
  const server = q.data?.prefs?.[key] as T | undefined;

  useEffect(() => {
    if (!q.data || migrated.current) return;
    migrated.current = true;
    let raw: string | null = null;
    try { raw = localStorage.getItem(key); } catch { return; }
    if (!raw) return;
    let value: unknown;
    try { value = JSON.parse(raw); } catch { localStorage.removeItem(key); return; }
    saveSharedPref({ data: { key, value: JSON.stringify(value), onlyMissing: true } })
      .then((r) => { localStorage.removeItem(key); qc.setQueryData(sharedPrefsQuery.queryKey, { prefs: JSON.parse(r.prefs) as Record<string, unknown>, shared: true }); })
      .catch(() => setError("A böngészőben tárolt korábbi beállítás átvétele nem sikerült; itt megmaradt."));
  }, [q.data, key, qc]);

  const save = async (next: T) => {
    await qc.cancelQueries({ queryKey: sharedPrefsQuery.queryKey });
    const prev = qc.getQueryData<{ prefs: Record<string, unknown>; shared: boolean }>(sharedPrefsQuery.queryKey);
    qc.setQueryData(sharedPrefsQuery.queryKey, { shared: true, ...prev, prefs: { ...prev?.prefs, [key]: next } });
    try {
      const r = await saveSharedPref({ data: { key, value: JSON.stringify(next) } });
      qc.setQueryData(sharedPrefsQuery.queryKey, { prefs: JSON.parse(r.prefs) as Record<string, unknown>, shared: true });
      setError("");
      return true;
    } catch (e) {
      if (prev) qc.setQueryData(sharedPrefsQuery.queryKey, prev);
      setError(e instanceof Error && e.message ? e.message : "A mentés nem sikerült.");
      return false;
    }
  };
  return { value: server ?? initial, save, error, loading: q.isPending, loadError: q.error ? "A közös beállítások nem tölthetők be." : "" };
}
