import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMe } from "./auth.functions";
import { getMediaPrefs, saveMediaPref } from "./media-prefs.functions";
import type { MediaPrefKey } from "./media-preferences";

export function useMediaPref<T>(key: MediaPrefKey) {
  const me = useQuery({ queryKey: ["me"], queryFn: () => getMe(), staleTime: 60000 });
  const qc = useQueryClient();
  const queryKey = useMemo(
    () => ["media-prefs", me.data?.user?.id ?? "legacy"],
    [me.data?.user?.id],
  );
  const q = useQuery({
    queryKey,
    queryFn: () => getMediaPrefs(),
    enabled: !!me.data && (me.data.mode === "open" || !!me.data.user),
    staleTime: 30000,
  });
  const saveFn = useServerFn(saveMediaPref);
  const migrated = useRef(false);
  const [error, setError] = useState("");
  const [migrationPending, setMigrationPending] = useState(false);
  const prefs = useMemo(
    () => (q.data ? (JSON.parse(q.data.prefs) as Record<string, T>) : undefined),
    [q.data],
  );
  const value = prefs?.[key];
  useEffect(() => {
    if (!q.data || migrated.current) return;
    migrated.current = true;
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(key);
    } catch {
      return;
    }
    if (!raw) return;
    setMigrationPending(true);
    saveFn({ data: { key, value: raw, onlyMissing: true } })
      .then((r) => {
        qc.setQueryData(queryKey, r);
        try {
          localStorage.removeItem(key);
        } catch {
          /* migration was saved */
        }
      })
      .catch(() =>
        setError("A korábbi keresési beállítás átvétele nem sikerült; a böngészőben megmaradt."),
      ).finally(() => setMigrationPending(false));
  }, [q.data, key, qc, saveFn, queryKey]);
  const save = async (next: T) => {
    try {
      const r = await saveFn({ data: { key, value: JSON.stringify(next) } });
      qc.setQueryData(queryKey, r);
      setError("");
    } catch {
      setError("A beállítás mentése nem sikerült. Próbáld újra.");
    }
  };
  return {
    value,
    save,
    loading: q.isPending || migrationPending,
    error: error || (q.isError ? "A mentett keresési beállítások nem tölthetők be." : ""),
  };
}
