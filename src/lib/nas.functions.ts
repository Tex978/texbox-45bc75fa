import { createServerFn } from "@tanstack/react-start";
import { getCookie, setCookie, getRequest } from "@tanstack/react-start/server";
import { volumes, streams, recent, torrents, catalog } from "./mock";

const COOKIE = "nas-cfg";
export const FIELDS = ["QBIT_URL", "QBIT_USER", "QBIT_PASS", "RADARR_URL", "RADARR_KEY", "SONARR_URL", "SONARR_KEY", "PLEX_URL", "PLEX_TOKEN"] as const;
const SECRET = ["QBIT_PASS", "RADARR_KEY", "SONARR_KEY", "PLEX_TOKEN"];
const readCfg = (): Record<string, string> => { try { return JSON.parse(getCookie(COOKIE) || "{}"); } catch { return {}; } };
const env = (k: string) => { const v = readCfg()[k] || process.env[k] || ""; return SECRET.includes(k) ? v : v.trim().replace(/\/$/, ""); };

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
const isDemo = () => !has("QBIT_URL") && !has("RADARR_URL") && !has("SONARR_URL") && !has("PLEX_URL");

async function arr(app: "RADARR" | "SONARR", path: string, init?: RequestInit) {
  const r = await fetch(`${env(app + "_URL")}/api/v3${path}`, { ...init, headers: { "X-Api-Key": env(app + "_KEY"), "Content-Type": "application/json" } });
  if (!r.ok) throw new Error(`${app} ${r.status}`);
  return r.json();
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
  if (!/^ok/i.test(lt)) throw new Error(`qBittorrent: váratlan válasz (${login.status}): ${lt.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 120)}`);
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
  if (isDemo()) return { demo: true, volumes, streams, recent: recent.map((r) => ({ ...r, thumb: "" })) };
  const disks = has("RADARR_URL") ? await safe(arr("RADARR", "/diskspace"), []) : [];
  const seen = new Set<number>();
  const vols = (disks as { path: string; freeSpace: number; totalSpace: number }[])
    .filter((d) => d.totalSpace > 1e11 && !seen.has(d.totalSpace) && seen.add(d.totalSpace))
    .map((d) => ({ name: d.path, used: +((d.totalSpace - d.freeSpace) / 1e12).toFixed(1), total: +(d.totalSpace / 1e12).toFixed(1) }));
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
  }
  return { demo: false, volumes: vols, streams: st, recent: rc };
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
      return catalog.filter((c) => c.title.toLowerCase().includes(q.toLowerCase())).map((c, i) => ({ ...c, id: i, inLibrary: false }));
    const t = encodeURIComponent(q);
    const [m, s] = await Promise.all([
      has("RADARR_URL") ? safe(arr("RADARR", `/movie/lookup?term=${t}`), []) : [],
      has("SONARR_URL") ? safe(arr("SONARR", `/series/lookup?term=${t}`), []) : [],
    ]);
    return [
      ...(m as any[]).slice(0, 10).map((x) => ({ id: x.tmdbId, title: x.title, year: x.year, type: "Film", inLibrary: !!x.id })),
      ...(s as any[]).slice(0, 10).map((x) => ({ id: x.tvdbId, title: x.title, year: x.year, type: "Sorozat", inLibrary: !!x.id })),
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
  const ping = async (ok: boolean, p: () => Promise<unknown>) => (!ok ? "nincs beállítva" : (await p().then(() => "ok", (e) => String(e.message || e))));
  return {
    qbit: await ping(has("QBIT_URL"), () => qbit("/app/version")),
    radarr: await ping(has("RADARR_URL", "RADARR_KEY"), () => arr("RADARR", "/system/status")),
    sonarr: await ping(has("SONARR_URL", "SONARR_KEY"), () => arr("SONARR", "/system/status")),
    plex: await ping(has("PLEX_URL", "PLEX_TOKEN"), () => plex("/identity")),
  };
});
