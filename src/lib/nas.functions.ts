import { createServerFn } from "@tanstack/react-start";
import { getCookie, setCookie, getRequest } from "@tanstack/react-start/server";
import { volumes, streams, recent, torrents, catalog, library, haDemo } from "./mock";

const COOKIE = "nas-cfg";
export const FIELDS = ["QBIT_URL", "QBIT_USER", "QBIT_PASS", "RADARR_URL", "RADARR_KEY", "SONARR_URL", "SONARR_KEY", "PLEX_URL", "PLEX_TOKEN", "DSM_URL", "DSM_USER", "DSM_PASS", "HA_URL", "HA_TOKEN"] as const;
const SECRET = ["HA_TOKEN", "DSM_PASS", "QBIT_PASS", "RADARR_KEY", "SONARR_KEY", "PLEX_TOKEN"];
const readCfg = (): Record<string, string> => { try { return JSON.parse(getCookie(COOKIE) || "{}"); } catch { return {}; } };
const env = (k: string) => {
  const v = readCfg()[k] || process.env[k] || "";
  if (SECRET.includes(k)) return v;
  const t = v.trim().replace(/\/+$/, "");
  return k.endsWith("_URL") && t && !/^https?:\/\//i.test(t) ? `http://${t}` : t;
};

export const getConfig = createServerFn({ method: "GET" }).handler(async () => {
  const out: Record<string, string> = {};
  for (const f of FIELDS) out[f] = SECRET.includes(f) ? (env(f) ? "__set__" : "") : env(f);
  return out;
});

export const saveConfig = createServerFn({ method: "POST" })
  .inputValidator((d: Record<string, string>) => d)
  .handler(async ({ data }) => {
    const cur = readCfg(); const next: Record<string, string> = {};
    for (const f of FIELDS) {
      const v = SECRET.includes(f) ? data[f] ?? "" : (data[f] ?? "").trim();
      next[f] = SECRET.includes(f) && (v === "" || v === "__set__") ? cur[f] || "" : v;
    }
    const https = getRequest().url.startsWith("https") || getRequest().headers.get("x-forwarded-proto") === "https";
    setCookie(COOKIE, JSON.stringify(next), { httpOnly: true, path: "/", maxAge: 60 * 60 * 24 * 365,
      ...(https ? { sameSite: "none" as const, secure: true, partitioned: true } : { sameSite: "lax" as const }) });
    return { ok: true };
  });
const has = (...k: string[]) => k.every((x) => env(x));
const isDemo = () => !has("DSM_URL") && !has("QBIT_URL") && !has("RADARR_URL") && !has("SONARR_URL") && !has("PLEX_URL");

async function arr(app: "RADARR" | "SONARR", path: string, init?: RequestInit) {
  const r = await fetch(`${env(app + "_URL")}/api/v3${path}`, { ...init, headers: { "X-Api-Key": env(app + "_KEY"), "Content-Type": "application/json" } });
  if (!r.ok) throw new Error(`${app} ${r.status}`);
  return r.json();
}
async function dsmVolumes() {
  const base = env("DSM_URL");
  const a = await (await fetch(`${base}/webapi/entry.cgi?api=SYNO.API.Auth&version=6&method=login&account=${encodeURIComponent(env("DSM_USER"))}&passwd=${encodeURIComponent(env("DSM_PASS"))}&format=sid`)).json();
  if (!a.success) throw new Error(`Synology belépés sikertelen (kód ${a.error?.code}${a.error?.code === 403 ? ": kétlépcsős azonosítás be van kapcsolva" : ""})`);
  const r = await (await fetch(`${base}/webapi/entry.cgi?api=SYNO.Storage.CGI.Storage&version=1&method=load_info&_sid=${a.data.sid}`)).json();
  if (!r.success) throw new Error(`Synology tárhely lekérés hiba (kód ${r.error?.code})`);
  return (r.data.volumes as any[]).map((v) => ({ name: `${v.display_name || v.vol_path}${v.status && v.status !== "normal" ? ` · ${v.status}` : ""}`,
    used: +(Number(v.size.used) / 1e12).toFixed(2), total: +(Number(v.size.total) / 1e12).toFixed(2) }));
}
async function plex(path: string) {
  const sep = path.includes("?") ? "&" : "?";
  const r = await fetch(`${env("PLEX_URL")}${path}${sep}X-Plex-Token=${env("PLEX_TOKEN")}`, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`Plex ${r.status}`);
  return (await r.json()).MediaContainer;
}
async function qbit(path: string, body?: Record<string, string>) {
  const base = env("QBIT_URL");
  const login = await fetch(`${base}/api/v2/auth/login`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Referer: base, Origin: base },
    body: new URLSearchParams({ username: env("QBIT_USER"), password: env("QBIT_PASS") }) });
  const lt = (await login.text()).trim();
  if (login.status === 403) throw new Error("qBittorrent 403: túl sok hibás belépés miatt kitiltott IP, vagy a Host fejléc ellenőrzés tiltja");
  if (/^fails/i.test(lt)) throw new Error(`qBittorrent: hibás felhasználónév vagy jelszó (felhasználó: "${env("QBIT_USER")}", jelszó hossza: ${env("QBIT_PASS").length})`);
  // qBittorrent 5.x answers a successful login with 204 and an empty body
  if (!/^ok/i.test(lt) && !(login.ok && lt === "")) throw new Error(`qBittorrent: váratlan válasz (${login.status}): ${lt.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 120)}`);
  // qBittorrent 5.x names the cookie QBT_SID_<port>, older versions SID
  const sid = (login.headers.get("set-cookie") || "").match(/(QBT_SID_\d+|SID)=[^;]+/)?.[0] || "";
  const r = await fetch(`${base}/api/v2${path}`, { method: body ? "POST" : "GET", headers: { Cookie: sid, Referer: base, Origin: base, "Content-Type": "application/x-www-form-urlencoded" },
    body: body ? new URLSearchParams(body) : null });
  if (!r.ok) throw new Error(`qBittorrent ${r.status}`);
  const t = await r.text();
  try { return JSON.parse(t); } catch { return t; }
}
const safe = async <T,>(p: Promise<T>, fb: T) => { try { return await p; } catch { return fb; } };
const fmtSize = (b: number) => (b > 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${(b / 1e6).toFixed(0)} MB`);
const fmtEta = (s: number) => (s >= 8640000 ? "—" : s > 3600 ? `${Math.round(s / 3600)} óra` : `${Math.max(1, Math.round(s / 60))} perc`);

export const getOverview = createServerFn({ method: "GET" }).handler(async () => {
  if (isDemo()) return { demo: true, volumes, streams, recent: recent.map((r) => ({ ...r, thumb: "" })), watched: recent.slice().reverse().map((r) => ({ ...r, thumb: "", who: "Apa" })) };
  const dsm = has("DSM_URL") ? await safe(dsmVolumes(), []) : [];
  const disks = dsm.length ? [] : has("RADARR_URL") ? await safe(arr("RADARR", "/diskspace"), []) : [];
  const seen = new Set<number>();
  const vols = (disks as { path: string; freeSpace: number; totalSpace: number }[])
    .filter((d) => d.totalSpace > 1e11 && !seen.has(d.totalSpace) && seen.add(d.totalSpace))
    .map((d) => ({ name: d.path, used: +((d.totalSpace - d.freeSpace) / 1e12).toFixed(1), total: +(d.totalSpace / 1e12).toFixed(1) }));
  if (dsm.length) vols.push(...dsm);
  let watched: { title: string; year: number; type: string; hue: number; thumb: string; who: string }[] = [];
  let st: typeof streams = [], rc: { title: string; year: number; type: string; hue: number; thumb: string }[] = [];
  if (has("PLEX_URL")) {
    const s = await safe(plex("/status/sessions"), { Metadata: [] });
    st = (s.Metadata || []).map((m: any) => ({
      user: m.User?.title || "?", title: m.grandparentTitle ? `${m.grandparentTitle} – ${m.title}` : m.title,
      device: m.Player?.product || m.Player?.title || "", quality: m.Media?.[0]?.videoResolution ? `${m.Media[0].videoResolution}` : "",
      mode: m.TranscodeSession ? "Transcode" : "Direct Play", progress: m.duration ? Math.round((m.viewOffset / m.duration) * 100) : 0 }));
    const r = await safe(plex("/library/recentlyAdded?X-Plex-Container-Start=0&X-Plex-Container-Size=12"), { Metadata: [] });
    rc = (r.Metadata || []).map((m: any, i: number) => ({ title: m.parentTitle && m.type === "season" ? m.parentTitle : m.title, year: m.year || m.parentYear || 0,
      type: m.type === "movie" ? "Film" : "Sorozat", hue: (i * 47) % 360, thumb: m.thumb || m.parentThumb || "" }));
    const h = await safe(plex("/status/sessions/history/all?sort=viewedAt:desc&X-Plex-Container-Start=0&X-Plex-Container-Size=30"), { Metadata: [] });
    const accts = await safe(plex("/accounts"), { Account: [] });
    const names = new Map((accts.Account || []).map((a: any) => [a.id, a.name]));
    const seenT = new Set<string>();
    for (const m of h.Metadata || []) {
      const title = m.grandparentTitle || m.title;
      if (seenT.has(title)) continue; seenT.add(title);
      watched.push({ title, year: m.year || 0, type: m.type === "movie" ? "Film" : "Sorozat", hue: (watched.length * 61) % 360,
        thumb: m.grandparentThumb || m.thumb || "", who: String(names.get(m.accountID) || "") });
      if (watched.length >= 12) break;
    }
  }
  return { demo: false, volumes: vols, streams: st, recent: rc, watched };
});

export const getTorrents = createServerFn({ method: "GET" }).handler(async () => {
  if (!has("QBIT_URL")) return { demo: true, list: torrents.map((t) => ({ ...t, hash: String(t.id) })) };
  const l = await qbit("/torrents/info");
  return { demo: false, list: (l as any[]).map((t, i) => ({ id: i, hash: t.hash, name: t.name, size: fmtSize(t.size), progress: Math.round(t.progress * 100),
    down: +(t.dlspeed / 1e6).toFixed(1), up: +(t.upspeed / 1e6).toFixed(1), eta: t.progress >= 1 ? "Kész" : fmtEta(t.eta), paused: /paused|stopped/i.test(t.state) })) };
});

export const torrentAction = createServerFn({ method: "POST" })
  .inputValidator((d: { hash: string; action: "pause" | "resume" | "delete" }) => d)
  .handler(async ({ data }) => {
    if (!has("QBIT_URL")) return { ok: true };
    if (data.action === "delete") await qbit("/torrents/delete", { hashes: data.hash, deleteFiles: "false" });
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
      return catalog.filter((c) => c.title.toLowerCase().includes(q.toLowerCase())).map((c, i) => ({ ...c, id: i, inLibrary: false, poster: "", overview: "" }));
    const t = encodeURIComponent(q);
    const [m, s] = await Promise.all([
      has("RADARR_URL") ? safe(arr("RADARR", `/movie/lookup?term=${t}`), []) : [],
      has("SONARR_URL") ? safe(arr("SONARR", `/series/lookup?term=${t}`), []) : [],
    ]);
    return [
      ...(m as any[]).slice(0, 10).map((x) => ({ id: x.tmdbId, title: x.title, year: x.year, type: "Film", inLibrary: !!x.id, poster: posterOf(x), overview: x.overview || "" })),
      ...(s as any[]).slice(0, 10).map((x) => ({ id: x.tvdbId, title: x.title, year: x.year, type: "Sorozat", inLibrary: !!x.id, poster: posterOf(x), overview: x.overview || "" })),
    ];
  });

export const requestMedia = createServerFn({ method: "POST" })
  .inputValidator((d: { id: number; type: string; profile: string }) => d)
  .handler(async ({ data }) => {
    const app = data.type === "Film" ? "RADARR" : "SONARR";
    if (!has(app + "_URL")) return { ok: true };
    const [profiles, roots] = await Promise.all([arr(app, "/qualityprofile"), arr(app, "/rootfolder")]);
    const want = data.profile.toLowerCase().replace("4k", "2160");
    const prof = (profiles as any[]).find((p) => p.name.toLowerCase().replace("4k", "2160").includes(want)) || profiles[0];
    const root = roots[0]?.path;
    const look = await arr(app, app === "RADARR" ? `/movie/lookup/tmdb?tmdbId=${data.id}` : `/series/lookup?term=tvdb:${data.id}`);
    const item = Array.isArray(look) ? look[0] : look;
    const body = app === "RADARR"
      ? { ...item, qualityProfileId: prof.id, rootFolderPath: root, monitored: true, addOptions: { searchForMovie: true } }
      : { ...item, qualityProfileId: prof.id, languageProfileId: 1, rootFolderPath: root, monitored: true, seasonFolder: true, addOptions: { searchForMissingEpisodes: true } };
    await arr(app, app === "RADARR" ? "/movie" : "/series", { method: "POST", body: JSON.stringify(body) });
    return { ok: true };
  });

export const getStatus = createServerFn({ method: "GET" }).handler(async () => {
  const ping = async (ok: boolean, p: () => Promise<unknown>) => (!ok ? "nincs beállítva" : (await p().then(() => "ok", (e) => {
    const c = e?.cause; const code = c?.code || c?.cause?.code || "";
    const hint = /ECONNREFUSED/.test(code) ? "a port zárva / rossz port" : /ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT|EHOSTUNREACH/.test(code) ? "időtúllépés: a cím kívülről nem érhető el"
      : /ENOTFOUND|EAI_AGAIN/.test(code) ? "a címnév nem található" : /CERT|SSL|TLS/i.test(code + (c?.message || "")) ? "tanúsítvány hiba, próbáld http://-vel" : "";
    return `${e?.message || e}${code ? ` (${code})` : ""}${hint ? ` – ${hint}` : ""}`;
  })));
  return {
    qbit: await ping(has("QBIT_URL"), () => qbit("/app/version")),
    radarr: await ping(has("RADARR_URL", "RADARR_KEY"), () => arr("RADARR", "/system/status")),
    sonarr: await ping(has("SONARR_URL", "SONARR_KEY"), () => arr("SONARR", "/system/status")),
    plex: await ping(has("PLEX_URL", "PLEX_TOKEN"), () => plex("/identity")),
    ha: await ping(has("HA_URL", "HA_TOKEN"), () => ha("/api/")),
    dsm: await ping(has("DSM_URL", "DSM_USER"), () => dsmVolumes()),
  };
});

const posterOf = (x: any): string => x.remotePoster || (x.images || []).find((i: any) => i.coverType === "poster")?.remoteUrl || "";

export const getRecommendations = createServerFn({ method: "GET" }).handler(async () => {
  if (!has("RADARR_URL")) return catalog.map((c, i) => ({ ...c, id: i, inLibrary: false, poster: "", overview: "" }));
  const l = await safe(arr("RADARR", "/importlist/movie?includeRecommendations=true&includeTrending=true&includePopular=true"), []);
  return (l as any[]).filter((x) => !x.isExisting && !x.isExcluded).slice(0, 24)
    .map((x) => ({ id: x.tmdbId, title: x.title, year: x.year, type: "Film", inLibrary: false, poster: posterOf(x), overview: x.overview || "" }));
});

export const getLibrary = createServerFn({ method: "GET" }).handler(async () => {
  if (!has("RADARR_URL") && !has("SONARR_URL")) return { demo: true, items: library };
  const [m, s] = await Promise.all([
    has("RADARR_URL") ? safe(arr("RADARR", "/movie"), []) : [],
    has("SONARR_URL") ? safe(arr("SONARR", "/series"), []) : [],
  ]);
  return { demo: false, items: [
    ...(m as any[]).filter((x) => x.sizeOnDisk > 0).map((x) => ({ id: x.id, title: x.title, year: x.year, type: "Film", size: x.sizeOnDisk, added: (x.movieFile?.dateAdded || x.added || "").slice(0, 10), poster: posterOf(x) })),
    ...(s as any[]).filter((x) => x.statistics?.sizeOnDisk > 0).map((x) => ({ id: x.id, title: x.title, year: x.year, type: "Sorozat", size: x.statistics.sizeOnDisk, added: (x.added || "").slice(0, 10), poster: posterOf(x) })),
  ] };
});

export const deleteMedia = createServerFn({ method: "POST" })
  .inputValidator((d: { id: number; type: string }) => d)
  .handler(async ({ data }) => {
    const app = data.type === "Film" ? "RADARR" : "SONARR";
    if (!has(app + "_URL")) return { ok: true };
    const r = await fetch(`${env(app + "_URL")}/api/v3/${app === "RADARR" ? "movie" : "series"}/${data.id}?deleteFiles=true&addImportExclusion=false&addImportListExclusion=false`,
      { method: "DELETE", headers: { "X-Api-Key": env(app + "_KEY") } });
    if (!r.ok && r.status !== 404) throw new Error(`${app} ${r.status}`);
    // let Plex notice the removed files
    if (has("PLEX_URL")) await safe(plex("/library/sections/all/refresh"), null);
    return { ok: true };
  });

async function ha(path: string, body?: unknown) {
  const r = await fetch(`${env("HA_URL")}${path}`, { method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${env("HA_TOKEN")}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : null });
  if (!r.ok) throw new Error(`Home Assistant ${r.status}`);
  return r.json();
}
type Entity = { entity_id: string; state: string; attributes: { friendly_name?: string; unit_of_measurement?: string; device_class?: string } };
const DOMAINS = ["sensor", "light", "switch", "cover", "vacuum", "media_player", "climate", "fan"];
export const getHome = createServerFn({ method: "GET" }).handler(async () => {
  if (!has("HA_URL")) return { demo: true, entities: haDemo as Entity[] };
  const all = (await ha("/api/states")) as Entity[];
  return { demo: false, entities: all.filter((e) => {
    const d = e.entity_id.split(".")[0];
    if (!DOMAINS.includes(d) || e.state === "unavailable") return false;
    if (d === "sensor") return ["power", "energy"].includes(e.attributes.device_class || "") || /growatt|solar|napelem|pv/i.test(e.entity_id);
    return true;
  }).map((e) => ({ entity_id: e.entity_id, state: e.state, attributes: { friendly_name: e.attributes.friendly_name, unit_of_measurement: e.attributes.unit_of_measurement, device_class: e.attributes.device_class } })) };
});
export const homeAction = createServerFn({ method: "POST" })
  .inputValidator((d: { entity_id: string; service: string }) => {
    if (!/^[a-z_]+\.[a-z0-9_]+$/.test(d.entity_id) || !/^[a-z_]+$/.test(d.service)) throw new Error("bad input");
    return d;
  })
  .handler(async ({ data }) => {
    if (!has("HA_URL")) return { ok: true };
    const domain = data.entity_id.split(".")[0];
    await ha(`/api/services/${domain}/${data.service}`, { entity_id: data.entity_id });
    return { ok: true };
  });
