import { db, userCan, type User } from "./auth.server";
const active = new Set<string>();
export function assertDeviceAccess(user: User | null, key: string) {
  if (!user) return; // Preserve legacy adult/shared-password controls before account setup.
  if (!userCan(user, "home")) throw new Error("Nincs okosotthon-vezérlési jogosultságod.");
  const row = db()?.prepare("SELECT allowed FROM scene_device_acl WHERE user_id=? AND device_key=?").get(user.id, key) as { allowed: number } | undefined;
  if (row ? !row.allowed : user.role === "child") throw new Error("Ehhez az eszközhöz nincs külön engedélyed.");
}
export async function withDeviceLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  if (active.has(key)) throw new Error("Az eszközön már folyamatban van egy parancs.");
  active.add(key);
  try { return await fn(); } finally { active.delete(key); }
}