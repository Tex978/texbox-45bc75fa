// Fail-closed persistence guard for the self-hosted data folder.
// An empty or different /data mount must never silently become a fresh, working instance:
// a marker file records which files this installation already created, and a brand-new folder
// needs an explicit, password-confirmed "new installation" step. TEXBOX_INSTANCE_ID (optional)
// binds the folder to the deployment. A marker cannot prove the right disk is mounted, it only
// makes a missing or swapped folder visible instead of looking like a first start.
type Fs = typeof import("node:fs");
const proc = () => (globalThis as any).process as NodeJS.Process | undefined;
const fsMod = (): Fs | null => {
  try {
    return (proc()?.getBuiltinModule?.("node:fs") as Fs | undefined) ?? null;
  } catch {
    return null;
  }
};
const env = (k: string) => (proc()?.env?.[k] as string | undefined) || undefined;
export const MARKER_NAME = ".texbox-instance.json";
export const NEW_INSTALL_PHRASE = "UJ TELEPITES";
export const stateFile = () => env("DATA_FILE") || "/data/nas-state.json";
export const dataDir = () => env("DATA_DIR") || stateFile().replace(/\/[^/]*$/, "") || "/data";
export const markerPath = () => `${dataDir()}/${MARKER_NAME}`;
export const dbPath = () => `${dataDir()}/texbox.db`;
const isHosted = () => globalThis.navigator?.userAgent === "Cloudflare-Workers";
// Unit tests run against fresh temp folders; only there may a new folder initialise itself.
const testAutoInit = () => !!env("VITEST") && env("TEXBOX_TEST_REQUIRE_INIT") !== "1";

export type Marker = {
  version: 1;
  instanceId: string;
  envBound: boolean;
  createdAt: string;
  origin: "new-install" | "existing-data";
  db: boolean;
  state: boolean;
};
export type GuardCode =
  | "dir-missing"
  | "dir-unreadable"
  | "marker-invalid"
  | "instance-mismatch"
  | "db-missing"
  | "state-missing"
  | "not-writable";
export type GuardState =
  | { status: "preview" }
  | { status: "ready"; marker: Marker }
  | { status: "adoptable" } // existing data without marker (installed before this guard)
  | { status: "new-install" }
  | { status: "blocked"; code: GuardCode; message: string };

export const GUARD_MESSAGES: Record<GuardCode, string> = {
  "dir-missing":
    "A data mappa nem található a konténerben. Ellenőrizd a docker-compose kötetét (forrás → /data); a TexBox üres mappával nem indul el.",
  "dir-unreadable": "A data mappa nem olvasható. Ellenőrizd a Synology mappajogosultságait.",
  "marker-invalid":
    "A data mappa telepítésjelzője sérült. A TexBox biztonsági okból nem indul; ne töröld a mappát, nézd meg a TELEPITES.md visszaállítási részét.",
  "instance-mismatch":
    "A csatolt data mappa egy másik TexBox-telepítéshez tartozik (TEXBOX_INSTANCE_ID eltér). Ellenőrizd, melyik mappa van csatolva.",
  "db-missing":
    "A fiókadatbázis (texbox.db) hiányzik, pedig ez a telepítés korábban létrehozta. A TexBox nem hoz létre helyette üreset: állítsd vissza mentésből, vagy csatold a helyes data mappát.",
  "state-missing":
    "A közös beállítások fájlja (nas-state.json) hiányzik, pedig korábban létezett. A TexBox nem indul üres beállításokkal: állítsd vissza mentésből, vagy csatold a helyes mappát.",
  "not-writable":
    "A data mappába nem lehet írni, ezért a telepítésjelző nem menthető. Ellenőrizd a mappajogosultságokat.",
};
const blocked = (code: GuardCode): GuardState => ({
  status: "blocked",
  code,
  message: GUARD_MESSAGES[code],
});

function readMarker(fs: Fs): Marker | null | "invalid" {
  let raw: string;
  try {
    raw = fs.readFileSync(markerPath(), "utf8");
  } catch (e) {
    return (e as { code?: string }).code === "ENOENT" ? null : "invalid";
  }
  try {
    const m = JSON.parse(raw) as Marker;
    if (m?.version !== 1 || typeof m.instanceId !== "string" || !m.instanceId) return "invalid";
    return { ...m, db: !!m.db, state: !!m.state, envBound: !!m.envBound };
  } catch {
    return "invalid";
  }
}
const exists = (fs: Fs, p: string) => {
  try {
    fs.statSync(p);
    return true;
  } catch {
    return false;
  }
};

/** Read-only evaluation: never creates, renames or writes anything. */
export function inspectGuard(): GuardState {
  const fs = fsMod();
  if (isHosted() || !fs) return { status: "preview" };
  const dir = dataDir();
  try {
    if (!fs.statSync(dir).isDirectory()) return blocked("dir-missing");
  } catch {
    return blocked("dir-missing");
  }
  try {
    fs.readdirSync(dir);
  } catch {
    return blocked("dir-unreadable");
  }
  const m = readMarker(fs);
  if (m === "invalid") return blocked("marker-invalid");
  const hasDb = exists(fs, dbPath());
  const hasState = exists(fs, stateFile());
  if (!m) return hasDb || hasState ? { status: "adoptable" } : { status: "new-install" };
  const id = env("TEXBOX_INSTANCE_ID");
  if (id && m.envBound && m.instanceId !== id) return blocked("instance-mismatch");
  if (m.db && !hasDb) return blocked("db-missing");
  if (m.state && !hasState) return blocked("state-missing");
  return { status: "ready", marker: m };
}

function writeMarker(fs: Fs, m: Marker) {
  const p = markerPath();
  fs.writeFileSync(`${p}.tmp`, JSON.stringify(m, null, 2), { mode: 0o600 });
  fs.renameSync(`${p}.tmp`, p);
}
function newMarker(origin: Marker["origin"], db: boolean, state: boolean): Marker {
  const id = env("TEXBOX_INSTANCE_ID");
  const c = proc()!.getBuiltinModule("node:crypto") as typeof import("node:crypto");
  return {
    version: 1,
    instanceId: id || c.randomUUID(),
    envBound: !!id,
    createdAt: new Date().toISOString(),
    origin,
    db,
    state,
  };
}

/** Write path used before opening storage: adopts pre-guard installations, binds a newly set instance ID. */
export function ensureReady(): GuardState {
  const g = inspectGuard();
  const fs = fsMod();
  if (!fs) return g;
  try {
    if (g.status === "adoptable") {
      writeMarker(fs, newMarker("existing-data", exists(fs, dbPath()), exists(fs, stateFile())));
      return inspectGuard();
    }
    if (g.status === "new-install" && testAutoInit()) {
      writeMarker(fs, newMarker("new-install", false, false));
      return inspectGuard();
    }
    const id = env("TEXBOX_INSTANCE_ID");
    if (g.status === "ready" && id && !g.marker.envBound) {
      writeMarker(fs, { ...g.marker, instanceId: id, envBound: true });
      return inspectGuard();
    }
  } catch {
    return blocked("not-writable");
  }
  return g;
}

/** Explicit, operator-confirmed first installation into an empty data folder. */
export function initializeNewInstall(phrase: string): void {
  if (phrase.trim().toUpperCase() !== NEW_INSTALL_PHRASE)
    throw new Error(`A megerősítéshez írd be pontosan: ${NEW_INSTALL_PHRASE}`);
  const g = inspectGuard();
  if (g.status !== "new-install")
    throw new Error(
      "Ez a data mappa nem üres vagy nem új telepítés; új telepítés itt nem indítható.",
    );
  const fs = fsMod()!;
  try {
    writeMarker(fs, newMarker("new-install", false, false));
  } catch {
    throw new Error(GUARD_MESSAGES["not-writable"]);
  }
}

/** Records that a storage file now exists, so its later disappearance is detected. */
export function markCreated(kind: "db" | "state") {
  const fs = fsMod();
  if (!fs) return;
  const m = readMarker(fs);
  if (!m || m === "invalid" || m[kind]) return;
  try {
    writeMarker(fs, { ...m, [kind]: true });
  } catch (e) {
    console.error("texbox marker update failed", (e as Error).message);
  }
}

export type FileCheck = {
  path: string;
  exists: boolean;
  readable: boolean;
  writable: boolean;
  size: number | null;
  modified: string | null;
};
export type StorageReport = {
  guard: GuardState["status"];
  guardCode: GuardCode | null;
  guardMessage: string | null;
  dataDir: string;
  dataFile: string;
  dataFileInDataDir: boolean;
  instanceIdConfigured: boolean;
  marker: null | {
    origin: Marker["origin"];
    createdAt: string;
    envBound: boolean;
    tracksDb: boolean;
    tracksState: boolean;
  };
  dir: FileCheck;
  db: FileCheck;
  dbWal: FileCheck;
  state: FileCheck;
  backups: {
    count: number;
    newest: string | null;
    newestAt: string | null;
    phaseBackups: string[];
  };
  mount: { status: "separate-mount" | "container-filesystem" | "unknown"; detail: string };
};
function check(fs: Fs, p: string): FileCheck {
  const r: FileCheck = {
    path: p,
    exists: false,
    readable: false,
    writable: false,
    size: null,
    modified: null,
  };
  try {
    const st = fs.statSync(p);
    r.exists = true;
    r.size = st.isFile() ? st.size : null;
    r.modified = st.mtime.toISOString();
  } catch {
    return r;
  }
  try {
    fs.accessSync(p, fs.constants.R_OK);
    r.readable = true;
  } catch {
    /* no */
  }
  try {
    fs.accessSync(p, fs.constants.W_OK);
    r.writable = true;
  } catch {
    /* no */
  }
  return r;
}
/** Linux mountinfo: is the data folder its own bind mount, or part of the container's image layer? */
export function mountOf(dir: string, mountinfo: string | null): StorageReport["mount"] {
  if (!mountinfo)
    return {
      status: "unknown",
      detail: "A csatolási információ ebben a környezetben nem olvasható.",
    };
  const points = mountinfo
    .split("\n")
    .map((l) => l.split(" ")[4])
    .filter((x): x is string => !!x);
  const best = points
    .filter((m) => dir === m || dir.startsWith(m.endsWith("/") ? m : m + "/"))
    .sort((a, b) => b.length - a.length)[0];
  if (!best) return { status: "unknown", detail: "Nem található csatolási pont." };
  return best === "/"
    ? {
        status: "container-filesystem",
        detail:
          "A data mappa a konténer saját fájlrendszerén van: konténerfrissítéskor elveszhet. Csatold a NAS egy mappáját /data-ként.",
      }
    : { status: "separate-mount", detail: `Külön csatolt kötet: ${best}` };
}
/** Strictly read-only diagnostics: stats and access checks only, no file is opened for writing or created. */
export function storageReport(): StorageReport {
  const g = inspectGuard();
  const fs = fsMod();
  const dir = dataDir();
  const empty = (p: string): FileCheck => ({
    path: p,
    exists: false,
    readable: false,
    writable: false,
    size: null,
    modified: null,
  });
  const c = (p: string) => (fs ? check(fs, p) : empty(p));
  const m = fs ? readMarker(fs) : null;
  let backups: StorageReport["backups"] = {
    count: 0,
    newest: null,
    newestAt: null,
    phaseBackups: [],
  };
  if (fs) {
    try {
      const names = fs
        .readdirSync(`${dir}/backups`)
        .filter((n) => n.endsWith(".db"))
        .sort();
      const daily = names.filter((n) => /^texbox-\d{8}\.db$/.test(n));
      const newest = daily.at(-1) ?? null;
      backups = {
        count: names.length,
        newest,
        newestAt: newest ? check(fs, `${dir}/backups/${newest}`).modified : null,
        phaseBackups: names.filter((n) => n.startsWith("pre-")),
      };
    } catch {
      /* no backups folder */
    }
  }
  let mi: string | null = null;
  try {
    mi = fs ? fs.readFileSync("/proc/self/mountinfo", "utf8") : null;
  } catch {
    mi = null;
  }
  return {
    guard: g.status,
    guardCode: g.status === "blocked" ? g.code : null,
    guardMessage: g.status === "blocked" ? g.message : null,
    dataDir: dir,
    dataFile: stateFile(),
    dataFileInDataDir: stateFile().replace(/\/[^/]*$/, "") === dir,
    instanceIdConfigured: !!env("TEXBOX_INSTANCE_ID"),
    marker:
      m && m !== "invalid"
        ? {
            origin: m.origin,
            createdAt: m.createdAt,
            envBound: m.envBound,
            tracksDb: m.db,
            tracksState: m.state,
          }
        : null,
    dir: c(dir),
    db: c(dbPath()),
    dbWal: c(`${dbPath()}-wal`),
    state: c(stateFile()),
    backups,
    mount:
      isHosted() || !fs
        ? { status: "unknown", detail: "Előnézet: nem a NAS tárolója." }
        : mountOf(dir, mi),
  };
}
