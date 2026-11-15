import { createServerFn } from "@tanstack/react-start";
import { getCookie, setCookie, getRequest } from "@tanstack/react-start/server";
import { md5 } from "./md5";
import { volumes, streams, recent, torrents, catalog, library } from "./mock";

const COOKIE = "nas-cfg";
export const FIELDS = ["QBIT_URL", "QBIT_USER", "QBIT_PASS", "RADARR_URL", "RADARR_KEY", "SONARR_URL", "SONARR_KEY", "PLEX_URL", "PLEX_TOKEN", "DSM_URL", "DSM_USER", "DSM_PASS", "GROWATT_USER", "GROWATT_PASS", "GROWATT_SERVER", "GROWATT_SN", "BLINDS_IP", "BLINDS_KEY", "BLINDS_NAMES", "XIAOMI_USER", "XIAOMI_PASS", "XIAOMI_REGION"] as const;
const SECRET = ["XIAOMI_PASS", "BLINDS_KEY", "GROWATT_PASS", "DSM_PASS", "QBIT_PASS", "RADARR_KEY", "SONARR_KEY", "PLEX_TOKEN"];
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
    writeCfg(next);
    return { ok: true };
  });
function writeCfg(next: Record<string, string>) {
  const https = getRequest().url.startsWith("https") || getRequest().headers.get("x-forwarded-proto") === "https";
  setCookie(COOKIE, JSON.stringify(next), { httpOnly: true, path: "/", maxAge: 60 * 60 * 24 * 365,
    ...(https ? { sameSite: "none" as const, secure: true, partitioned: true } : { sameSite: "lax" as const }) });
}
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
    blinds: await ping(has("BLINDS_IP", "BLINDS_KEY"), async () => (await import("./blinds.server")).listBlinds(env("BLINDS_IP"), env("BLINDS_KEY"))),
    growatt: await ping(has("GROWATT_USER", "GROWATT_PASS"), () => growatt()),
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


// Growatt cloud (same account as the ShinePhone app). Unofficial API used by the app itself.
const growattHash = (pw: string) => md5(pw).split("").map((c, i) => (i % 2 === 0 && c === "0" ? "c" : c)).join("");
async function growatt() {
  const base = (env("GROWATT_SERVER") || "https://server.growatt.com").replace(/\/+$/, "");
  // Growatt blocks Dalvik user agents with 403; okhttp passes
  const ua = "okhttp/3.12.0";
  const lr = await fetch(`${base}/newTwoLoginAPI.do`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": ua },
    body: new URLSearchParams({ userName: env("GROWATT_USER"), password: growattHash(env("GROWATT_PASS")) }) });
  const l = await lr.json().catch(() => null);
  if (!l) throw new Error(`Growatt szerver hiba (${lr.status})`);
  if (!l.back?.success) throw new Error(`Growatt belépés sikertelen${l.back?.error ? ` (${l.back.error})` : ""} – ellenőrizd a ShinePhone felhasználónevet és jelszót`);
  const cookie = (lr.headers.getSetCookie?.() || [lr.headers.get("set-cookie") || ""]).map((c) => c.split(";")[0]).join("; ");
  const pr = await fetch(`${base}/PlantListAPI.do?userId=${l.back.user.id}`, { headers: { "User-Agent": ua, Cookie: cookie } });
  const pj = await pr.json().catch(() => ({}));
  // newer Growatt servers wrap the payload in "back"
  const p = pj.back ?? pj;
  const num = (v: unknown) => { const t = String(v ?? "0"); const n = parseFloat(t.replace(/[^0-9.]/g, "")) || 0;
    return /MWh/i.test(t) ? n * 1000 : /kW(?!h)/i.test(t) ? n * 1000 : n; };
  const plants = await Promise.all(((p.data || []) as any[]).map(async (x) => {
    let info: any = {}; const tried: string[] = [];
    for (const op of ["getAllDeviceList", "getAllDeviceListTwo"]) {
      const ir = await fetch(`${base}/newTwoPlantAPI.do?op=${op}&plantId=${x.plantId}&pageNum=1&pageSize=20`, { headers: { "User-Agent": ua, Cookie: cookie } });
      const ij = await ir.json().catch(() => ({}));
      const cand = ij.back ?? ij;
      tried.push(`${op}: ${JSON.stringify(ij).slice(0, 300)}`);
      if ((cand.deviceList || []).length) { info = cand; break; }
    }
    const devs = (info.deviceList || []) as any[];
    // the device list can come back empty for hybrid inverters; fall back to the serial entered on the Connections page
    const manualSn = env("GROWATT_SN");
    if (!devs.length && manualSn) devs.push({ deviceSn: manualSn, deviceType: "" });
    let flow: { pv: number; soc: number; charge: number; discharge: number; load: number; toGrid: number; fromGrid: number } | null = null;
    let flowRaw = "";
    for (const d of devs) {
      const sn = d.deviceSn || d.sn; const t = String(d.deviceType || "").toLowerCase();
      const all = [
        { k: "mix", u: "newMixApi.do?op=getSystemStatus_KW", b: { plantId: String(x.plantId), mixId: sn } },
        { k: "tlx", u: "newTlxApi.do?op=getSystemStatus_KW", b: { plantId: String(x.plantId), id: sn } },
        { k: "storage", u: "newStorageAPI.do?op=getSystemStatusData", b: { plantId: String(x.plantId), storageId: sn } },
      ];
      const match = all.filter((e) => t.includes(e.k) || (e.k === "mix" && t.includes("sph")) || (e.k === "tlx" && t.includes("min")));
      for (const ep of match.length ? match : all) {
      const sr = await fetch(`${base}/${ep.u}`, { method: "POST", headers: { "User-Agent": ua, Cookie: cookie, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(ep.b) });
      const sj = await sr.json().catch(() => null);
      const o = sj?.obj ?? sj?.back?.obj ?? sj?.back ?? sj;
      flowRaw += `${ep.k}: ${JSON.stringify(sj).slice(0, 700)}\n`;
      if (!o || typeof o !== "object" || !("ppv" in o || "pPv" in o || "SOC" in o || "soc" in o)) continue;
      const kw = (...k: string[]) => { for (const key of k) if (o[key] != null && o[key] !== "") return (parseFloat(String(o[key])) || 0) * 1000; return 0; };
      flow = { pv: kw("ppv", "pPv", "pvPower"), soc: parseFloat(String(o.SOC ?? o.soc ?? o.capacity ?? 0)) || 0,
        charge: kw("chargePower", "pCharge"), discharge: kw("pdisCharge1", "pdisCharge", "pDischarge"),
        load: kw("pLocalLoad", "pLoad", "loadPower"), toGrid: kw("pactogrid", "pToGrid"), fromGrid: kw("pactouser", "pToUser") };
      break;
      }
      if (flow) break;
    }
    const devW = flow?.pv || devs.reduce((s2, d) => s2 + num(d.power), 0);
    return { name: String(x.plantName), currentW: devW || num(x.currentPower), todayKwh: num(x.todayEnergy), totalKwh: num(x.totalEnergy),
      online: ((info.deviceList || []) as any[]).map((d) => `${d.deviceSn || d.sn}: ${d.lost ? "offline" : "online"}${d.lastUpdateTime ? ` (${d.lastUpdateTime})` : ""}`).join(", "),
      flow, raw: JSON.stringify({ plant: x, devices: info.deviceList }).slice(0, 1500) + `\n\nlist: ${tried.join(" | ")}` + (flowRaw ? `\n\nstatus: ${flowRaw}` : "") };
  }));
  return {
    currentW: plants.reduce((a, b) => a + b.currentW, 0) || num(p.totalData?.currentPowerSum),
    todayKwh: plants.reduce((a, b) => a + b.todayKwh, 0) || num(p.totalData?.todayEnergySum),
    totalKwh: plants.reduce((a, b) => a + b.totalKwh, 0) || num(p.totalData?.totalEnergySum),
    plants, flow: plants.find((x) => x.flow)?.flow ?? null, raw: JSON.stringify(pj).slice(0, 1500),
  };
}
export const getSolar = createServerFn({ method: "GET" }).handler(async () => {
  if (!has("GROWATT_USER")) return { demo: true, error: "", currentW: 3420, todayKwh: 18.6, totalKwh: 8412, plants: [{ name: "Otthon", currentW: 3420, todayKwh: 18.6, totalKwh: 8412, online: "", flow: null, raw: "" }], flow: { pv: 3420, soc: 64, charge: 1200, discharge: 0, load: 1850, toGrid: 370, fromGrid: 0 }, raw: "" };
  try { return { demo: false, error: "", ...(await growatt()) }; }
  catch (e) { return { demo: false, error: String((e as Error).message || e), currentW: 0, todayKwh: 0, totalKwh: 0, plants: [], flow: null, raw: "" }; }
});

const blindNames = () => Object.fromEntries(env("BLINDS_NAMES").split(",").map((p) => p.split("=").map((x) => x.trim())).filter((p) => p.length === 2));
type BlindsResult = { demo: boolean; error: string; blinds: { mac: string; deviceType: string; name: string; room: string; position: number; battery: number; state: number }[] };
const META = "nas-blinds";
type BlindMeta = Record<string, { name?: string; room?: string }>;
const readMeta = (): BlindMeta => { try { return JSON.parse(getCookie(META) || "{}"); } catch { return {}; } };
export const getBlinds = createServerFn({ method: "GET" }).handler(async (): Promise<BlindsResult> => {
  const meta = readMeta();
  const apply = (b: BlindsResult["blinds"][number], fallback: string) => ({ ...b, name: meta[b.mac]?.name || fallback, room: meta[b.mac]?.room || b.room });
  if (!has("BLINDS_IP")) return { demo: true, error: "", blinds: [
    { mac: "demo1", deviceType: "10000000", name: "Nappali bal", room: "Nappali", position: 0, battery: 0, state: 0 },
    { mac: "demo2", deviceType: "10000000", name: "Nappali jobb", room: "Nappali", position: 0, battery: 0, state: 0 },
    { mac: "demo3", deviceType: "10000000", name: "Hálószoba", room: "Hálószoba", position: 100, battery: 0, state: 0 },
    { mac: "demo4", deviceType: "10000000", name: "Konyha", room: "", position: 50, battery: 0, state: 0 } ].map((b) => apply(b, b.name)) };
  try {
    const { listBlinds } = await import("./blinds.server");
    const names = blindNames();
    const l = await listBlinds(env("BLINDS_IP"), env("BLINDS_KEY"));
    return { demo: false, error: "", blinds: l.map((b, i) => apply({ ...b, name: "", room: "" }, names[b.mac] || names[String(i + 1)] || `Redőny ${i + 1}`)) };
  } catch (e) { return { demo: false, error: String((e as Error).message || e), blinds: [] }; }
});
export const saveBlindMeta = createServerFn({ method: "POST" })
  .inputValidator((d: { items: { mac: string; name: string; room: string }[] }) => ({ items: d.items.slice(0, 100).map((i) => ({ mac: String(i.mac).slice(0, 40), name: String(i.name).trim().slice(0, 40), room: String(i.room).trim().slice(0, 30) })) }))
  .handler(async ({ data }) => {
    const meta = readMeta();
    for (const i of data.items) meta[i.mac] = { ...(i.name ? { name: i.name } : {}), ...(i.room ? { room: i.room } : {}) };
    const https = getRequest().url.startsWith("https") || getRequest().headers.get("x-forwarded-proto") === "https";
    setCookie(META, JSON.stringify(meta), { httpOnly: true, path: "/", maxAge: 60 * 60 * 24 * 365,
      ...(https ? { sameSite: "none" as const, secure: true, partitioned: true } : { sameSite: "lax" as const }) });
    return { ok: true };
  });
export const blindGroupAction = createServerFn({ method: "POST" })
  .inputValidator((d: { blinds: { mac: string; deviceType: string }[]; action: "open" | "close" | "stop" }) => d)
  .handler(async ({ data }) => {
    if (!has("BLINDS_IP")) return { ok: true, failed: 0 };
    const { writeBlind } = await import("./blinds.server");
    const operation = data.action === "open" ? 1 : data.action === "close" ? 0 : 2;
    let failed = 0;
    for (const b of data.blinds.slice(0, 50)) {
      try { await writeBlind(env("BLINDS_IP"), env("BLINDS_KEY"), b.mac, b.deviceType, { operation }); } catch { failed++; }
      await new Promise((r) => setTimeout(r, 150));
    }
    return { ok: failed === 0, failed };
  });
export const blindAction = createServerFn({ method: "POST" })
  .inputValidator((d: { mac: string; deviceType: string; action: "open" | "close" | "stop" | "position"; position?: number }) => d)
  .handler(async ({ data }) => {
    if (!has("BLINDS_IP")) return { ok: true };
    const { writeBlind } = await import("./blinds.server");
    const payload = data.action === "position" ? { targetPosition: Math.max(0, Math.min(100, Math.round(data.position ?? 0))) }
      : { operation: data.action === "open" ? 1 : data.action === "close" ? 0 : 2 };
    await writeBlind(env("BLINDS_IP"), env("BLINDS_KEY"), data.mac, data.deviceType, payload);
    return { ok: true };
  });

export const getThermometers = createServerFn({ method: "GET" }).handler(async () => {
  if (!has("XIAOMI_USER", "XIAOMI_PASS")) return { demo: true, error: "", raw: "", sensors: [
    { did: "d1", name: "Nappali", model: "miaomiaoce.sensor_ht.t2", online: true, temp: 22.4, hum: 48, battery: 87 },
    { did: "d2", name: "Hálószoba", model: "miaomiaoce.sensor_ht.t2", online: true, temp: 20.1, hum: 52, battery: 64 },
    { did: "d3", name: "Gyerekszoba", model: "cgllc.sensor_ht.g1", online: true, temp: 21.3, hum: 45, battery: 91 } ] };
  try {
    const { listThermometers } = await import("./xiaomi.server");
    return { demo: false, error: "", ...(await listThermometers(env("XIAOMI_USER"), env("XIAOMI_PASS"), (env("XIAOMI_REGION") || "de").toLowerCase())) };
  } catch (e) { return { demo: false, error: String((e as Error).message || e), raw: "", sensors: [] }; }
});
