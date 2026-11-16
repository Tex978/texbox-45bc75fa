import { requirePermission, db } from "./auth.server";
import { dataDir, stateFile, ensureReady } from "./data-guard.server";
import { storeGet, storeSet } from "./shared-store.server";
import { parsePrefs, PREF_STORE_KEY, applyPref } from "./shared-prefs";
import { changeRooms, emptyRooms, roomStateSchema, type RoomAction } from "./rooms";
export function readRooms(token:string|undefined) {
 if(!requirePermission(token))throw new Error("A szobák a NAS-on, bejelentkezés után érhetők el.");
 const raw=parsePrefs(storeGet(PREF_STORE_KEY))["home-rooms"];
 return raw===undefined?emptyRooms:roomStateSchema.parse(raw);
}
export function writeRooms(token:string|undefined,version:number,action:RoomAction) {
 if(!requirePermission(token,"rooms"))throw new Error("Bejelentkezés szükséges.");
 const current=readRooms(token);
 if(current.version!==version)throw new Error("A szobákat közben módosították. Frissíts, és próbáld újra.");
 const next=changeRooms(current,action);
 if(ensureReady().status!=="ready")throw new Error("A NAS adattárolója nem elérhető.");
 const fs=globalThis.process?.getBuiltinModule?.("node:fs") as typeof import("node:fs")|undefined;
 const database=db();if(!fs||!database)throw new Error("A NAS mentése nem elérhető.");
 const folder=`${dataDir()}/backups`;fs.mkdirSync(folder,{recursive:true});
 const snapshot=`${folder}/pre-phase-room.db`;
 if(!fs.existsSync(snapshot))database.exec(`VACUUM INTO '${snapshot.replaceAll("'","''")}'`);
 const jsonSnapshot=`${folder}/pre-phase-room-nas-state.json`;
 if(fs.existsSync(stateFile())&&!fs.existsSync(jsonSnapshot))fs.copyFileSync(stateFile(),jsonSnapshot,fs.constants.COPYFILE_EXCL);
 const prefs=parsePrefs(storeGet(PREF_STORE_KEY));
 if(!storeSet(PREF_STORE_KEY,JSON.stringify(applyPref(prefs,"home-rooms",next,false))))throw new Error("A szobák mentése nem sikerült a NAS-on.");
 return next;
}
