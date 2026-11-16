import { createServerFn } from "@tanstack/react-start";
import {
  getCookie as readBrowserCookie,
  setCookie as writeBrowserCookie,
  getRequest,
} from "@tanstack/react-start/server";
import { storeGet, storeSet, storeAvailable, readStoredCookie } from "./shared-store.server";
import { requirePermission, SESSION_COOKIE } from "./auth.server";
import type { Permission } from "./permissions";
// Family-account permission check (no-op until the first admin account exists).
const guard = (perm?: Permission) => requirePermission(readBrowserCookie(SESSION_COOKIE), perm);
// Shared server-side store first (same data on every device), browser cookie as fallback/migration source.
const getCookie = (name: string): string | undefined => {
  const existing = storeGet(name);
  if (existing != null) return existing;
  if (readBrowserCookie(name)) guard("settings"); // Only admins may import missing legacy connection/session settings.
  return readStoredCookie(name, readBrowserCookie);
};
const setCookie = (name: string, value: string, opts: Parameters<typeof writeBrowserCookie>[2]) => {
  const saved = storeSet(name, value);
  if (!saved && storeAvailable())
    throw new Error(
      "Nem sikerült a Synologyra menteni. Ellenőrizd a data mappa csatolását és írási jogosultságát; a beállítások nem lettek elmentve.",
    );
  if (saved) {
    // Expire the legacy copy only after durable persistence succeeds.
    writeBrowserCookie(name, "", { ...opts, maxAge: 0 });
  } else throw new Error("A titkos kapcsolati adatokhoz tartós NAS-tárolás szükséges.");
};
import { parseSolarFlow, type SolarFlow } from "./solar-readings";
import { md5 } from "./md5";
import { createSolarCache, SOLAR_SESSION_MS } from "./growatt-cache";
import {
  MIX_TYPE,
  parseMixHistory,
  parsePlantDetail,
  SPAN_TYPE,
  validHistoryDate,
  weekDays,
  type HistoryPoint,
  type HistorySpan,
  type MixRow,
} from "./growatt-history";
import { parseGreeUnits, validateGreeCommand } from "./gree-rules";
import { volumes, streams, recent, torrents, catalog, library } from "./mock";
import {
  filterMedia,
  mapArrMedia,
  imdbIdentifier,
  imdbScore,
  type MediaType,
  type MediaCategory,
  type MediaItem,
  type MediaDetail,
} from "./media";
import { mediaDemo } from "./media-demo";
import { pickProviders, streamParams, type Provider, type StreamMode } from "./streaming";
import {
  activeCount,
  discoverParams,
  matchesAvailability,
  matchesRaw,
  needsDiscover,
  normalizeFilters,
  type MediaFilters,
} from "./media-filters";
import { homeConnectFailure } from "./home-connect";
import { mergeThermometerMeta, type ThermometerMeta } from "./thermometer-meta";

const COOKIE = "nas-cfg";
export const FIELDS = [
  "TMDB_TOKEN",
  "OMDB_KEY",
  "QBIT_URL",
  "QBIT_USER",
  "QBIT_PASS",
  "RADARR_URL",
  "RADARR_KEY",
  "SONARR_URL",
  "SONARR_KEY",
  "PLEX_URL",
  "PLEX_TOKEN",
  "DSM_URL",
  "DSM_USER",
  "DSM_PASS",
  "GROWATT_USER",
  "GROWATT_PASS",
  "GROWATT_SERVER",
  "GROWATT_SN",
  "BLINDS_IP",
  "BLINDS_KEY",
  "BLINDS_NAMES",
  "XIAOMI_USER",
  "XIAOMI_PASS",
  "XIAOMI_REGION",
  "HC_CLIENT_ID",
  "GREE_UNITS",
  "GREE_USER",
  "GREE_PASS",
  "GREE_REGION",
] as const;
const SECRET = [
  "TMDB_TOKEN",
  "OMDB_KEY",
  "GREE_PASS",
  "XIAOMI_PASS",
  "BLINDS_KEY",
  "GROWATT_PASS",
  "DSM_PASS",
  "QBIT_PASS",
  "RADARR_KEY",
  "SONARR_KEY",
  "PLEX_TOKEN",
];
const readCfg = (): Record<string, string> => {
  const value = getCookie(COOKIE);
  try {
    return JSON.parse(value || "{}");
  } catch {
    return {};
  }
};
const env = (k: string) => {
  const v = readCfg()[k] || process.env[k] || "";
  if (SECRET.includes(k)) return v;
  const t = v.trim().replace(/\/+$/, "");
  return k.endsWith("_URL") && t && !/^https?:\/\//i.test(t) ? `http://${t}` : t;
};

export const getConfig = createServerFn({ method: "GET" }).handler(async () => {
  guard("settings");
  const out: Record<string, string> = {};
  for (const f of FIELDS) out[f] = SECRET.includes(f) ? (env(f) ? "__set__" : "") : env(f);
  return out;
});
export const getConnectionStorage = createServerFn({ method: "GET" }).handler(async () => {
  guard("settings");
  getCookie(COOKIE);
  return { shared: storeAvailable(), saved: Boolean(storeGet(COOKIE)) };
});

export const saveConfig = createServerFn({ method: "POST" })
  .inputValidator((d: Record<string, string>) => d)
  .handler(async ({ data }) => {
    guard("settings");
    const cur = readCfg();
    const next: Record<string, string> = {};
    for (const f of FIELDS) {
      const v = SECRET.includes(f) ? (data[f] ?? "") : (data[f] ?? "").trim();
      next[f] = SECRET.includes(f) && (v === "" || v === "__set__") ? cur[f] || "" : v;
    }
    writeCfg(next);
    return { ok: true };
  });
function writeCfg(next: Record<string, string>) {
  const https =
    getRequest().url.startsWith("https") ||
    getRequest().headers.get("x-forwarded-proto") === "https";
  setCookie(COOKIE, JSON.stringify(next), {
    httpOnly: true,
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    ...(https
      ? { sameSite: "none" as const, secure: true, partitioned: true }
      : { sameSite: "lax" as const }),
  });
}
const has = (...k: string[]) => k.every((x) => env(x));
const isDemo = () =>
  !has("DSM_URL") &&
  !has("QBIT_URL") &&
  !has("RADARR_URL") &&
  !has("SONARR_URL") &&
  !has("PLEX_URL");

async function arr(app: "RADARR" | "SONARR", path: string, init?: RequestInit) {
  const r = await fetch(`${env(app + "_URL")}/api/v3${path}`, {
    ...init,
    headers: { "X-Api-Key": env(app + "_KEY"), "Content-Type": "application/json" },
  });
  if (!r.ok) throw new Error(`${app} ${r.status}`);
  return r.json();
}
async function dsmVolumes() {
  const base = env("DSM_URL");
  const a = await (
    await fetch(
      `${base}/webapi/entry.cgi?api=SYNO.API.Auth&version=6&method=login&account=${encodeURIComponent(env("DSM_USER"))}&passwd=${encodeURIComponent(env("DSM_PASS"))}&format=sid`,
    )
  ).json();
  if (!a.success)
    throw new Error(
      `Synology belépés sikertelen (kód ${a.error?.code}${a.error?.code === 403 ? ": kétlépcsős azonosítás be van kapcsolva" : ""})`,
    );
  const r = await (
    await fetch(
      `${base}/webapi/entry.cgi?api=SYNO.Storage.CGI.Storage&version=1&method=load_info&_sid=${a.data.sid}`,
    )
  ).json();
  if (!r.success) throw new Error(`Synology tárhely lekérés hiba (kód ${r.error?.code})`);
  return (r.data.volumes as any[]).map((v) => ({
    name: `${v.display_name || v.vol_path}${v.status && v.status !== "normal" ? ` · ${v.status}` : ""}`,
    used: +(Number(v.size.used) / 1e12).toFixed(2),
    total: +(Number(v.size.total) / 1e12).toFixed(2),
  }));
}
async function plex(path: string) {
  const sep = path.includes("?") ? "&" : "?";
  const r = await fetch(`${env("PLEX_URL")}${path}${sep}X-Plex-Token=${env("PLEX_TOKEN")}`, {
    headers: { Accept: "application/json" },
  });
  if (!r.ok) throw new Error(`Plex ${r.status}`);
  return (await r.json()).MediaContainer;
}
async function qbit(path: string, body?: Record<string, string>) {
  const base = env("QBIT_URL");
  const login = await fetch(`${base}/api/v2/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Referer: base, Origin: base },
    body: new URLSearchParams({ username: env("QBIT_USER"), password: env("QBIT_PASS") }),
  });
  const lt = (await login.text()).trim();
  if (login.status === 403)
    throw new Error(
      "qBittorrent 403: túl sok hibás belépés miatt kitiltott IP, vagy a Host fejléc ellenőrzés tiltja",
    );
  if (/^fails/i.test(lt))
    throw new Error(
      `qBittorrent: hibás felhasználónév vagy jelszó (felhasználó: "${env("QBIT_USER")}", jelszó hossza: ${env("QBIT_PASS").length})`,
    );
  // qBittorrent 5.x answers a successful login with 204 and an empty body
  if (!/^ok/i.test(lt) && !(login.ok && lt === ""))
    throw new Error(
      `qBittorrent: váratlan válasz (${login.status}): ${lt
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .slice(0, 120)}`,
    );
  // qBittorrent 5.x names the cookie QBT_SID_<port>, older versions SID
  const sid = (login.headers.get("set-cookie") || "").match(/(QBT_SID_\d+|SID)=[^;]+/)?.[0] || "";
  const r = await fetch(`${base}/api/v2${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Cookie: sid,
      Referer: base,
      Origin: base,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body ? new URLSearchParams(body) : null,
  });
  if (!r.ok) throw new Error(`qBittorrent ${r.status}`);
  const t = await r.text();
  try {
    return JSON.parse(t);
  } catch {
    return t;
  }
}
const safe = async <T>(p: Promise<T>, fb: T) => {
  try {
    return await p;
  } catch {
    return fb;
  }
};
const fmtSize = (b: number) =>
  b > 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${(b / 1e6).toFixed(0)} MB`;
const fmtEta = (s: number) =>
  s >= 8640000
    ? "—"
    : s > 3600
      ? `${Math.round(s / 3600)} óra`
      : `${Math.max(1, Math.round(s / 60))} perc`;

export const getOverview = createServerFn({ method: "GET" }).handler(async () => {
  if (isDemo())
    return {
      demo: true,
      volumes,
      streams,
      recent: recent.map((r) => ({ ...r, thumb: "" })),
      watched: recent
        .slice()
        .reverse()
        .map((r) => ({ ...r, thumb: "", who: "Apa" })),
    };
  const dsm = has("DSM_URL") ? await safe(dsmVolumes(), []) : [];
  const disks = dsm.length
    ? []
    : has("RADARR_URL")
      ? await safe(arr("RADARR", "/diskspace"), [])
      : [];
  const seen = new Set<number>();
  const vols = (disks as { path: string; freeSpace: number; totalSpace: number }[])
    .filter((d) => d.totalSpace > 1e11 && !seen.has(d.totalSpace) && seen.add(d.totalSpace))
    .map((d) => ({
      name: d.path,
      used: +((d.totalSpace - d.freeSpace) / 1e12).toFixed(1),
      total: +(d.totalSpace / 1e12).toFixed(1),
    }));
  if (dsm.length) vols.push(...dsm);
  const watched: {
    title: string;
    year: number;
    type: string;
    hue: number;
    thumb: string;
    who: string;
  }[] = [];
  let st: typeof streams = [],
    rc: { title: string; year: number; type: string; hue: number; thumb: string }[] = [];
  if (has("PLEX_URL")) {
    const s = await safe(plex("/status/sessions"), { Metadata: [] });
    st = (s.Metadata || []).map((m: any) => ({
      user: m.User?.title || "?",
      title: m.grandparentTitle ? `${m.grandparentTitle} – ${m.title}` : m.title,
      device: m.Player?.product || m.Player?.title || "",
      quality: m.Media?.[0]?.videoResolution ? `${m.Media[0].videoResolution}` : "",
      mode: m.TranscodeSession ? "Transcode" : "Direct Play",
      progress: m.duration ? Math.round((m.viewOffset / m.duration) * 100) : 0,
    }));
    const r = await safe(
      plex("/library/recentlyAdded?X-Plex-Container-Start=0&X-Plex-Container-Size=12"),
      { Metadata: [] },
    );
    rc = (r.Metadata || []).map((m: any, i: number) => ({
      title: m.parentTitle && m.type === "season" ? m.parentTitle : m.title,
      year: m.year || m.parentYear || 0,
      type: m.type === "movie" ? "Film" : "Sorozat",
      hue: (i * 47) % 360,
      thumb: m.thumb || m.parentThumb || "",
    }));
    const h = await safe(
      plex(
        "/status/sessions/history/all?sort=viewedAt:desc&X-Plex-Container-Start=0&X-Plex-Container-Size=30",
      ),
      { Metadata: [] },
    );
    const accts = await safe(plex("/accounts"), { Account: [] });
    const names = new Map((accts.Account || []).map((a: any) => [a.id, a.name]));
    const seenT = new Set<string>();
    for (const m of h.Metadata || []) {
      const title = m.grandparentTitle || m.title;
      if (seenT.has(title)) continue;
      seenT.add(title);
      watched.push({
        title,
        year: m.year || 0,
        type: m.type === "movie" ? "Film" : "Sorozat",
        hue: (watched.length * 61) % 360,
        thumb: m.grandparentThumb || m.thumb || "",
        who: String(names.get(m.accountID) || ""),
      });
      if (watched.length >= 12) break;
    }
  }
  return { demo: false, volumes: vols, streams: st, recent: rc, watched };
});

export const getTorrents = createServerFn({ method: "GET" }).handler(async () => {
  if (!has("QBIT_URL"))
    return { demo: true, list: torrents.map((t) => ({ ...t, hash: String(t.id) })) };
  const l = await qbit("/torrents/info");
  return {
    demo: false,
    list: (l as any[]).map((t, i) => ({
      id: i,
      hash: t.hash,
      name: t.name,
      size: fmtSize(t.size),
      progress: Math.round(t.progress * 100),
      down: +(t.dlspeed / 1e6).toFixed(1),
      up: +(t.upspeed / 1e6).toFixed(1),
      eta: t.progress >= 1 ? "Kész" : fmtEta(t.eta),
      paused: /paused|stopped/i.test(t.state),
    })),
  };
});

export const torrentAction = createServerFn({ method: "POST" })
  .inputValidator((d: { hash: string; action: "pause" | "resume" | "delete" }) => d)
  .handler(async ({ data }) => {
    guard("downloads");
    if (!has("QBIT_URL")) return { ok: true };
    if (data.action === "delete")
      await qbit("/torrents/delete", { hashes: data.hash, deleteFiles: "false" });
    else {
      const v5 = data.action === "pause" ? "/torrents/stop" : "/torrents/start";
      const v4 = data.action === "pause" ? "/torrents/pause" : "/torrents/resume";
      await qbit(v5, { hashes: data.hash }).catch(() => qbit(v4, { hashes: data.hash }));
    }
    return { ok: true };
  });

export const searchMedia = createServerFn({ method: "GET" })
  .inputValidator((d: { q: string }) => d)
  .handler(async ({ data }) => {
    const q = data.q.trim();
    if (!q) return [];
    if (!has("RADARR_URL") && !has("SONARR_URL"))
      return catalog
        .filter((c) => c.title.toLowerCase().includes(q.toLowerCase()))
        .map((c, i) => ({ ...c, id: i, inLibrary: false, poster: "", overview: "" }));
    const t = encodeURIComponent(q);
    const [m, s] = await Promise.all([
      has("RADARR_URL") ? safe(arr("RADARR", `/movie/lookup?term=${t}`), []) : [],
      has("SONARR_URL") ? safe(arr("SONARR", `/series/lookup?term=${t}`), []) : [],
    ]);
    return [
      ...(m as any[]).slice(0, 10).map((x) => ({
        id: x.tmdbId,
        title: x.title,
        year: x.year,
        type: "Film",
        inLibrary: !!x.id,
        poster: posterOf(x),
        overview: x.overview || "",
      })),
      ...(s as any[]).slice(0, 10).map((x) => ({
        id: x.tvdbId,
        title: x.title,
        year: x.year,
        type: "Sorozat",
        inLibrary: !!x.id,
        poster: posterOf(x),
        overview: x.overview || "",
      })),
    ];
  });

export const requestMedia = createServerFn({ method: "POST" })
  .inputValidator((d: { id: number; type: string; profile: string }) => d)
  .handler(async ({ data }) => {
    guard("request");
    const app = data.type === "Film" ? "RADARR" : "SONARR";
    if (!has(app + "_URL")) return { ok: true };
    const [profiles, roots] = await Promise.all([
      arr(app, "/qualityprofile"),
      arr(app, "/rootfolder"),
    ]);
    const want = data.profile.toLowerCase().replace("4k", "2160");
    const prof =
      (profiles as any[]).find((p) => p.name.toLowerCase().replace("4k", "2160").includes(want)) ||
      profiles[0];
    const root = roots[0]?.path;
    const look = await arr(
      app,
      app === "RADARR"
        ? `/movie/lookup/tmdb?tmdbId=${data.id}`
        : `/series/lookup?term=tvdb:${data.id}`,
    );
    const item = Array.isArray(look) ? look[0] : look;
    const body =
      app === "RADARR"
        ? {
            ...item,
            qualityProfileId: prof.id,
            rootFolderPath: root,
            monitored: true,
            addOptions: { searchForMovie: true },
          }
        : {
            ...item,
            qualityProfileId: prof.id,
            languageProfileId: 1,
            rootFolderPath: root,
            monitored: true,
            seasonFolder: true,
            addOptions: { searchForMissingEpisodes: true },
          };
    await arr(app, app === "RADARR" ? "/movie" : "/series", {
      method: "POST",
      body: JSON.stringify(body),
    });
    return { ok: true };
  });

export const getStatus = createServerFn({ method: "GET" }).handler(async () => {
  guard("settings");
  const ping = async (ok: boolean, p: () => Promise<unknown>) =>
    !ok
      ? "nincs beállítva"
      : await p().then(
          () => "ok",
          (e) => {
            const c = e?.cause;
            const code = c?.code || c?.cause?.code || "";
            const hint = /ECONNREFUSED/.test(code)
              ? "a port zárva / rossz port"
              : /ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT|EHOSTUNREACH/.test(code)
                ? "időtúllépés: a cím kívülről nem érhető el"
                : /ENOTFOUND|EAI_AGAIN/.test(code)
                  ? "a címnév nem található"
                  : /CERT|SSL|TLS/i.test(code + (c?.message || ""))
                    ? "tanúsítvány hiba, próbáld http://-vel"
                    : "";
            return `${e?.message || e}${code ? ` (${code})` : ""}${hint ? ` – ${hint}` : ""}`;
          },
        );
  return {
    qbit: await ping(has("QBIT_URL"), () => qbit("/app/version")),
    radarr: await ping(has("RADARR_URL", "RADARR_KEY"), () => arr("RADARR", "/system/status")),
    sonarr: await ping(has("SONARR_URL", "SONARR_KEY"), () => arr("SONARR", "/system/status")),
    plex: await ping(has("PLEX_URL", "PLEX_TOKEN"), () => plex("/identity")),
    blinds: await ping(has("BLINDS_IP", "BLINDS_KEY"), async () =>
      (await import("./blinds.server")).listBlinds(env("BLINDS_IP"), env("BLINDS_KEY")),
    ),
    growatt: await ping(has("GROWATT_USER", "GROWATT_PASS"), () => growatt()),
    dsm: await ping(has("DSM_URL", "DSM_USER"), () => dsmVolumes()),
    xiaomi: await ping(has("XIAOMI_USER", "XIAOMI_PASS"), async () =>
      (await import("./xiaomi.server")).listThermometers(
        env("XIAOMI_USER"),
        env("XIAOMI_PASS"),
        (env("XIAOMI_REGION") || "de").toLowerCase(),
      ),
    ),
  };
});

const posterOf = (x: any): string =>
  x.remotePoster || (x.images || []).find((i: any) => i.coverType === "poster")?.remoteUrl || "";

async function tmdb(path: string, params: Record<string, string> = {}): Promise<any> {
  const response = await fetch(
    `https://api.themoviedb.org/3${path}?${new URLSearchParams({ language: "hu-HU", ...params })}`,
    {
      headers: { Authorization: `Bearer ${env("TMDB_TOKEN")}` },
      signal: AbortSignal.timeout(12000),
    },
  );
  if (!response.ok)
    throw new Error(
      response.status === 401
        ? "A TMDB hozzáférést nem fogadta el a szolgáltató."
        : "A TMDB filmadatok most nem érhetők el.",
    );
  return response.json();
}
const tmdbImage = (path: string | undefined, size = "w500") =>
  path ? `https://image.tmdb.org/t/p/${size}${path}` : "";
async function omdbRating(id: string | null): Promise<number | null> {
  if (!id || !has("OMDB_KEY")) return null;
  try {
    const response = await fetch(
      `https://www.omdbapi.com/?${new URLSearchParams({ apikey: env("OMDB_KEY"), i: id })}`,
      { signal: AbortSignal.timeout(7000) },
    );
    if (!response.ok) return null;
    return imdbScore((await response.json()).imdbRating);
  } catch {
    return null;
  }
}
async function tmdbItem(x: any, type: MediaType): Promise<MediaItem | null> {
  const kind = type === "Film" ? "movie" : "tv";
  const ids = await tmdb(`/${kind}/${x.id}/external_ids`);
  const id = type === "Film" ? x.id : ids.tvdb_id;
  if (!id) return null; // Sonarr requests require TVDB IDs, never TMDB IDs.
  const imdbId = imdbIdentifier(ids.imdb_id);
  return {
    id,
    tmdbId: x.id,
    type,
    title: x.title || x.name,
    year: Number((x.release_date || x.first_air_date || "").slice(0, 4)),
    poster: tmdbImage(x.poster_path),
    overview: x.overview || "",
    inLibrary: false,
    imdbId,
    imdbRating: await omdbRating(imdbId),
  };
}

export const browseMedia = createServerFn({ method: "GET" })
  .inputValidator(
    (d: {
      type: MediaType;
      category: MediaCategory;
      q: string;
      page: number;
      filters?: Partial<MediaFilters>;
    }) => {
      if (
        !["Film", "Sorozat"].includes(d.type) ||
        !["recommended", "new", "popular", "trending"].includes(d.category)
      )
        throw new Error("Ismeretlen kategória.");
      return {
        ...d,
        q: d.q.trim().slice(0, 150),
        page: Math.max(1, Math.min(50, Math.floor(d.page) || 1)),
        filters: normalizeFilters(d.filters, d.type),
      };
    },
  )
  .handler(async ({ data }) => {
    const app = data.type === "Film" ? "RADARR" : "SONARR";
    const kind = data.type === "Film" ? "movie" : "tv";
    const f = data.filters;
    const discover = !data.q && needsDiscover(f);
    const result = (all: MediaItem[], notice = "", demo = false, hasMore = false) => ({
      notice:
        notice ||
        (!has("TMDB_TOKEN") && needsDiscover(f)
          ? "Műfaj, év és értékelés szerinti szűréshez TMDB-kapcsolat szükséges."
          : ""),
      items: all.filter((i) => matchesAvailability(i.inLibrary, f.availability)),
      demo,
      hasMore,
      filtered: activeCount(f) > 0,
    });
    try {
      if (has("TMDB_TOKEN")) {
        let path = data.q
          ? `/search/${kind}`
          : discover
            ? `/discover/${kind}`
            : data.category === "trending"
              ? `/trending/${kind}/week`
              : data.category === "new"
                ? `/discover/${kind}`
                : `/${kind}/popular`;
        let personalized = false;
        if (
          !data.q &&
          !discover &&
          data.category === "recommended" &&
          has(app + "_URL", app + "_KEY")
        ) {
          const owned = await arr(app, kind === "movie" ? "/movie" : "/series");
          const seed = [...owned]
            .filter((x: any) => x.tmdbId)
            .sort((a: any, b: any) => String(b.added).localeCompare(String(a.added)))[0];
          if (seed) {
            path = `/${kind}/${seed.tmdbId}/recommendations`;
            personalized = true;
          }
        }
        const today = new Date().toISOString().slice(0, 10);
        const since = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
        const params: Record<string, string> = { page: String(data.page), include_adult: "false" };
        if (data.q) params["query"] = data.q;
        if (discover) Object.assign(params, discoverParams(kind, f));
        if (!data.q && data.category === "new") {
          if (!discover) params["sort_by"] = "popularity.desc";
          if (!f.yearFrom)
            params[kind === "movie" ? "primary_release_date.gte" : "first_air_date.gte"] = since;
          if (!f.yearTo)
            params[kind === "movie" ? "primary_release_date.lte" : "first_air_date.lte"] = today;
        }
        const response = await tmdb(path, params);
        // Text search ignores discover filters, so they are applied to the returned page.
        if (data.q || (data.category === "trending" && !discover))
          response.results = response.results.filter((x: any) => matchesRaw(x, f));
        const items: MediaItem[] = [];
        // Batches bound simultaneous metadata requests and preserve provider order.
        for (let i = 0; i < response.results.length; i += 4) {
          const batch = await Promise.all(
            response.results.slice(i, i + 4).map((x: any) => tmdbItem(x, data.type)),
          );
          for (const item of batch) if (item) items.push(item);
        }
        if (has(app + "_URL", app + "_KEY")) {
          const owned = await safe(arr(app, kind === "movie" ? "/movie" : "/series"), []);
          for (const item of items) {
            const match = owned.find(
              (x: any) => (kind === "movie" ? x.tmdbId : x.tvdbId) === item.id,
            );
            item.inLibrary = !!match;
            if (match && item.imdbRating === null)
              item.imdbRating = imdbScore(match.ratings?.imdb?.value);
          }
        }
        return result(
          items,
          !data.q && !discover && data.category === "recommended" && !personalized
            ? "Személyes előzmény még nincs · népszerű válogatás"
            : "",
          false,
          data.page < response.total_pages,
        );
      }
      if (!has(app + "_URL", app + "_KEY"))
        return result(
          filterMedia(mediaDemo, data.type, data.q).filter(
            (i) => (!f.yearFrom || i.year >= f.yearFrom) && (!f.yearTo || i.year <= f.yearTo),
          ),
          "Bemutató kínálat · nem aktuális vagy személyre szabott ajánlás",
          true,
        );
      if (data.q) {
        const found = await arr(
          app,
          `${kind === "movie" ? "/movie" : "/series"}/lookup?term=${encodeURIComponent(data.q)}`,
        );
        return result(found.map((x: any) => mapArrMedia(x, data.type)));
      }
      if (data.type === "Sorozat")
        return result(
          [],
          "A sorozatos ajánlásokhoz, új megjelenésekhez és népszerű kínálathoz TMDB-kapcsolat szükséges.",
        );
      if (data.category === "new")
        return result([], "Az új megjelenésekhez TMDB-kapcsolat szükséges.");
      const found = await arr(
        "RADARR",
        `/importlist/movie?includeRecommendations=${data.category === "recommended"}&includePopular=${data.category === "popular"}&includeTrending=${data.category === "trending"}`,
      );
      return result(
        found
          .filter((x: any) => !x.isExisting && !x.isExcluded)
          .slice(0, 40)
          .map((x: any) => mapArrMedia(x, data.type)),
      );
    } catch (error) {
      return result(
        [],
        error instanceof Error && error.message.startsWith("A TMDB")
          ? error.message
          : "A filmkínálat nem érhető el. Ellenőrizd a kapcsolatot.",
      );
    }
  });

export const getStreaming = createServerFn({ method: "GET" })
  .inputValidator(
    (d: { type: MediaType; provider: number; mode: StreamMode; days: number; page: number }) => ({
      type: d.type === "Sorozat" ? ("Sorozat" as const) : ("Film" as const),
      provider: Math.max(0, Math.floor(Number(d.provider)) || 0),
      mode: d.mode === "popular" ? ("popular" as const) : ("new" as const),
      days: Number(d.days) || 30,
      page: Math.max(1, Math.min(20, Math.floor(d.page) || 1)),
    }),
  )
  .handler(async ({ data }) => {
    if (!has("TMDB_TOKEN"))
      return {
        configured: false,
        providers: [] as Provider[],
        items: [] as MediaItem[],
        hasMore: false,
        error: "",
      };
    const kind = data.type === "Film" ? "movie" : "tv";
    try {
      const providers = pickProviders(
        (await tmdb(`/watch/providers/${kind}`, { watch_region: "HU" })).results ?? [],
      );
      const ids =
        data.provider && providers.some((p) => p.id === data.provider)
          ? [data.provider]
          : providers.map((p) => p.id);
      if (!ids.length)
        return {
          configured: true,
          providers,
          items: [],
          hasMore: false,
          error: "A TMDB nem jelez magyarországi streaming szolgáltatót.",
        };
      const response = await tmdb(`/discover/${kind}`, {
        ...streamParams(kind, ids, data.mode, data.days),
        page: String(data.page),
      });
      const items: MediaItem[] = [];
      for (let i = 0; i < response.results.length; i += 4) {
        const batch = await Promise.all(
          response.results.slice(i, i + 4).map((x: any) => tmdbItem(x, data.type)),
        );
        for (const item of batch) if (item) items.push(item);
      }
      const app = data.type === "Film" ? "RADARR" : "SONARR";
      if (has(app + "_URL", app + "_KEY")) {
        const owned = await safe(arr(app, kind === "movie" ? "/movie" : "/series"), []);
        for (const item of items)
          item.inLibrary = owned.some(
            (x: any) => (kind === "movie" ? x.tmdbId : x.tvdbId) === item.id,
          );
      }
      return {
        configured: true,
        providers,
        items,
        hasMore: data.page < response.total_pages,
        error: "",
      };
    } catch (e) {
      return {
        configured: true,
        providers: [] as Provider[],
        items: [] as MediaItem[],
        hasMore: false,
        error:
          e instanceof Error && e.message.startsWith("A TMDB")
            ? e.message
            : "A streaming kínálat most nem érhető el.",
      };
    }
  });

export const getMediaDetail = createServerFn({ method: "GET" })
  .inputValidator((d: { id: number; type: MediaType; tmdbId?: number | undefined }) => {
    if (
      !Number.isSafeInteger(d.id) ||
      d.id <= 0 ||
      !["Film", "Sorozat"].includes(d.type) ||
      (d.tmdbId !== undefined && (!Number.isSafeInteger(d.tmdbId) || d.tmdbId <= 0))
    )
      throw new Error("Érvénytelen film.");
    return d;
  })
  .handler(async ({ data }): Promise<MediaDetail> => {
    const app = data.type === "Film" ? "RADARR" : "SONARR";
    let source: any = null;
    if (has(app + "_URL", app + "_KEY")) {
      const lookup = await safe(
        arr(
          app,
          data.type === "Film"
            ? `/movie/lookup/tmdb?tmdbId=${data.id}`
            : `/series/lookup?term=tvdb:${data.id}`,
        ),
        null,
      );
      source = Array.isArray(lookup) ? lookup[0] : lookup;
    }
    const fallback = mediaDemo.find((x) => x.type === data.type && x.id === data.id);
    if (!has("TMDB_TOKEN") && !source && fallback) return fallback;
    const base: MediaItem = source
      ? mapArrMedia(source, data.type)
      : {
          id: data.id,
          tmdbId: data.tmdbId,
          type: data.type,
          title: "Adatlap",
          year: 0,
          poster: "",
          overview: "",
          inLibrary: false,
          imdbId: null,
          imdbRating: null,
        };
    const detail: MediaDetail = {
      ...base,
      genres: source?.genres || [],
      runtime: source?.runtime || null,
      cast: [],
      images: [],
      trailers: [],
      demo: false,
      notice: "",
    };
    if (!has("TMDB_TOKEN")) {
      detail.images = (source?.images || [])
        .filter((x: any) => x.coverType === "fanart" && x.remoteUrl)
        .map((x: any) => x.remoteUrl);
      if (source?.youTubeTrailerId && /^[\w-]{11}$/.test(source.youTubeTrailerId))
        detail.trailers = [{ name: "Előzetes", key: source.youTubeTrailerId }];
      detail.notice =
        "A teljes szereplőlistához, fotókhoz és további előzetesekhez TMDB-kapcsolat szükséges.";
      return detail;
    }
    const tmdbId = data.type === "Film" ? data.id : source?.tmdbId || data.tmdbId;
    if (!tmdbId) {
      detail.notice = "A sorozat TMDB-azonosítója nem érhető el.";
      return detail;
    }
    const kind = data.type === "Film" ? "movie" : "tv";
    const full = await tmdb(`/${kind}/${tmdbId}`, {
      append_to_response: "credits,images,videos,external_ids",
      include_image_language: "hu,en,null",
      include_video_language: "hu,en",
    });
    detail.title = full.title || full.name;
    detail.poster = tmdbImage(full.poster_path);
    detail.overview = full.overview || source?.overview || "";
    detail.year = Number((full.release_date || full.first_air_date || "").slice(0, 4));
    detail.genres = full.genres?.map((x: any) => x.name) || [];
    detail.runtime = full.runtime || full.episode_run_time?.[0] || null;
    detail.imdbId = imdbIdentifier(full.imdb_id || full.external_ids?.imdb_id);
    detail.imdbRating = (await omdbRating(detail.imdbId)) || base.imdbRating;
    detail.cast = (full.credits?.cast || []).slice(0, 18).map((x: any) => ({
      name: x.name,
      character: x.character || "",
      photo: tmdbImage(x.profile_path, "w185"),
    }));
    detail.images = (full.images?.backdrops || [])
      .slice(0, 8)
      .map((x: any) => tmdbImage(x.file_path, "w780"));
    detail.trailers = (full.videos?.results || [])
      .filter(
        (x: any) =>
          x.site === "YouTube" &&
          ["Trailer", "Teaser"].includes(x.type) &&
          /^[\w-]{11}$/.test(x.key),
      )
      .slice(0, 2)
      .map((x: any) => ({ name: x.name, key: x.key }));
    return detail;
  });

export const getRecommendations = createServerFn({ method: "GET" }).handler(async () => {
  if (!has("RADARR_URL"))
    return catalog.map((c, i) => ({ ...c, id: i, inLibrary: false, poster: "", overview: "" }));
  const l = await safe(
    arr(
      "RADARR",
      "/importlist/movie?includeRecommendations=true&includeTrending=true&includePopular=true",
    ),
    [],
  );
  return (l as any[])
    .filter((x) => !x.isExisting && !x.isExcluded)
    .slice(0, 24)
    .map((x) => ({
      id: x.tmdbId,
      title: x.title,
      year: x.year,
      type: "Film",
      inLibrary: false,
      poster: posterOf(x),
      overview: x.overview || "",
    }));
});

export const getLibrary = createServerFn({ method: "GET" }).handler(async () => {
  if (!has("RADARR_URL") && !has("SONARR_URL")) return { demo: true, items: library };
  const [m, s] = await Promise.all([
    has("RADARR_URL") ? safe(arr("RADARR", "/movie"), []) : [],
    has("SONARR_URL") ? safe(arr("SONARR", "/series"), []) : [],
  ]);
  return {
    demo: false,
    items: [
      ...(m as any[])
        .filter((x) => x.sizeOnDisk > 0)
        .map((x) => ({
          id: x.id,
          title: x.title,
          year: x.year,
          type: "Film",
          size: x.sizeOnDisk,
          added: (x.movieFile?.dateAdded || x.added || "").slice(0, 10),
          poster: posterOf(x),
        })),
      ...(s as any[])
        .filter((x) => x.statistics?.sizeOnDisk > 0)
        .map((x) => ({
          id: x.id,
          title: x.title,
          year: x.year,
          type: "Sorozat",
          size: x.statistics.sizeOnDisk,
          added: (x.added || "").slice(0, 10),
          poster: posterOf(x),
        })),
    ],
  };
});

export const deleteMedia = createServerFn({ method: "POST" })
  .inputValidator((d: { id: number; type: string }) => d)
  .handler(async ({ data }) => {
    guard("downloads");
    const app = data.type === "Film" ? "RADARR" : "SONARR";
    if (!has(app + "_URL")) return { ok: true };
    const r = await fetch(
      `${env(app + "_URL")}/api/v3/${app === "RADARR" ? "movie" : "series"}/${data.id}?deleteFiles=true&addImportExclusion=false&addImportListExclusion=false`,
      { method: "DELETE", headers: { "X-Api-Key": env(app + "_KEY") } },
    );
    if (!r.ok && r.status !== 404) throw new Error(`${app} ${r.status}`);
    // let Plex notice the removed files
    if (has("PLEX_URL")) await safe(plex("/library/sections/all/refresh"), null);
    return { ok: true };
  });

// Growatt cloud (same account as the ShinePhone app). Unofficial API used by the app itself.
const growattHash = (pw: string) =>
  md5(pw)
    .split("")
    .map((c, i) => (i % 2 === 0 && c === "0" ? "c" : c))
    .join("");
type SolarData = Awaited<ReturnType<typeof fetchGrowatt>>;
const cachedSolar = createSolarCache<SolarData>();
// One Growatt login session per credential set, shared by live reads and history reads to avoid extra logins.
const growattSessions = new Map<string, { cookie: string; userId: string; expiresAt: number }>();
const validShared = (key: string) => {
  const x = growattSessions.get(key);
  return x && x.expiresAt > Date.now() ? x : undefined;
};
type HistoryResult = {
  demo: boolean;
  error: string;
  span: HistorySpan;
  date: string;
  plants: { name: string; points: HistoryPoint[]; rows?: MixRow[]; source: "inverter" | "plant" }[];
};
const cachedHistory = createSolarCache<HistoryResult>();
async function growatt() {
  const base = (env("GROWATT_SERVER") || "https://server.growatt.com").replace(/\/+$/, "");
  const user = env("GROWATT_USER"),
    password = env("GROWATT_PASS"),
    sn = env("GROWATT_SN");
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify([base, user, password, sn])),
  );
  const key = Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return cachedSolar(key, async (cached, saveSession) => {
    let session = cached ?? validShared(key);
    if (!session) {
      const lr = await fetch(`${base}/newTwoLoginAPI.do`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "okhttp/3.12.0",
        },
        body: new URLSearchParams({ userName: user, password: growattHash(password) }),
        signal: AbortSignal.timeout(15000),
      });
      const login = await lr.json().catch(() => null);
      if (!lr.ok || !login?.back?.success || !login.back.user?.id)
        throw new Error(
          "Growatt: a belépést nem fogadta el a szolgáltató. Egy órára szüneteltetjük a próbálkozásokat; a meglévő tiltást ez nem oldja fel.",
        );
      session = {
        cookie: (lr.headers.getSetCookie?.() || [lr.headers.get("set-cookie") || ""])
          .map((c) => c.split(";")[0])
          .join("; "),
        userId: String(login.back.user.id),
        expiresAt: Date.now() + SOLAR_SESSION_MS,
      };
      saveSession(session);
      growattSessions.set(key, session);
    } else saveSession(session);
    return fetchGrowatt(base, session.cookie, session.userId, sn);
  });
}
async function fetchGrowatt(base: string, cookie: string, userId: string, manualSn: string) {
  const ua = "okhttp/3.12.0";
  const request = async (url: string, init?: RequestInit) => {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(15000) });
    if (!response.ok)
      throw new Error(
        "Growatt: nem sikerült lekérni az adatokat. Egy órára szüneteltetjük a próbálkozásokat.",
      );
    return response;
  };
  const pr = await request(`${base}/PlantListAPI.do?userId=${userId}`, {
    headers: { "User-Agent": ua, Cookie: cookie },
  });
  const pj = await pr.json().catch(() => ({}));
  // newer Growatt servers wrap the payload in "back"
  const p = pj.back ?? pj;
  const num = (v: unknown) => {
    const t = String(v ?? "0");
    const n = parseFloat(t.replace(/[^0-9.]/g, "")) || 0;
    return /MWh/i.test(t) ? n * 1000 : /kW(?!h)/i.test(t) ? n * 1000 : n;
  };
  if (!p.success || !Array.isArray(p.data))
    throw new Error(
      "Growatt: a munkamenet lejárt vagy a szolgáltató nem adott adatot. Egy órára szüneteltetjük a próbálkozásokat.",
    );
  const plants = await Promise.all(
    ((p.data || []) as any[]).map(async (x) => {
      let info: any = {};
      const tried: string[] = [];
      for (const op of ["getAllDeviceList", "getAllDeviceListTwo"]) {
        const ir = await request(
          `${base}/newTwoPlantAPI.do?op=${op}&plantId=${x.plantId}&pageNum=1&pageSize=20`,
          { headers: { "User-Agent": ua, Cookie: cookie } },
        );
        const ij = await ir.json().catch(() => ({}));
        const cand = ij.back ?? ij;
        tried.push(`${op}: ${JSON.stringify(ij).slice(0, 300)}`);
        if ((cand.deviceList || []).length) {
          info = cand;
          break;
        }
      }
      const devs = (info.deviceList || []) as any[];
      // the device list can come back empty for hybrid inverters; fall back to the serial entered on the Connections page
      if (!devs.length && manualSn) devs.push({ deviceSn: manualSn, deviceType: "" });
      let flow: SolarFlow | null = null;
      let flowRaw = "";
      for (const d of devs) {
        const sn = d.deviceSn || d.sn;
        const t = String(d.deviceType || "").toLowerCase();
        const all = [
          {
            k: "mix",
            u: "newMixApi.do?op=getSystemStatus_KW",
            b: { plantId: String(x.plantId), mixId: sn },
          },
          {
            k: "tlx",
            u: "newTlxApi.do?op=getSystemStatus_KW",
            b: { plantId: String(x.plantId), id: sn },
          },
          {
            k: "storage",
            u: "newStorageAPI.do?op=getSystemStatusData",
            b: { plantId: String(x.plantId), storageId: sn },
          },
        ];
        const match = all.filter(
          (e) =>
            t.includes(e.k) ||
            (e.k === "mix" && t.includes("sph")) ||
            (e.k === "tlx" && t.includes("min")),
        );
        for (const ep of match.length ? match : all) {
          const sr = await request(`${base}/${ep.u}`, {
            method: "POST",
            headers: {
              "User-Agent": ua,
              Cookie: cookie,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams(ep.b),
          });
          const sj = await sr.json().catch(() => null);
          const o = sj?.obj ?? sj?.back?.obj ?? sj?.back ?? sj;
          flowRaw += `${ep.k}: ${JSON.stringify(sj).slice(0, 700)}\n`;
          if (
            !o ||
            typeof o !== "object" ||
            !("ppv" in o || "pPv" in o || "SOC" in o || "soc" in o)
          )
            continue;
          flow = parseSolarFlow(o);
          break;
        }
        if (flow) break;
      }
      const devW = flow?.pv || devs.reduce((s2, d) => s2 + num(d.power), 0);
      return {
        name: String(x.plantName),
        currentW: devW || num(x.currentPower),
        todayKwh: num(x.todayEnergy),
        totalKwh: num(x.totalEnergy),
        online: ((info.deviceList || []) as any[])
          .map(
            (d) =>
              `${d.deviceSn || d.sn}: ${d.lost ? "offline" : "online"}${d.lastUpdateTime ? ` (${d.lastUpdateTime})` : ""}`,
          )
          .join(", "),
        flow,
        raw:
          JSON.stringify({ plant: x, devices: info.deviceList }).slice(0, 1500) +
          `\n\nlist: ${tried.join(" | ")}` +
          (flowRaw ? `\n\nstatus: ${flowRaw}` : ""),
      };
    }),
  );
  return {
    currentW: plants.reduce((a, b) => a + b.currentW, 0) || num(p.totalData?.currentPowerSum),
    todayKwh: plants.reduce((a, b) => a + b.todayKwh, 0) || num(p.totalData?.todayEnergySum),
    totalKwh: plants.reduce((a, b) => a + b.totalKwh, 0) || num(p.totalData?.totalEnergySum),
    plants,
    flow: plants.find((x) => x.flow)?.flow ?? null,
    raw: JSON.stringify(pj).slice(0, 1500),
  };
}
export const getSolarHistory = createServerFn({ method: "GET" })
  .inputValidator((d: { span: HistorySpan; date: string }) => {
    if (!(d?.span in SPAN_TYPE) || !validHistoryDate(d.span, String(d.date ?? "")))
      throw new Error("Érvénytelen időszak.");
    return { span: d.span, date: String(d.date ?? "") };
  })
  .handler(async ({ data }): Promise<HistoryResult> => {
    if (!has("GROWATT_USER"))
      return { demo: true, error: "", span: data.span, date: data.date, plants: [] };
    const base = (env("GROWATT_SERVER") || "https://server.growatt.com").replace(/\/+$/, "");
    const user = env("GROWATT_USER"),
      password = env("GROWATT_PASS"),
      sn = env("GROWATT_SN");
    const bytes = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(JSON.stringify([base, user, password, sn])),
    );
    const key = Array.from(new Uint8Array(bytes))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    try {
      return await cachedHistory(`${key}|${data.span}|${data.date}`, async () => {
        let session = validShared(key);
        const ua = "okhttp/3.12.0";
        if (!session) {
          const lr = await fetch(`${base}/newTwoLoginAPI.do`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": ua },
            body: new URLSearchParams({ userName: user, password: growattHash(password) }),
            signal: AbortSignal.timeout(15000),
          });
          const login = await lr.json().catch(() => null);
          if (!lr.ok || !login?.back?.success || !login.back.user?.id)
            throw new Error(
              "Growatt: a belépést nem fogadta el a szolgáltató. Egy órára szüneteltetjük az előzmény-lekérést.",
            );
          session = {
            cookie: (lr.headers.getSetCookie?.() || [lr.headers.get("set-cookie") || ""])
              .map((c) => c.split(";")[0])
              .join("; "),
            userId: String(login.back.user.id),
            expiresAt: Date.now() + SOLAR_SESSION_MS,
          };
          growattSessions.set(key, session);
        }
        const get = async (url: string) => {
          const r = await fetch(url, {
            headers: { "User-Agent": ua, Cookie: session!.cookie },
            signal: AbortSignal.timeout(15000),
          });
          if (!r.ok) throw new Error("Growatt: az előzményeket nem sikerült lekérni.");
          return r.json().catch(() => null);
        };
        const pj = await get(
          `${base}/PlantListAPI.do?userId=${encodeURIComponent(session.userId)}`,
        );
        const list = ((pj?.back ?? pj)?.data ?? []) as {
          plantId?: string | number;
          plantName?: string;
        }[];
        if (!Array.isArray(list) || !list.length) {
          growattSessions.delete(key);
          throw new Error(
            "Growatt: a munkamenet lejárt vagy nincs erőmű. Egy órára szüneteltetjük az előzmény-lekérést.",
          );
        }
        const plants = await Promise.all(
          list.map(async (x) => {
            const plantId = String(x.plantId);
            // Inverter level first (SPH/"mix" hybrids): production, load, grid import/export and battery, as in the ShinePhone app.
            const dj = await get(
              `${base}/newTwoPlantAPI.do?op=getAllDeviceList&plantId=${encodeURIComponent(plantId)}&pageNum=1&pageSize=20`,
            );
            const devs = ((dj?.back ?? dj)?.deviceList ?? []) as {
              deviceSn?: string;
              deviceType?: string;
            }[];
            const sns = [
              ...new Set(
                [
                  ...devs
                    .filter((d) => /mix|sph/i.test(String(d.deviceType ?? "")))
                    .map((d) => String(d.deviceSn ?? "")),
                  sn,
                ].filter(Boolean),
              ),
            ];
            const mix = async (mixId: string, span: keyof typeof MIX_TYPE, date: string) => {
              const r = await fetch(`${base}/newMixApi.do?op=getEnergyProdAndCons_KW`, {
                method: "POST",
                headers: {
                  "User-Agent": ua,
                  Cookie: session!.cookie,
                  "Content-Type": "application/x-www-form-urlencoded",
                },
                body: new URLSearchParams({ plantId, mixId, type: String(MIX_TYPE[span]), date }),
                signal: AbortSignal.timeout(15000),
              });
              return r.ok
                ? parseMixHistory(span, await r.json().catch(() => null))
                : { ok: false, rows: [] as MixRow[] };
            };
            for (const id of sns) {
              if (data.span === "week") {
                const days = weekDays(data.date);
                const months = [...new Set(days.map((d) => d.slice(0, 7)))];
                const res = await Promise.all(months.map((m) => mix(id, "month", `${m}-01`)));
                if (!res.every((r) => r.ok)) continue;
                const rows = days.map((d) => {
                  const r = res[months.indexOf(d.slice(0, 7))]!.rows.find(
                    (x) => Number(x.label) === Number(d.slice(8)),
                  );
                  return r
                    ? { ...r, label: d }
                    : {
                        label: d,
                        pv: null,
                        load: null,
                        fromGrid: null,
                        toGrid: null,
                        charge: null,
                        discharge: null,
                      };
                });
                return {
                  name: String(x.plantName ?? "Erőmű"),
                  points: rows.map((r) => ({ label: r.label, value: r.pv })),
                  rows,
                  source: "inverter" as const,
                };
              }
              const r = await mix(
                id,
                data.span,
                data.span === "month"
                  ? `${data.date}-01`
                  : data.span === "year"
                    ? `${data.date}-01-01`
                    : data.span === "total"
                      ? `${new Date().getFullYear()}-01-01`
                      : data.date,
              );
              if (r.ok && r.rows.length)
                return {
                  name: String(x.plantName ?? "Erőmű"),
                  points: r.rows.map((p) => ({ label: p.label, value: p.pv })),
                  rows: r.rows,
                  source: "inverter" as const,
                };
            }
            if (data.span === "week")
              throw new Error(
                "Growatt: heti bontás csak inverter-szintű adatból érhető el, ez az erőmű nem adott ilyet.",
              );
            const q = new URLSearchParams({
              plantId,
              type: String(SPAN_TYPE[data.span]),
              date: data.date,
            });
            const parsed = parsePlantDetail(await get(`${base}/newPlantDetailAPI.do?${q}`));
            if (!parsed.ok)
              throw new Error("Growatt: a szolgáltató nem adott előzményt ehhez az időszakhoz.");
            return {
              name: String(x.plantName ?? "Erőmű"),
              points: parsed.points,
              source: "plant" as const,
            };
          }),
        );
        return { demo: false, error: "", span: data.span, date: data.date, plants };
      });
    } catch (e) {
      return {
        demo: false,
        error: String((e as Error).message || e),
        span: data.span,
        date: data.date,
        plants: [],
      };
    }
  });
export const getSolar = createServerFn({ method: "GET" }).handler(async () => {
  if (!has("GROWATT_USER"))
    return {
      demo: true,
      error: "",
      currentW: 3420,
      todayKwh: 18.6,
      totalKwh: 8412,
      plants: [
        {
          name: "Otthon",
          currentW: 3420,
          todayKwh: 18.6,
          totalKwh: 8412,
          online: "",
          flow: null,
          raw: "",
        },
      ],
      flow: { pv: 3420, soc: 64, charge: 1200, discharge: 0, load: 1850, toGrid: 370, fromGrid: 0 },
      raw: "",
    };
  try {
    return { demo: false, error: "", ...(await growatt()) };
  } catch (e) {
    return {
      demo: false,
      error: String((e as Error).message || e),
      currentW: 0,
      todayKwh: 0,
      totalKwh: 0,
      plants: [],
      flow: null,
      raw: "",
    };
  }
});

const blindNames = () =>
  Object.fromEntries(
    env("BLINDS_NAMES")
      .split(",")
      .map((p) => p.split("=").map((x) => x.trim()))
      .filter((p) => p.length === 2),
  );
type BlindsResult = {
  demo: boolean;
  error: string;
  blinds: {
    mac: string;
    deviceType: string;
    name: string;
    room: string;
    position: number;
    battery: number;
    state: number;
  }[];
};
const META = "nas-blinds";
type BlindMeta = Record<string, { name?: string; room?: string }>;
const readMeta = (): BlindMeta => {
  try {
    return JSON.parse(getCookie(META) || "{}");
  } catch {
    return {};
  }
};
export const getBlinds = createServerFn({ method: "GET" }).handler(
  async (): Promise<BlindsResult> => {
    const meta = readMeta();
    const apply = (b: BlindsResult["blinds"][number], fallback: string) => ({
      ...b,
      name: meta[b.mac]?.name || fallback,
      room: meta[b.mac]?.room || b.room,
    });
    if (!has("BLINDS_IP"))
      return {
        demo: true,
        error: "",
        blinds: [
          {
            mac: "demo1",
            deviceType: "10000000",
            name: "Nappali bal",
            room: "Nappali",
            position: 0,
            battery: 0,
            state: 0,
          },
          {
            mac: "demo2",
            deviceType: "10000000",
            name: "Nappali jobb",
            room: "Nappali",
            position: 0,
            battery: 0,
            state: 0,
          },
          {
            mac: "demo3",
            deviceType: "10000000",
            name: "Hálószoba",
            room: "Hálószoba",
            position: 100,
            battery: 0,
            state: 0,
          },
          {
            mac: "demo4",
            deviceType: "10000000",
            name: "Konyha",
            room: "",
            position: 50,
            battery: 0,
            state: 0,
          },
        ].map((b) => apply(b, b.name)),
      };
    try {
      const { listBlinds } = await import("./blinds.server");
      const names = blindNames();
      const l = await listBlinds(env("BLINDS_IP"), env("BLINDS_KEY"));
      return {
        demo: false,
        error: "",
        blinds: l.map((b, i) =>
          apply(
            { ...b, name: "", room: "" },
            names[b.mac] || names[String(i + 1)] || `Redőny ${i + 1}`,
          ),
        ),
      };
    } catch (e) {
      return { demo: false, error: String((e as Error).message || e), blinds: [] };
    }
  },
);
export const saveBlindMeta = createServerFn({ method: "POST" })
  .inputValidator((d: { items: { mac: string; name: string; room: string }[] }) => ({
    items: d.items.slice(0, 100).map((i) => ({
      mac: String(i.mac).slice(0, 40),
      name: String(i.name).trim().slice(0, 40),
      room: String(i.room).trim().slice(0, 30),
    })),
  }))
  .handler(async ({ data }) => {
    guard("rooms");
    const meta = readMeta();
    for (const i of data.items)
      meta[i.mac] = { ...(i.name ? { name: i.name } : {}), ...(i.room ? { room: i.room } : {}) };
    const https =
      getRequest().url.startsWith("https") ||
      getRequest().headers.get("x-forwarded-proto") === "https";
    setCookie(META, JSON.stringify(meta), {
      httpOnly: true,
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      ...(https
        ? { sameSite: "none" as const, secure: true, partitioned: true }
        : { sameSite: "lax" as const }),
    });
    return { ok: true };
  });
export const blindGroupAction = createServerFn({ method: "POST" })
  .inputValidator(
    (d: { blinds: { mac: string; deviceType: string }[]; action: "open" | "close" | "stop" }) => d,
  )
  .handler(async ({ data }) => {
    guard("home");
    if (!has("BLINDS_IP")) return { ok: true, failed: 0 };
    const { writeBlind } = await import("./blinds.server");
    const operation = data.action === "open" ? 1 : data.action === "close" ? 0 : 2;
    let failed = 0;
    for (const b of data.blinds.slice(0, 50)) {
      try {
        await writeBlind(env("BLINDS_IP"), env("BLINDS_KEY"), b.mac, b.deviceType, { operation });
      } catch {
        failed++;
      }
      await new Promise((r) => setTimeout(r, 150));
    }
    return { ok: failed === 0, failed };
  });
export const blindAction = createServerFn({ method: "POST" })
  .inputValidator(
    (d: {
      mac: string;
      deviceType: string;
      action: "open" | "close" | "stop" | "position";
      position?: number;
    }) => d,
  )
  .handler(async ({ data }) => {
    guard("home");
    if (!has("BLINDS_IP")) return { ok: true };
    const { writeBlind } = await import("./blinds.server");
    const payload =
      data.action === "position"
        ? { targetPosition: Math.max(0, Math.min(100, Math.round(data.position ?? 0))) }
        : { operation: data.action === "open" ? 1 : data.action === "close" ? 0 : 2 };
    await writeBlind(env("BLINDS_IP"), env("BLINDS_KEY"), data.mac, data.deviceType, payload);
    return { ok: true };
  });

const XM = "xm-sess";
function writeXm(v: string) {
  const https =
    getRequest().url.startsWith("https") ||
    getRequest().headers.get("x-forwarded-proto") === "https";
  setCookie(XM, v, {
    httpOnly: true,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
    ...(https
      ? { sameSite: "none" as const, secure: true, partitioned: true }
      : { sameSite: "lax" as const }),
  });
}
const xmArgs = () => [env("XIAOMI_USER"), env("XIAOMI_PASS")] as const;
const THERMO_META = "thermo-meta";
function readThermometerMeta(): ThermometerMeta {
  const raw = getCookie(THERMO_META);
  try {
    return mergeThermometerMeta({}, JSON.parse(raw || "{}"));
  } catch {
    return {};
  }
}
export const saveThermometerMeta = createServerFn({ method: "POST" })
  .inputValidator((input: { items: ThermometerMeta; onlyMissing?: boolean }) => {
    if (
      !input.items ||
      typeof input.items !== "object" ||
      Array.isArray(input.items) ||
      Object.values(input.items).some((item) => !item || typeof item !== "object")
    )
      throw new Error("Érvénytelen hőmérőbeállítások.");
    return input;
  })
  .handler(async ({ data }) => {
    guard("rooms");
    const meta = mergeThermometerMeta(readThermometerMeta(), data.items, data.onlyMissing === true);
    setCookie(THERMO_META, JSON.stringify(meta), {
      httpOnly: true,
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    });
    return meta;
  });
export const getThermometers = createServerFn({ method: "GET" }).handler(async () => {
  const meta = readThermometerMeta();
  if (!has("XIAOMI_USER", "XIAOMI_PASS"))
    return {
      meta,
      demo: true,
      error: "",
      raw: "",
      verifyUrl: "",
      sensors: [
        {
          did: "d1",
          name: "Nappali",
          model: "miaomiaoce.sensor_ht.t2",
          online: true,
          temp: 22.4,
          hum: 48,
          battery: 87,
        },
        {
          did: "d2",
          name: "Hálószoba",
          model: "miaomiaoce.sensor_ht.t2",
          online: true,
          temp: 20.1,
          hum: 52,
          battery: 64,
        },
        {
          did: "d3",
          name: "Gyerekszoba",
          model: "cgllc.sensor_ht.g1",
          online: true,
          temp: 21.3,
          hum: 45,
          battery: 91,
        },
      ],
    };
  const x = await import("./xiaomi.server");
  const [u, p] = xmArgs();
  const saved = getCookie(XM);
  if (saved) x.restoreSession(u, p, saved);
  try {
    const r = await x.listThermometers(u, p, (env("XIAOMI_REGION") || "de").toLowerCase());
    const cur = x.currentSession(u, p);
    if (cur) writeXm(JSON.stringify(cur));
    return { meta, demo: false, error: "", verifyUrl: "", ...r };
  } catch (e) {
    if (e instanceof x.Xiaomi2FA)
      return { meta, demo: false, error: "", verifyUrl: e.url, raw: "", sensors: [] };
    return {
      meta,
      demo: false,
      error: String((e as Error).message || e),
      verifyUrl: "",
      raw: "",
      sensors: [],
    };
  }
});
export const xiaomiSendCode = createServerFn({ method: "POST" })
  .inputValidator((d: { url: string }) => d)
  .handler(async ({ data }) => {
    guard("settings");
    return (await import("./xiaomi.server")).sendCode(env("XIAOMI_USER"), data.url);
  });
export const getThermometerHistory = createServerFn({ method: "GET" })
  .inputValidator((input: { did: string; days: number }) => {
    if (!input.did || ![1, 7].includes(input.days)) throw new Error("Érvénytelen időszak.");
    return input;
  })
  .handler(async ({ data }) => {
    if (!has("XIAOMI_USER", "XIAOMI_PASS")) return { points: [], demo: true, error: "" };
    try {
      const x = await import("./xiaomi.server");
      const [u, p] = xmArgs();
      const saved = getCookie(XM);
      if (saved) x.restoreSession(u, p, saved);
      const points = await x.thermometerHistory(
        u,
        p,
        (env("XIAOMI_REGION") || "de").toLowerCase(),
        data.did,
        data.days,
      );
      return { points, demo: false, error: "" };
    } catch {
      return {
        points: [],
        demo: false,
        error: "Nem sikerült lekérni a Xiaomi mérési előzményeit.",
      };
    }
  });
export const xiaomiVerify = createServerFn({ method: "POST" })
  .inputValidator((d: { url: string; ick: string; flag: number; code: string }) => d)
  .handler(async ({ data }) => {
    guard("settings");
    const x = await import("./xiaomi.server");
    const [u, p] = xmArgs();
    const s = await x.verifyCode(u, p, data.url, data.ick, data.flag, data.code);
    writeXm(JSON.stringify(s));
    return { ok: true };
  });
const xmRegion = () => (env("XIAOMI_REGION") || "de").toLowerCase();
export const getPurifiers = createServerFn({ method: "GET" }).handler(async () => {
  if (!has("XIAOMI_USER", "XIAOMI_PASS"))
    return {
      demo: true,
      error: "",
      raw: "",
      purifiers: [
        {
          did: "p1",
          name: "Légtisztító",
          model: "zhimi.airp.meb1",
          online: true,
          on: true,
          mode: 0,
          pm25: 8,
          hum: 46,
          temp: 22.5,
          filter: 73,
        },
      ],
    };
  const x = await import("./xiaomi.server");
  const [u, p] = xmArgs();
  const saved = getCookie(XM);
  if (saved) x.restoreSession(u, p, saved);
  try {
    return { demo: false, error: "", ...(await x.listPurifiers(u, p, xmRegion())) };
  } catch (e) {
    return { demo: false, error: String((e as Error).message || e), raw: "", purifiers: [] };
  }
});
export const purifierAction = createServerFn({ method: "POST" })
  .inputValidator((d: { did: string; key: "on" | "mode"; value: boolean | number }) => d)
  .handler(async ({ data }) => {
    guard("home");
    const x = await import("./xiaomi.server");
    const [u, p] = xmArgs();
    const saved = getCookie(XM);
    if (saved) x.restoreSession(u, p, saved);
    await x.setPurifier(u, p, xmRegion(), data.did, data.key, data.value);
    return { ok: true };
  });
export const getLocks = createServerFn({ method: "GET" }).handler(async () => {
  guard("locks");
  if (!has("XIAOMI_USER", "XIAOMI_PASS"))
    return {
      demo: true,
      error: "",
      raw: "",
      locks: [
        {
          did: "l1",
          name: "Bejárati ajtó",
          model: "xiaomi.lock.d100e",
          online: true,
          battery: 82,
          values: {} as Record<string, string | number | boolean>,
        },
      ],
    };
  const x = await import("./xiaomi.server");
  const [u, p] = xmArgs();
  const saved = getCookie(XM);
  if (saved) x.restoreSession(u, p, saved);
  try {
    return { demo: false, error: "", ...(await x.listLocks(u, p, xmRegion())) };
  } catch (e) {
    return { demo: false, error: String((e as Error).message || e), raw: "", locks: [] };
  }
});

// ---------- Bosch / Home Connect (device flow) ----------
const HC = "https://api.home-connect.com";
const HC_TOK = "hc-tok",
  HC_DEV = "hc-dev";
const hcClient = () =>
  env("HC_CLIENT_ID") || "5201711F88D6993A3B0E6BCE71EB5C4ECD594F586B202A030A143B56CE9D9F9C";
function hcCookie(name: string, v: string, age: number) {
  const https =
    getRequest().url.startsWith("https") ||
    getRequest().headers.get("x-forwarded-proto") === "https";
  setCookie(name, v, {
    httpOnly: true,
    path: "/",
    maxAge: age,
    ...(https
      ? { sameSite: "none" as const, secure: true, partitioned: true }
      : { sameSite: "lax" as const }),
  });
}
type HcTok = { a: string; r: string; e: number };
const hcForm = (b: Record<string, string>) =>
  fetch(`${HC}/security/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(b).toString(),
  });
async function hcToken(): Promise<string | null> {
  let t: HcTok;
  try {
    t = JSON.parse(getCookie(HC_TOK) || "");
  } catch {
    return null;
  }
  if (Date.now() < t.e - 60000) return t.a;
  const r = await hcForm({
    grant_type: "refresh_token",
    refresh_token: t.r,
    client_id: hcClient(),
  });
  if (!r.ok) return null;
  const j = (await r.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };
  const n = { a: j.access_token, r: j.refresh_token || t.r, e: Date.now() + j.expires_in * 1000 };
  hcCookie(HC_TOK, JSON.stringify(n), 60 * 60 * 24 * 60);
  return n.a;
}
const hcGet = async (tok: string, p: string) => {
  const r = await fetch(`${HC}${p}`, {
    headers: {
      Authorization: `Bearer ${tok}`,
      Accept: "application/vnd.bsh.sdk.v1+json",
      "Accept-Language": "en-GB",
    },
  });
  if (!r.ok) {
    // An appliance with no active program returns 404; this is not a connection failure.
    if (r.status === 404 && p.endsWith("/programs/active")) return null;
    throw new Error(homeConnectFailure(r.status).message);
  }
  return ((await r.json()) as { data: Record<string, unknown> }).data;
};
export type Appliance = {
  haId: string;
  name: string;
  type: string;
  connected: boolean;
  state: string;
  door: string;
  program: string;
  remaining: number | null;
  progress: number | null;
  remoteStart: boolean;
};
const short = (v: unknown) =>
  String(v ?? "")
    .split(".")
    .pop() || "";
export const getAppliances = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ linked: boolean; appliances: Appliance[]; error: string | null }> => {
    try {
      const tok = await hcToken();
      if (!tok) return { linked: false, appliances: [], error: null };
      const list = (await hcGet(tok, "/api/homeappliances")) as {
        homeappliances?: { haId: string; name: string; type: string; connected: boolean }[];
      } | null;
      if (!list)
        return {
          linked: true,
          appliances: [],
          error: "A Home Connect üres választ küldött. Próbáld később. [HC/response]",
        };
      const out = await Promise.all(
        (list.homeappliances || []).map(async (h) => {
          const a: Appliance = {
            haId: h.haId,
            name: h.name,
            type: h.type,
            connected: h.connected,
            state: "",
            door: "",
            program: "",
            remaining: null,
            progress: null,
            remoteStart: false,
          };
          if (!h.connected) return a;
          const st = (await hcGet(tok, `/api/homeappliances/${h.haId}/status`)) as {
            status?: { key: string; value: unknown }[];
          } | null;
          for (const s of st?.status || []) {
            if (s.key.endsWith("OperationState")) a.state = short(s.value);
            if (s.key.endsWith("DoorState")) a.door = short(s.value);
            if (s.key.endsWith("RemoteControlStartAllowed")) a.remoteStart = !!s.value;
          }
          const pr = (await hcGet(tok, `/api/homeappliances/${h.haId}/programs/active`)) as {
            key?: string;
            name?: string;
            options?: { key: string; value: unknown }[];
          } | null;
          if (pr) {
            a.program = pr.name || short(pr.key);
            for (const o of pr.options || []) {
              if (o.key.endsWith("RemainingProgramTime")) a.remaining = Number(o.value);
              if (o.key.endsWith("ProgramProgress")) a.progress = Number(o.value);
            }
          }
          return a;
        }),
      );
      return { linked: true, appliances: out, error: null };
    } catch (e) {
      return {
        linked: true,
        appliances: [],
        error:
          e instanceof Error && e.message.includes("[HC/")
            ? e.message
            : "A Home Connect nem érhető el. Ellenőrizd az internetkapcsolatot, és próbáld később. [HC/network]",
      };
    }
  },
);
export const hcStartLink = createServerFn({ method: "POST" }).handler(async () => {
  guard("settings");
  const r = await fetch(`${HC}/security/oauth/device_authorization`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: hcClient(),
      scope: "IdentifyAppliance Monitor Control",
    }).toString(),
  });
  const j = (await r.json()) as {
    device_code?: string;
    user_code?: string;
    verification_uri_complete?: string;
    verification_uri?: string;
    error_description?: string;
  };
  if (!j.device_code)
    return { ok: false, error: j.error_description || `Hiba (${r.status})`, code: "", url: "" };
  hcCookie(HC_DEV, j.device_code, 900);
  return {
    ok: true,
    error: "",
    code: j.user_code || "",
    url: j.verification_uri_complete || j.verification_uri || "",
  };
});
export const hcFinishLink = createServerFn({ method: "POST" }).handler(async () => {
  guard("settings");
  const dc = getCookie(HC_DEV);
  if (!dc) return { ok: false, error: "Lejárt, kezdd újra" };
  const r = await hcForm({ grant_type: "device_code", device_code: dc, client_id: hcClient() });
  const j = (await r.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!j.access_token)
    return {
      ok: false,
      error:
        j.error === "authorization_pending"
          ? "Még nem hagytad jóvá"
          : j.error_description || j.error || "Hiba",
    };
  hcCookie(
    HC_TOK,
    JSON.stringify({
      a: j.access_token,
      r: j.refresh_token || "",
      e: Date.now() + (j.expires_in || 3600) * 1000,
    }),
    60 * 60 * 24 * 60,
  );
  return { ok: true, error: "" };
});
export const hcStop = createServerFn({ method: "POST" })
  .inputValidator((d: { haId: string }) => d)
  .handler(async ({ data }) => {
    guard("home");
    const tok = await hcToken();
    if (!tok) return { ok: false };
    const r = await fetch(
      `${HC}/api/homeappliances/${encodeURIComponent(data.haId)}/programs/active`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${tok}`, Accept: "application/vnd.bsh.sdk.v1+json" },
      },
    );
    return { ok: r.ok };
  });
const hcSend = async (tok: string, p: string, method: string, body?: unknown) => {
  const r = await fetch(`${HC}${p}`, {
    method,
    headers: {
      Authorization: `Bearer ${tok}`,
      Accept: "application/vnd.bsh.sdk.v1+json",
      "Content-Type": "application/vnd.bsh.sdk.v1+json",
      "Accept-Language": "en-GB",
    },
    body: body ? JSON.stringify(body) : null,
  });
  if (r.ok) return { ok: true, error: "" };
  const t = await r.text();
  let m = t;
  try {
    const j = JSON.parse(t);
    m = j.error?.description || j.error?.key || t;
  } catch {
    /* */
  }
  return { ok: false, error: `${r.status}: ${m}`.slice(0, 300) };
};
export const hcPrograms = createServerFn({ method: "POST" })
  .inputValidator((d: { haId: string }) => d)
  .handler(async ({ data }) => {
    const tok = await hcToken();
    if (!tok) return { programs: [] as { key: string; name: string }[], error: "Nincs összekötve" };
    const d = (await hcGet(
      tok,
      `/api/homeappliances/${encodeURIComponent(data.haId)}/programs/available`,
    )) as { programs?: { key: string; name?: string }[] } | null;
    return {
      programs: (d?.programs || []).map((p) => ({ key: p.key, name: p.name || short(p.key) })),
      error: d ? "" : "Nem érhetők el a programok",
    };
  });
export const hcControl = createServerFn({ method: "POST" })
  .inputValidator(
    (d: {
      haId: string;
      action: "start" | "power";
      program?: string;
      on?: boolean;
      type?: string;
    }) => d,
  )
  .handler(async ({ data }) => {
    guard("home");
    const tok = await hcToken();
    if (!tok) return { ok: false, error: "Nincs összekötve" };
    const id = encodeURIComponent(data.haId);
    if (data.action === "start")
      return hcSend(tok, `/api/homeappliances/${id}/programs/active`, "PUT", {
        data: { key: data.program, options: [] },
      });
    const off = /Oven|Hob|Hood|CoffeeMaker/.test(data.type || "")
      ? "BSH.Common.EnumType.PowerState.Standby"
      : "BSH.Common.EnumType.PowerState.Off";
    return hcSend(tok, `/api/homeappliances/${id}/settings/BSH.Common.Setting.PowerState`, "PUT", {
      data: {
        key: "BSH.Common.Setting.PowerState",
        value: data.on ? "BSH.Common.EnumType.PowerState.On" : off,
      },
    });
  });

// ---------- Tuya (Smart Life QR login) ----------
const TS = "tuya-sess",
  TQ = "tuya-qr";
const tuyaSess = (): import("./tuya.server").TuyaSess | null => {
  try {
    return JSON.parse(getCookie(TS) || "");
  } catch {
    return null;
  }
};
async function tuyaReady() {
  const s = tuyaSess();
  if (!s) return null;
  const t = await import("./tuya.server");
  const n = await t.ensure(s);
  if (n.a !== s.a) hcCookie(TS, JSON.stringify(n), 60 * 60 * 24 * 365);
  return { t, s: n };
}
const TUYA_META = "tuya-meta";
export type TuyaMeta = Record<string, { name?: string; room?: string; hidden?: boolean }>;
const readTuyaMeta = (): TuyaMeta => {
  try {
    return JSON.parse(getCookie(TUYA_META) || "{}");
  } catch {
    return {};
  }
};
export const getTuya = createServerFn({ method: "GET" }).handler(async () => {
  const meta = readTuyaMeta();
  try {
    const r = await tuyaReady();
    if (!r)
      return {
        configured: false,
        devices: [] as import("./tuya.server").TuyaDevice[],
        error: null as string | null,
        meta,
      };
    return { configured: true, devices: await r.t.listTuya(r.s), error: null, meta };
  } catch (e) {
    return { configured: true, devices: [], error: (e as Error).message, meta };
  }
});
export const saveTuyaMeta = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string; name?: string; room?: string; hidden?: boolean }) => ({
    id: String(d.id).slice(0, 60),
    name: d.name != null ? String(d.name).trim().slice(0, 40) : undefined,
    room: d.room != null ? String(d.room).trim().slice(0, 30) : undefined,
    hidden: d.hidden === true ? true : d.hidden === false ? false : undefined,
  }))
  .handler(async ({ data }) => {
    guard("rooms");
    const meta = readTuyaMeta();
    meta[data.id] = {
      ...meta[data.id],
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.room !== undefined ? { room: data.room } : {}),
      ...(data.hidden !== undefined ? { hidden: data.hidden } : {}),
    };
    setCookie(TUYA_META, JSON.stringify(meta), {
      httpOnly: true,
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax" as const,
    });
    return { ok: true };
  });
export const tuyaQrStart = createServerFn({ method: "POST" })
  .inputValidator((d: { userCode: string }) => d)
  .handler(async ({ data }) => {
    guard("settings");
    try {
      const qr = await (await import("./tuya.server")).qrStart(data.userCode.trim());
      hcCookie(TQ, JSON.stringify({ qr, uc: data.userCode.trim() }), 600);
      return { ok: true, error: "", qr: `tuyaSmart--qrLogin?token=${qr}` };
    } catch (e) {
      return { ok: false, error: (e as Error).message, qr: "" };
    }
  });
export const tuyaQrFinish = createServerFn({ method: "POST" }).handler(async () => {
  guard("settings");
  let q: { qr: string; uc: string };
  try {
    q = JSON.parse(getCookie(TQ) || "");
  } catch {
    return { ok: false, error: "Lejárt, kérj új QR-kódot" };
  }
  const s = await (await import("./tuya.server")).qrResult(q.qr, q.uc);
  if (!s)
    return {
      ok: false,
      error:
        "Még nincs jóváhagyva – olvasd be a kódot a Smart Life appban és nyomd meg a Megerősítést",
    };
  hcCookie(TS, JSON.stringify(s), 60 * 60 * 24 * 365);
  return { ok: true, error: "" };
});
export const tuyaLogout = createServerFn({ method: "POST" }).handler(async () => {
  guard("settings");
  hcCookie(TS, "", 0);
  return { ok: true };
});
export const tuyaCommand = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string; code: string; value: boolean | number | string }) => d)
  .handler(async ({ data }) => {
    guard("home");
    try {
      const r = await tuyaReady();
      if (!r) return { ok: false, error: "Nincs összekötve" };
      await r.t.sendTuya(r.s, data.id, data.code, data.value);
      return { ok: true, error: "" };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });

export const getGree = createServerFn({ method: "GET" }).handler(async () => {
  if (has("GREE_USER", "GREE_PASS")) {
    try {
      const { readGreeCloud } = await import("./gree-cloud.server");
      return await readGreeCloud({
        user: env("GREE_USER"),
        password: env("GREE_PASS"),
        region: env("GREE_REGION") || "Europe",
      });
    } catch (e) {
      return { configured: true, units: [], error: String((e as Error).message) };
    }
  }
  const raw = env("GREE_UNITS");
  if (!raw) return { configured: false, units: [], error: "" };
  try {
    const { withGree } = await import("./gree.server");
    const units = [];
    for (const unit of parseGreeUnits(raw)) {
      try {
        const properties = await withGree(unit.ip);
        units.push({ ...unit, online: true, properties, error: "" });
      } catch (e) {
        units.push({
          ...unit,
          online: false,
          properties: {} as Record<string, string | number>,
          error: String((e as Error).message),
        });
      }
    }
    return { configured: true, units, error: "" };
  } catch (e) {
    return { configured: true, units: [], error: String((e as Error).message) };
  }
});
export const greeControl = createServerFn({ method: "POST" })
  .inputValidator(validateGreeCommand)
  .handler(async ({ data }) => {
    guard("home");
    if (has("GREE_USER", "GREE_PASS")) {
      const { controlGreeCloud } = await import("./gree-cloud.server");
      await controlGreeCloud(
        {
          user: env("GREE_USER"),
          password: env("GREE_PASS"),
          region: env("GREE_REGION") || "Europe",
        },
        data,
      );
      return { ok: true };
    }
    if (!parseGreeUnits(env("GREE_UNITS")).some((unit) => unit.ip === data.ip))
      throw new Error("Ez a klíma nincs beállítva.");
    const { withGree } = await import("./gree.server");
    await withGree(data.ip, {
      [data.property]: data.value,
      ...(data.property === "temperature" ? { temperatureUnit: "celsius" } : {}),
    });
    return { ok: true };
  });
