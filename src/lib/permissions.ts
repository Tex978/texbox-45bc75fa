// Client-safe role/permission rules shared by the server guard and the family admin UI.
export const ROLES = ["admin", "adult", "child"] as const;
export type Role = (typeof ROLES)[number];
export const PERMISSIONS = [
  "settings",
  "users",
  "downloads",
  "request",
  "home",
  "locks",
  "rooms",
  "family",
] as const;
export type Permission = (typeof PERMISSIONS)[number];
export const PERMISSION_LABELS: Record<Permission, string> = {
  family: "Gyermekprofilok kezelése",
  settings: "Kapcsolatok és titkos adatok",
  users: "Családtagok kezelése",
  downloads: "Letöltések kezelése, törlés",
  request: "Film/sorozat kérése",
  home: "Okosotthon vezérlés",
  locks: "Zárak",
  rooms: "Szobák, eszköznevek szerkesztése",
};
export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  adult: "Felnőtt",
  child: "Gyerek",
};
const DEFAULTS: Record<Role, Permission[]> = {
  admin: [...PERMISSIONS],
  adult: ["downloads", "request", "home", "locks", "rooms", "family"],
  child: ["home"],
};
// Admin-only permissions can never be granted to other roles by override.
const ADMIN_ONLY: Permission[] = ["settings", "users"];
export function can(
  role: Role,
  perm: Permission,
  overrides: Partial<Record<Permission, boolean>> = {},
): boolean {
  if (role === "admin") return true;
  if (ADMIN_ONLY.includes(perm)) return false;
  return overrides[perm] ?? DEFAULTS[role].includes(perm);
}
