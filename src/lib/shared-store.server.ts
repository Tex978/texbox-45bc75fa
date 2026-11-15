// Server-side persistence so every browser/phone sees the same connections.
// Uses the Node fs module when available (Docker on the NAS); otherwise returns null and callers fall back to cookies.
type Fs = typeof import("node:fs");
const fs = (): Fs | null => { try { return (globalThis as any).process?.getBuiltinModule?.("node:fs") ?? null; } catch { return null; } };
const FILE = () => ((globalThis as any).process?.env?.DATA_FILE as string) || "/data/nas-state.json";
let cache: Record<string, string> | null = null;
function load(): Record<string, string> | null {
  const f = fs(); if (!f) return null;
  if (cache) return cache;
  try {
    const parsed: unknown = JSON.parse(f.readFileSync(FILE(), "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || Object.values(parsed).some(v => typeof v !== "string")) throw new Error("invalid state");
    cache = parsed as Record<string, string>;
  } catch (error) {
    if ((error as { code?: string }).code !== "ENOENT") throw new Error("A Synology mentett beállításai nem olvashatók. Ellenőrizd a data mappát és a jogosultságokat.");
    cache = {};
  }
  return cache;
}
export function storeGet(name: string): string | undefined | null {
  const s = load(); return s ? s[name] : null;
}
export function storeSet(name: string, value: string): boolean {
  const f = fs(); const s = load(); if (!f || !s) return false;
  const next = { ...s, [name]: value };
  try {
    const p = FILE();
    f.mkdirSync(p.replace(/\/[^/]*$/, "") || "/", { recursive: true });
    f.writeFileSync(`${p}.tmp`, JSON.stringify(next), { mode: 0o600 });
    f.renameSync(`${p}.tmp`, p);
    cache = next;
    return true;
  } catch { return false; }
}
export function storeAvailable(): boolean { return fs() !== null; }
export function readStoredCookie(name: string, readCookie: (name: string) => string | undefined): string | undefined {
  const stored = storeGet(name);
  if (stored !== null && stored !== undefined) return stored;
  const legacy = readCookie(name);
  if (legacy && stored === undefined && !storeSet(name, legacy)) throw new Error("A korábbi beállítások nem menthetők a Synologyra. Ellenőrizd a data mappa írási jogosultságát.");
  return legacy;
}
