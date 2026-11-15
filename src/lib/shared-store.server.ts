// Server-side persistence so every browser/phone sees the same connections.
// Uses the Node fs module when available (Docker on the NAS); otherwise returns null and callers fall back to cookies.
type Fs = typeof import("node:fs");
const fs = (): Fs | null => { try { return (globalThis as any).process?.getBuiltinModule?.("node:fs") ?? null; } catch { return null; } };
const FILE = () => ((globalThis as any).process?.env?.DATA_FILE as string) || "/data/nas-state.json";
let cache: Record<string, string> | null = null;
function load(): Record<string, string> | null {
  const f = fs(); if (!f) return null;
  if (cache) return cache;
  try { cache = JSON.parse(f.readFileSync(FILE(), "utf8")); } catch { cache = {}; }
  return cache;
}
export function storeGet(name: string): string | undefined | null {
  const s = load(); return s ? s[name] : null;
}
export function storeSet(name: string, value: string): boolean {
  const f = fs(); const s = load(); if (!f || !s) return false;
  s[name] = value;
  try { const p = FILE(); f.mkdirSync(p.replace(/\/[^/]*$/, "") || "/", { recursive: true }); f.writeFileSync(p, JSON.stringify(s)); return true; } catch { return false; }
}
