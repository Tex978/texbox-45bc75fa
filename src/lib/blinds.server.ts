// Connector / Motion Blinds hub — local UDP protocol (port 32100 send, 32101 receive).
// Works only when the app runs inside the home network (Docker on the Synology).
const SEND = 32100, RECV = 32101, MCAST = "238.0.0.18";
const msgId = () => new Date().toISOString().replace(/\D/g, "").slice(0, 17);

async function accessToken(token: string, key: string) {
  // AES-128-ECB of one block == first block of AES-CBC with a zero IV
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "AES-CBC" }, false, ["encrypt"]);
  const out = await crypto.subtle.encrypt({ name: "AES-CBC", iv: new Uint8Array(16) }, k, new TextEncoder().encode(token));
  return Array.from(new Uint8Array(out).slice(0, 16)).map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

async function send(ip: string, msg: Record<string, unknown>, ack: string, timeout = 3000): Promise<any> {
  let dgram: any;
  try { dgram = await import(/* @vite-ignore */ "node:" + "dgram"); }
  catch { throw new Error("A redőnyök csak a Synologyn futó változatból vezérelhetők"); }
  return new Promise((resolve, reject) => {
    const sock = dgram.createSocket({ type: "udp4", reuseAddr: true });
    const done = (fn: () => void) => { clearTimeout(timer); try { sock.close(); } catch { /* closed */ } fn(); };
    const timer = setTimeout(() => done(() => reject(new Error("A hub nem válaszolt (ellenőrizd az IP címet)"))), timeout);
    sock.on("error", (e: Error) => done(() => reject(e)));
    sock.on("message", (buf: Buffer) => {
      try { const j = JSON.parse(buf.toString()); if (j.msgType === ack && (!msg["mac"] || j.mac === msg["mac"])) done(() => resolve(j)); } catch { /* ignore */ }
    });
    sock.bind(RECV, () => {
      try { sock.addMembership(MCAST); } catch { /* multicast optional */ }
      sock.send(JSON.stringify({ ...msg, msgID: msgId() }), SEND, ip);
    });
  });
}

export type Blind = { mac: string; deviceType: string; position: number; battery: number; state: number };

export async function listBlinds(ip: string, key: string): Promise<Blind[]> {
  const l = await send(ip, { msgType: "GetDeviceList" }, "GetDeviceListAck");
  const tok = await accessToken(l.token, key);
  const out: Blind[] = [];
  for (const d of (l.data || []) as { mac: string; deviceType: string }[]) {
    if (d.deviceType === l.deviceType) continue; // the hub itself
    const r = await send(ip, { msgType: "ReadDevice", mac: d.mac, deviceType: d.deviceType, AccessToken: tok }, "ReadDeviceAck").catch(() => null);
    out.push({ mac: d.mac, deviceType: d.deviceType, position: r?.data?.currentPosition ?? -1, battery: r?.data?.batteryLevel ?? 0, state: r?.data?.currentState ?? -1 });
  }
  return out;
}

export async function writeBlind(ip: string, key: string, mac: string, deviceType: string, data: Record<string, number>) {
  const l = await send(ip, { msgType: "GetDeviceList" }, "GetDeviceListAck");
  const tok = await accessToken(l.token, key);
  const r = await send(ip, { msgType: "WriteDevice", mac, deviceType, AccessToken: tok, data }, "WriteDeviceAck");
  if (r.actionResult && r.actionResult !== "Ok") throw new Error(`Hub hiba: ${r.actionResult} (rossz kulcs?)`);
}
