const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const sha = async (s: string) => hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
const hmac = async (k: string, s: string) => { const key = await crypto.subtle.importKey("raw", enc.encode(k), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]); return hex(await crypto.subtle.sign("HMAC", key, enc.encode(s))).toUpperCase(); };
const HOSTS: Record<string, string> = { eu: "https://openapi.tuyaeu.com", us: "https://openapi.tuyaus.com", cn: "https://openapi.tuyacn.com", in: "https://openapi.tuyain.com", weu: "https://openapi-weaz.tuyaeu.com" };
const tokens = new Map<string, { t: string; e: number }>();

async function call(id: string, secret: string, region: string, method: string, path: string, body?: unknown, tok?: string) {
  const host = HOSTS[region] || HOSTS.eu!;
  const b = body ? JSON.stringify(body) : "";
  const t = Date.now().toString();
  const str = `${method}\n${await sha(b)}\n\n${path}`;
  const sign = await hmac(secret, id + (tok || "") + t + str);
  const h: Record<string, string> = { client_id: id, t, sign, sign_method: "HMAC-SHA256", "Content-Type": "application/json" };
  if (tok) h.access_token = tok;
  const r = await fetch(host + path, { method, headers: h, body: b || null });
  const j = await r.json() as { success: boolean; result?: unknown; msg?: string; code?: number };
  if (!j.success) throw new Error(`Tuya: ${j.msg || "hiba"} (${j.code ?? r.status})`);
  return j.result;
}
async function token(id: string, secret: string, region: string) {
  const c = tokens.get(id); if (c && c.e > Date.now() + 60000) return c.t;
  const r = await call(id, secret, region, "GET", "/v1.0/token?grant_type=1") as { access_token: string; expire_time: number };
  tokens.set(id, { t: r.access_token, e: Date.now() + r.expire_time * 1000 }); return r.access_token;
}
export type TuyaDevice = { id: string; name: string; category: string; online: boolean; status: { code: string; value: string | number | boolean }[] };
export async function listTuya(id: string, secret: string, region: string): Promise<TuyaDevice[]> {
  const tok = await token(id, secret, region);
  const out: TuyaDevice[] = []; let last = "";
  for (let i = 0; i < 10; i++) {
    const r = await call(id, secret, region, "GET", `/v2.0/cloud/thing/device?page_size=20${last ? `&last_id=${last}` : ""}`, undefined, tok) as { id: string; name?: string; customName?: string; category: string; isOnline: boolean }[];
    for (const d of r || []) out.push({ id: d.id, name: d.customName || d.name || d.id, category: d.category, online: d.isOnline, status: [] });
    if (!r || r.length < 20) break; last = r[r.length - 1]!.id;
  }
  for (let i = 0; i < out.length; i += 20) {
    const ids = out.slice(i, i + 20).map((d) => d.id).join(",");
    const st = await call(id, secret, region, "GET", `/v1.0/iot-03/devices/status?device_ids=${ids}`, undefined, tok).catch(() => []) as { id: string; status: TuyaDevice["status"] }[];
    for (const s of st || []) { const d = out.find((x) => x.id === s.id); if (d) d.status = (s.status || []).map((x) => ({ code: x.code, value: typeof x.value === "object" ? JSON.stringify(x.value) : x.value })); }
  }
  return out;
}
export async function sendTuya(id: string, secret: string, region: string, dev: string, code: string, value: boolean | number | string) {
  const tok = await token(id, secret, region);
  await call(id, secret, region, "POST", `/v1.0/iot-03/devices/${dev}/commands`, { commands: [{ code, value }] }, tok);
}
