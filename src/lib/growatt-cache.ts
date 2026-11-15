export const SOLAR_REFRESH_MS = 5 * 60_000;
export const SOLAR_COOLDOWN_MS = 60 * 60_000;
export const SOLAR_SESSION_MS = 30 * 60_000;
export type SolarSession = { cookie: string; userId: string; expiresAt: number };

export function createSolarCache<T>(now = Date.now) {
  const entries = new Map<string, { value?: T; expiresAt: number; blockedUntil: number; pending?: Promise<T>; session?: SolarSession }>();
  return async (key: string, load: (session: SolarSession | undefined, saveSession: (session: SolarSession) => void) => Promise<T>): Promise<T> => {
    let entry = entries.get(key);
    if (!entry) { entry = { expiresAt: 0, blockedUntil: 0 }; entries.set(key, entry); }
    const current = entry;
    if (current.blockedUntil > now()) throw new Error("Growatt: a kapcsolat hibája után egy órára szüneteltetjük a próbálkozásokat. A Frissítés gomb sem indít új belépést ezalatt.");
    if (current.value !== undefined && current.expiresAt > now()) return current.value;
    if (current.pending) return current.pending;
    current.pending = Promise.resolve().then(() => load(current.session && current.session.expiresAt > now() ? current.session : undefined, (session) => { current.session = session; }))
      .then((value) => { current.value = value; current.expiresAt = now() + SOLAR_REFRESH_MS; return value; })
      .catch((error: unknown) => { current.blockedUntil = now() + SOLAR_COOLDOWN_MS; delete current.session; throw error; })
      .finally(() => { delete current.pending; });
    return current.pending;
  };
}