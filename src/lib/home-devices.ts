/** Presentation-only device model for the smart-home screens. Reads already-fetched vendor data; never sends commands. */
export type HomeCategory = "sensors" | "gree" | "air" | "blinds" | "tuya" | "bosch" | "locks";
export type HomeDevice = { key: string; category: HomeCategory; name: string; room: string; online: boolean; active: boolean; state: string; value?: string | undefined };
type Status = { code: string; value: string | number | boolean };
export type HomeSources = {
  sensors: { did: string; name: string; online: boolean; temp?: number | null; hum?: number | null }[];
  sensorMeta: Record<string, { name?: string; room?: string } | undefined>;
  gree: { ip: string; name: string; online: boolean; properties: Record<string, string | number> }[];
  purifiers: { did: string; name: string; online: boolean; on?: boolean | null; pm25?: number | null }[];
  blinds: { mac: string; name: string; room: string; position: number }[];
  tuya: { id: string; name: string; online: boolean; status: Status[] }[];
  tuyaMeta: Record<string, { name?: string; room?: string; hidden?: boolean } | undefined>;
  appliances: { haId: string; name: string; connected: boolean; state: string }[];
  locks: { did: string; name: string; online: boolean; battery?: number | null }[];
};
const fmt = (n: number) => n.toLocaleString("hu-HU", { maximumFractionDigits: 1 });
const BOSCH: Record<string, string> = { Inactive: "Kikapcsolva", Ready: "Készenlét", DelayedStart: "Késleltetve", Run: "Fut", Pause: "Szünetel", ActionRequired: "Beavatkozás kell", Finished: "Kész", Error: "Hiba", Aborting: "Leáll" };
export function blindState(p: number) { return p < 0 ? "Ismeretlen" : p === 0 ? "Nyitva" : p === 100 ? "Zárva" : `${100 - p}% nyitva`; }
export function buildHomeDevices(s: HomeSources, includeHidden = false): HomeDevice[] {
  const out: HomeDevice[] = [];
  for (const t of s.sensors) out.push({ key: `sensors:${t.did}`, category: "sensors", name: s.sensorMeta[t.did]?.name || t.name, room: s.sensorMeta[t.did]?.room?.trim() || "", online: t.online, active: false, state: t.hum != null ? `${t.hum}% pára` : t.online ? "Elérhető" : "Offline", value: t.temp != null ? `${fmt(t.temp)}°` : undefined });
  for (const u of s.gree) { const on = u.properties["power"] === "on"; const temp = u.properties["temperature"]; out.push({ key: `gree:${u.ip}`, category: "gree", name: u.name, room: "", online: u.online, active: u.online && on, state: !u.online ? "Offline" : on ? "Bekapcsolva" : "Kikapcsolva", value: typeof temp === "number" ? `${temp}°` : undefined }); }
  for (const p of s.purifiers) out.push({ key: `air:${p.did}`, category: "air", name: p.name, room: "", online: p.online, active: p.online && !!p.on, state: !p.online ? "Offline" : p.on ? "Bekapcsolva" : "Kikapcsolva", value: p.pm25 != null ? `${p.pm25}` : undefined });
  for (const b of s.blinds) out.push({ key: `blinds:${b.mac}`, category: "blinds", name: b.name, room: b.room?.trim() || "", online: true, active: b.position >= 0 && b.position < 100, state: blindState(b.position) });
  for (const d of s.tuya) { if (!includeHidden && s.tuyaMeta[d.id]?.hidden) continue; const sw = d.status.find((x) => /^switch(_led|_1)?$/.test(x.code) && typeof x.value === "boolean"); out.push({ key: `tuya:${d.id}`, category: "tuya", name: s.tuyaMeta[d.id]?.name || d.name, room: s.tuyaMeta[d.id]?.room?.trim() || "", online: d.online, active: d.online && sw?.value === true, state: !d.online ? "Offline" : sw ? (sw.value ? "Bekapcsolva" : "Kikapcsolva") : "Elérhető" }); }
  for (const a of s.appliances) out.push({ key: `bosch:${a.haId}`, category: "bosch", name: a.name, room: "", online: a.connected, active: a.connected && a.state !== "Inactive", state: a.connected ? BOSCH[a.state] || a.state || "Elérhető" : "Offline" });
  for (const l of s.locks) out.push({ key: `locks:${l.did}`, category: "locks", name: l.name, room: "", online: l.online, active: false, state: l.online ? "Elérhető" : "Offline", value: l.battery != null ? `${l.battery}%` : undefined });
  return out;
}
/** Groups only devices that carry a real room in existing metadata; the rest stay in a general list. */
export function groupByRoom(devices: HomeDevice[]) {
  const rooms = new Map<string, HomeDevice[]>();
  for (const d of devices) if (d.room) rooms.set(d.room, [...(rooms.get(d.room) ?? []), d]);
  return { rooms: [...rooms.entries()].sort(([a], [b]) => a.localeCompare(b, "hu")), other: devices.filter((d) => !d.room) };
}
