// Xiaomi (Mi Home) cloud: unofficial login + signed API calls, used for thermometers.
import { md5 } from "./md5";

type Session = { userId: string; ssecurity: string; serviceToken: string; at: number };
const sessions = new Map<string, Session>();
const UA = "Android-7.1.1-1.0.0-ONEPLUS A3010-136-AAAAAAAAAAAAAA APP/xiaomi.smarthome APPV/62830";
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const parse = (t: string) => JSON.parse(t.replace("&&&START&&&", ""));
function cookieVal(res: Response, name: string) {
  const all = (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [res.headers.get("set-cookie") ?? ""];
  for (const c of all) { const m = c.match(new RegExp(`(?:^|[;,]\\s*)${name}=([^;]+)`)); if (m) return m[1]!; }
  return "";
}

async function login(user: string, pass: string): Promise<Session> {
  const key = user + ":" + md5(pass);
  const s = sessions.get(key);
  if (s && Date.now() - s.at < 12 * 3600e3) return s;
  const deviceId = "nasvez" + md5(user).slice(0, 10);
  const base = { "User-Agent": UA, Cookie: `sdkVersion=accountsdk-18.8.15; deviceId=${deviceId}` };
  const r1 = await fetch("https://account.xiaomi.com/pass/serviceLogin?sid=xiaomiio&_json=true", { headers: base });
  const j1 = parse(await r1.text());
  const body = new URLSearchParams({ sid: "xiaomiio", hash: md5(pass).toUpperCase(), callback: "https://sts.api.io.mi.com/sts",
    qs: "%3Fsid%3Dxiaomiio%26_json%3Dtrue", user, _sign: j1._sign ?? "", _json: "true" });
  const r2 = await fetch("https://account.xiaomi.com/pass/serviceLoginAuth2", { method: "POST", headers: { ...base, "Content-Type": "application/x-www-form-urlencoded" }, body });
  const j2 = parse(await r2.text());
  if (j2.notificationUrl) throw new Error(`A Xiaomi megerősítést kér: nyisd meg ezt a linket, igazold magad, majd próbáld újra: ${j2.notificationUrl}`);
  if (!j2.ssecurity || !j2.location) throw new Error(`Xiaomi belépés sikertelen – ellenőrizd az e-mailt/telefonszámot és jelszót (${j2.desc || j2.code || "ismeretlen hiba"})`);
  const r3 = await fetch(j2.location, { headers: base, redirect: "manual" });
  const serviceToken = cookieVal(r3, "serviceToken");
  if (!serviceToken) throw new Error("Xiaomi: nem kaptunk munkamenetet (serviceToken)");
  const sess = { userId: String(j2.userId), ssecurity: j2.ssecurity, serviceToken, at: Date.now() };
  sessions.set(key, sess);
  return sess;
}

async function hmac(key: Uint8Array<ArrayBuffer>, msg: string) {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg)));
}

async function call(s: Session, region: string, path: string, params: unknown) {
  const nonceB = new Uint8Array(12); crypto.getRandomValues(nonceB.subarray(0, 8));
  new DataView(nonceB.buffer).setUint32(8, Math.floor(Date.now() / 60000));
  const nonce = b64(nonceB);
  const sec = unb64(s.ssecurity);
  const joined = new Uint8Array(sec.length + nonceB.length); joined.set(sec); joined.set(nonceB, sec.length);
  const signedNonce = b64(new Uint8Array(await crypto.subtle.digest("SHA-256", joined)));
  const data = JSON.stringify(params);
  const signature = b64(await hmac(unb64(signedNonce), [path, signedNonce, nonce, "data=" + data].join("&")));
  const host = region === "cn" ? "api.io.mi.com" : `${region}.api.io.mi.com`;
  const r = await fetch(`https://${host}/app${path}`, { method: "POST",
    headers: { "User-Agent": UA, "x-xiaomi-protocal-flag-cli": "PROTOCAL-HTTP2", "Content-Type": "application/x-www-form-urlencoded",
      Cookie: `userId=${s.userId}; yetAnotherServiceToken=${s.serviceToken}; serviceToken=${s.serviceToken}; locale=hu_HU; timezone=GMT%2B01%3A00; channel=MI_APP_STORE` },
    body: new URLSearchParams({ signature, _nonce: nonce, data }) });
  const t = await r.text();
  if (!r.ok) throw new Error(`Xiaomi ${r.status}: ${t.slice(0, 150)}`);
  return JSON.parse(t);
}

// MIoT spec ids shared by common Xiaomi/Qingping BLE thermometers (temperature, humidity, battery).
const PROPS = [{ siid: 3, piid: 1001, k: "temp" }, { siid: 3, piid: 1002, k: "hum" }, { siid: 3, piid: 1008, k: "hum" }, { siid: 2, piid: 1003, k: "battery" }] as const;

export type Thermo = { did: string; name: string; model: string; online: boolean; temp: number | null; hum: number | null; battery: number | null };

export async function listThermometers(user: string, pass: string, region: string): Promise<{ sensors: Thermo[]; raw: string }> {
  const s = await login(user, pass);
  let dl;
  try { dl = await call(s, region, "/home/device_list", { getVirtualModel: true, getHuamiDevices: 1, get_split_device: false, support_smart_home: true }); }
  catch (e) { sessions.clear(); throw e; }
  const list: { did: string; name: string; model: string; isOnline: boolean }[] = dl?.result?.list ?? [];
  const thermos = list.filter((d) => /sensor_ht|th_|temp|thermo|lywsd|cgg|cgdk|miaomiaoce/i.test(d.model));
  const sensors: Thermo[] = thermos.map((d) => ({ did: d.did, name: d.name, model: d.model, online: !!d.isOnline, temp: null, hum: null, battery: null }));
  let rawProps: unknown = null;
  if (thermos.length) {
    const params = thermos.flatMap((d) => PROPS.map((p) => ({ did: d.did, siid: p.siid, piid: p.piid })));
    try {
      const pr = await call(s, region, "/miotspec/prop/get", { params, datasource: 1 });
      rawProps = pr;
      for (const r of (pr?.result ?? []) as { did: string; siid: number; piid: number; code: number; value: number }[]) {
        if (r.code !== 0 || typeof r.value !== "number") continue;
        const t = sensors.find((x) => x.did === r.did); const p = PROPS.find((x) => x.siid === r.siid && x.piid === r.piid);
        if (t && p) t[p.k] = p.k === "temp" && Math.abs(r.value) > 100 ? r.value / 10 : r.value;
      }
    } catch (e) { rawProps = String(e); }
  }
  return { sensors, raw: JSON.stringify({ devices: list.map((d) => ({ name: d.name, model: d.model, online: d.isOnline })), props: rawProps }).slice(0, 6000) };
}
