// Server-side persistence so every browser/phone sees the same connections.
// Uses the Node fs module when available (Docker on the NAS); otherwise returns null and callers fall back to cookies.
type Fs = typeof import("node:fs");
const fs = (): Fs | null => {
  try {
    return (globalThis as any).process?.getBuiltinModule?.("node:fs") ?? null;
  } catch {
    return null;
  }
};
import { ensureReady, markCreated, stateFile, GUARD_MESSAGES } from "./data-guard.server";
const FILE = stateFile;
// Fail closed: a missing file is only "empty settings" on a confirmed, ready installation that never wrote one.
const requireReady = () => {
  const g = ensureReady();
  if (g.status === "blocked") throw new Error(g.message);
  if (g.status === "new-install")
    throw new Error("A TexBox új telepítése még nincs megerősítve; a beállítások nem menthetők.");
  return g;
};
let cache: Record<string, string> | null = null;
// Optional at-rest encryption (AES-256-GCM) keyed by TEXBOX_SECRET_KEY; values keep working unencrypted when it is unset.
const secretKey = (): Buffer | null => {
  const raw = (globalThis as any).process?.env?.TEXBOX_SECRET_KEY as string | undefined;
  if (!raw) return null;
  const c = (globalThis as any).process.getBuiltinModule(
    "node:crypto",
  ) as typeof import("node:crypto");
  return c.createHash("sha256").update(raw).digest();
};
const ENC = "enc:v1:";
export function encryptValue(v: string, key: Buffer): string {
  const c = (globalThis as any).process.getBuiltinModule(
    "node:crypto",
  ) as typeof import("node:crypto");
  const iv = c.randomBytes(12);
  const ci = c.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([ci.update(v, "utf8"), ci.final()]);
  return ENC + [iv, ci.getAuthTag(), ct].map((b) => b.toString("base64")).join(":");
}
export function decryptValue(v: string, key: Buffer | null): string {
  if (!v.startsWith(ENC)) return v;
  if (!key)
    throw new Error(
      "A mentett kapcsolati adatok titkosítva vannak, de hiányzik a TEXBOX_SECRET_KEY. Add meg ugyanazt a kulcsot a docker-compose-ban.",
    );
  const c = (globalThis as any).process.getBuiltinModule(
    "node:crypto",
  ) as typeof import("node:crypto");
  const [iv, tag, ct] = v
    .slice(ENC.length)
    .split(":")
    .map((x) => Buffer.from(x, "base64"));
  const d = c.createDecipheriv("aes-256-gcm", key, iv!);
  d.setAuthTag(tag!);
  try {
    return Buffer.concat([d.update(ct!), d.final()]).toString("utf8");
  } catch {
    throw new Error(
      "A TEXBOX_SECRET_KEY nem egyezik azzal, amivel a beállítások titkosítva lettek.",
    );
  }
}
function load(): Record<string, string> | null {
  const f = fs();
  if (!f) return null;
  if (cache) return cache;
  try {
    const parsed: unknown = JSON.parse(f.readFileSync(FILE(), "utf8"));
    if (
      !parsed ||
      typeof parsed !== "object" ||
      Array.isArray(parsed) ||
      Object.values(parsed).some((v) => typeof v !== "string")
    )
      throw new Error("invalid state");
    const key = secretKey();
    cache = Object.fromEntries(
      Object.entries(parsed as Record<string, string>).map(([k, v]) => [k, decryptValue(v, key)]),
    );
    if (key && Object.values(parsed as Record<string, string>).some((v) => !v.startsWith(ENC)))
      persist(f, cache); // migrate plaintext once
  } catch (error) {
    if ((error as { code?: string }).code !== "ENOENT")
      throw error instanceof Error && error.message.includes("TEXBOX_SECRET_KEY")
        ? error
        : new Error(
            "A Synology mentett beállításai nem olvashatók. Ellenőrizd a data mappát és a jogosultságokat.",
          );
    const g = requireReady();
    if (g.status === "ready" && g.marker.state) throw new Error(GUARD_MESSAGES["state-missing"]);
    cache = {};
  }
  return cache;
}
export function storeGet(name: string): string | undefined | null {
  const s = load();
  return s ? s[name] : null;
}
export function storeSet(name: string, value: string): boolean {
  const f = fs();
  const s = load();
  if (!f || !s) return false;
  const next = { ...s, [name]: value };
  if (!persist(f, next)) return false;
  cache = next;
  return true;
}
function persist(f: Fs, data: Record<string, string>): boolean {
  try {
    requireReady();
    const key = secretKey();
    const p = FILE();
    const out = key
      ? Object.fromEntries(Object.entries(data).map(([k, v]) => [k, encryptValue(v, key)]))
      : data;
    f.writeFileSync(`${p}.tmp`, JSON.stringify(out), { mode: 0o600 });
    f.renameSync(`${p}.tmp`, p);
    markCreated("state");
    return true;
  } catch {
    return false;
  }
}
export function storeAvailable(): boolean {
  return fs() !== null;
}
export function readStoredCookie(
  name: string,
  readCookie: (name: string) => string | undefined,
): string | undefined {
  const stored = storeGet(name);
  if (stored !== null && stored !== undefined) return stored;
  const legacy = readCookie(name);
  if (legacy && stored === undefined && !storeSet(name, legacy))
    throw new Error(
      "A korábbi beállítások nem menthetők a Synologyra. Ellenőrizd a data mappa írási jogosultságát.",
    );
  return legacy;
}
