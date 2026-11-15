// Tuya Smart Life "device sharing" API (QR login with the Smart Life app, no developer account).
export const TUYA_CLIENT = "HA_3y9q4ak7g4ephrvke";
const LOGIN = "https://apigw.iotbing.com";
const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const hmac = async (k: string, s: string) => { const key = await crypto.subtle.importKey("raw", enc.encode(k), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]); return hex(await crypto.subtle.sign("HMAC", key, enc.encode(s))); };
const md5hex = async (s: string) => (await import("./md5")).md5(s);
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const NONCE = "ABCDEFGHJKMNPQRSTWXYZabcdefhijkmnprstwxyz2345678";
const gcmKey = (secret: string, use: KeyUsage) => crypto.subtle.importKey("raw", enc.encode(secret), "AES-GCM", false, [use]);
async function encrypt(raw: string, secret: string) {
  const nonce = Array.from({ length: 12 }, () => NONCE[Math.floor(Math.random() * NONCE.length)]).join("");
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: enc.encode(nonce) }, await gcmKey(secret, "encrypt"), enc.encode(raw));
  return b64(enc.encode(nonce)) + b64(new Uint8Array(ct));
}
async function decrypt(data: string, secret: string) {
  const d = unb64(data);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: d.slice(0, 12) }, await gcmKey(secret, "decrypt"), d.slice(12));
  return new TextDecoder().decode(pt);
}

export type TuyaSess = { a: string; r: string; e: number; ep: string; uid: string; uc: string };

export async function qrStart(userCode: string) {
  const r = await fetch(`${LOGIN}/v1.0/m/life/home-assistant/qrcode/tokens?clientid=${TUYA_CLIENT}&usercode=${encodeURIComponent(userCode)}&schema=haauthorize`, { method: "POST" });
  const j = await r.json() as { success: boolean; result?: { qrcode: string }; msg?: string };
  if (!j.success || !j.result) throw new Error(j.msg || "Hibás User Code");
  return j.result.qrcode;
}
export async function qrResult(token: string, userCode: string): Promise<TuyaSess | null> {
  const r = await fetch(`${LOGIN}/v1.0/m/life/home-assistant/qrcode/tokens/${token}?clientid=${TUYA_CLIENT}&usercode=${encodeURIComponent(userCode)}`);
  const j = await r.json() as { success: boolean; t: number; result?: { access_token: string; refresh_token: string; expire_time: number; endpoint: string; uid: string } };
  if (!j.success || !j.result) return null;
  const x = j.result;
  return { a: x.access_token, r: x.refresh_token, e: j.t + x.expire_time * 1000, ep: x.endpoint.replace(/\/+$/, ""), uid: x.uid, uc: userCode };
}

async function req(s: TuyaSess, method: string, path: string, params?: Record<string, unknown>, body?: Record<string, unknown>) {
  const rid = crypto.randomUUID();
  const hashKey = await md5hex(rid + s.r);
  const secret = (await hmac(rid, hashKey)).slice(0, 16);
  let q = "", b = "";
  if (params && Object.keys(params).length) q = await encrypt(JSON.stringify(params), secret);
  if (body && Object.keys(body).length) b = await encrypt(JSON.stringify(body), secret);
  const h: Record<string, string> = { "X-appKey": TUYA_CLIENT, "X-requestId": rid, "X-sid": "", "X-time": String(Date.now()) };
  if (s.a) h["X-token"] = s.a;
  const signStr = ["X-appKey", "X-requestId", "X-sid", "X-time", "X-token"].filter((k) => h[k]).map((k) => `${k}=${h[k]}`).join("||") + q + b;
  h["X-sign"] = await hmac(hashKey, signStr);
  if (b) h["Content-Type"] = "application/json";
  const r = await fetch(s.ep + path + (q ? `?encdata=${encodeURIComponent(q)}` : ""), { method, headers: h, body: b ? JSON.stringify({ encdata: b }) : null });
  if (!r.ok) throw new Error(`Tuya HTTP ${r.status}`);
  const j = await r.json() as { success: boolean; result?: unknown; msg?: string; code?: number; t?: number };
  if (!j.success) throw new Error(`Tuya: ${j.msg || "hiba"} (${j.code})`);
  let res = j.result;
  if (typeof res === "string") { const t = await decrypt(res, secret); try { res = JSON.parse(t); } catch { res = t; } }
  return { result: res, t: j.t || Date.now() };
}

/** Refresh token if needed; returns possibly-updated session. */
export async function ensure(s: TuyaSess): Promise<TuyaSess> {
  if (s.e - 60000 > Date.now()) return s;
  const { result, t } = await req(s, "GET", `/v1.0/m/token/${s.r}`) as { result: { accessToken: string; refreshToken: string; expireTime: number; uid: string }; t: number };
  return { ...s, a: result.accessToken, r: result.refreshToken, e: t + result.expireTime * 1000, uid: result.uid || s.uid };
}

export type TuyaDevice = { id: string; name: string; category: string; online: boolean; home: string; status: { code: string; value: string | number | boolean }[] };
export async function listTuya(s: TuyaSess): Promise<TuyaDevice[]> {
  const homes = (await req(s, "GET", "/v1.0/m/life/users/homes")).result as { ownerId: string | number; name: string }[];
  const out: TuyaDevice[] = [];
  for (const h of homes || []) {
    const devs = (await req(s, "GET", "/v1.0/m/life/ha/home/devices", { homeId: String(h.ownerId) })).result as { id: string; name: string; category: string; online: boolean; status?: { code: string; value: unknown }[] }[];
    for (const d of devs || []) out.push({ id: d.id, name: d.name, category: d.category, online: d.online, home: h.name,
      status: (d.status || []).map((x) => ({ code: x.code, value: typeof x.value === "object" && x.value !== null ? JSON.stringify(x.value) : x.value as string | number | boolean })) });
  }
  return out;
}
export async function sendTuya(s: TuyaSess, dev: string, code: string, value: boolean | number | string) {
  await req(s, "POST", `/v1.1/m/thing/${dev}/commands`, undefined, { commands: [{ code, value }] });
}
