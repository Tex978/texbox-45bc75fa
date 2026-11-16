import { afterEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resetAuthDb } from "@/lib/auth.server";
import { changeRooms, emptyRooms, resolveRoom } from "@/lib/rooms";
import { buildHomeDevices, type HomeSources } from "@/lib/home-devices";
let dir="";
afterEach(()=>{resetAuthDb();vi.resetModules();delete process.env["DATA_FILE"];delete process.env["DATA_DIR"];if(dir)rmSync(dir,{recursive:true,force:true});});
it("assigns all seven stable device categories including Xiaomi air/sensor/lock",()=>{
 const source:HomeSources={sensors:[{did:"s",name:"Sensor",online:true}],sensorMeta:{s:{room:"Régi"}},gree:[{ip:"g",name:"Gree",online:true,properties:{}}],purifiers:[{did:"a",name:"Air",online:true}],blinds:[{mac:"b",name:"Blind",room:"",position:0}],tuya:[{id:"t",name:"Tuya",online:true,status:[]}],tuyaMeta:{},appliances:[{haId:"h",name:"Bosch",connected:true,state:"Ready"}],locks:[{did:"l",name:"Lock",online:true}]};
 const devices=buildHomeDevices(source);expect(devices.map(d=>d.key)).toEqual(["sensors:s","gree:g","air:a","blinds:b","tuya:t","bosch:h","locks:l"]);
 let s=emptyRooms;for(const d of devices)s=changeRooms(s,{type:"assign",key:d.key,room:"Nappali"});
 expect(devices.map(d=>resolveRoom(s,d))).toEqual(Array(7).fill("Nappali"));
 expect(resolveRoom(emptyRooms,devices[0] as NonNullable<typeof devices[0]>)).toBe("Régi");
});
it("rename merges conflicts and removal suppresses legacy fallback without changing vendor data",()=>{
 const d={key:"sensors:s",room:"Régi"};let s=changeRooms(emptyRooms,{type:"add",name:"Nappali"});
 s=changeRooms(s,{type:"rename",from:"Régi",name:"nappali"});expect(s.rooms).toEqual(["Nappali"]);expect(resolveRoom(s,d)).toBe("Nappali");
 s=changeRooms(s,{type:"remove",name:"Nappali"});expect(resolveRoom(s,d)).toBe("");expect(d.room).toBe("Régi");
 s=changeRooms(s,{type:"assign",key:d.key,room:""});expect(resolveRoom(s,d)).toBe("");
});
it("NAS writes survive module/database restart, preserve legacy config, ACL and version conflicts",async()=>{
 dir=mkdtempSync(join(tmpdir(),"rooms-"));process.env["DATA_DIR"]=dir;process.env["DATA_FILE"]=`${dir}/nas-state.json`;resetAuthDb();vi.resetModules();
 const auth=await import("@/lib/auth.server");const parent=auth.createUser({username:"apa",displayName:"Apa",role:"admin",password:"jelszo123"});const second=auth.createUser({username:"anya",displayName:"Anya",role:"adult",password:"jelszo123"});const child=auth.createUser({username:"gyerek",displayName:"Gyerek",role:"child",password:"jelszo123"});
 const a=auth.createSession(parent.id,"PC"),b=auth.createSession(second.id,"Mobile"),c=auth.createSession(child.id,"Mobile");
 const store=await import("@/lib/shared-store.server");store.storeSet("nas-cfg","unchanged-secret-placeholder");store.storeSet("shared-prefs",JSON.stringify({"home-gree-rooms":{rooms:["Régi"],assignments:{g:"Régi"}}}));
 const server=await import("@/lib/rooms.server");expect(()=>server.readRooms(undefined)).toThrow();expect(()=>server.writeRooms(c,0,{type:"add",name:"Tiltott"})).toThrow();
 let s=server.writeRooms(a,0,{type:"assign",key:"air:a",room:"Nappali"});expect(server.readRooms(b)).toEqual(s);expect(()=>server.writeRooms(b,0,{type:"add",name:"Verseny"})).toThrow("közben");
 expect(existsSync(`${dir}/backups/pre-phase-room.db`)).toBe(true);expect(readFileSync(`${dir}/backups/pre-phase-room-nas-state.json`,"utf8")).toContain("home-gree-rooms");expect(store.storeGet("nas-cfg")).toBe("unchanged-secret-placeholder");
 auth.resetAuthDb();vi.resetModules();const again=await import("@/lib/rooms.server");expect(again.readRooms(b)).toEqual(s);s=again.writeRooms(b,s.version,{type:"assign",key:"sensors:s",room:"Nappali"});expect(s.assignments).toEqual({"air:a":"Nappali","sensors:s":"Nappali"});
 const fresh=await import("@/lib/auth.server");fresh.updateUser(child.id,{disabled:true});expect(()=>again.readRooms(c)).toThrow();fresh.resetAuthDb();
});
it("rejects unknown device prefixes",()=>{expect(()=>changeRooms(emptyRooms,{type:"assign",key:"evil:x",room:"Nappali"})).toThrow();});
