import { z } from "zod";
import type { HomeDevice } from "./home-devices";
const name = z.string().trim().min(1).max(60);
const key = z.string().max(240).regex(/^(sensors|gree|air|blinds|tuya|bosch|locks):.+$/);
export const roomStateSchema = z.object({ version: z.number().int().nonnegative(), rooms: z.array(name).max(200), assignments: z.record(key,z.string().max(60)).refine(v => Object.keys(v).length <= 1000), aliases: z.record(z.string().max(60),z.string().max(60)) });
export type RoomState = z.infer<typeof roomStateSchema>;
export const emptyRooms: RoomState = { version: 0, rooms: [], assignments: {}, aliases: {} };
export const roomActionSchema = z.discriminatedUnion("type", [z.object({ type:z.literal("add"),name }),z.object({ type:z.literal("rename"),from:name,name }),z.object({ type:z.literal("remove"),name }),z.object({ type:z.literal("assign"),key,room:z.string().trim().max(60) })]);
export type RoomAction = z.infer<typeof roomActionSchema>;
const same = (a:string,b:string) => a.toLocaleLowerCase("hu") === b.toLocaleLowerCase("hu");
export function resolveRoom(s:RoomState,d:Pick<HomeDevice,"key"|"room">) {
  if (Object.hasOwn(s.assignments,d.key)) return s.assignments[d.key] ?? "";
  return Object.hasOwn(s.aliases,d.room) ? s.aliases[d.room] ?? "" : d.room;
}
export function roomCatalog(s:RoomState,devices:HomeDevice[]) { return [...new Set([...s.rooms,...devices.map(d=>resolveRoom(s,d)).filter(Boolean)])].sort((a,b)=>a.localeCompare(b,"hu")); }
export function changeRooms(s:RoomState,input:RoomAction):RoomState {
 const a=roomActionSchema.parse(input);
 const n:RoomState={version:s.version+1,rooms:[...s.rooms],assignments:{...s.assignments},aliases:{...s.aliases}};
 if(a.type==="add") { if(!n.rooms.some(r=>same(r,a.name))) n.rooms.push(a.name); }
 else if(a.type==="assign") { const room=n.rooms.find(r=>same(r,a.room)) ?? a.room; if(room&&!n.rooms.includes(room))n.rooms.push(room);n.assignments[a.key]=room; }
 else {
  const target=a.type==="remove"?"":n.rooms.find(r=>r!==a.from&&same(r,a.name))??a.name;
  const old=a.type==="remove"?a.name:a.from;
  n.rooms=[...new Set(n.rooms.filter(r=>r!==old).concat(target?[target]:[]))];
  for(const [k,v] of Object.entries(n.assignments))if(v===old)n.assignments[k]=target;
  for(const [k,v] of Object.entries(n.aliases))if(v===old)n.aliases[k]=target;
  if(old!==target)n.aliases[old]=target;
 }
 return roomStateSchema.parse(n);
}
