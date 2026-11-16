import { createServerFn } from "@tanstack/react-start";
import { getCookie, getRequest } from "@tanstack/react-start/server";
import { audit, createInviteToken, createUser, db, deleteUser, getUser, isHostedAccountPreview, listUsers, requirePermission, SESSION_COOKIE, sessionUser, updateUser, userCount, userCan } from "./auth.server";
import { PERMISSIONS, ROLES, type Permission, type Role } from "./permissions";

export type Me = { mode: "accounts" | "open"; user: null | { id: string; username: string; displayName: string; role: Role; can: Record<Permission, boolean> } };
export const getMe = createServerFn({ method: "GET" }).handler(async (): Promise<Me> => {
  if (db() === null || userCount() === 0) return { mode: "open", user: null };
  const u = sessionUser(getCookie(SESSION_COOKIE));
  if (!u) return { mode: "accounts", user: null };
  const c = Object.fromEntries(PERMISSIONS.map((p) => [p, userCan(u, p)])) as Record<Permission, boolean>;
  return { mode: "accounts", user: { id: u.id, username: u.username, displayName: u.displayName, role: u.role, can: c } };
});

const admin = () => {
  if (isHostedAccountPreview()) throw new Error("A családi fiókok a Synology NAS-on kezelhetők; az előnézet nem éri el a NAS felhasználóit. Nyisd meg a TexBoxot a saját NAS-címeden.");
  const u = requirePermission(getCookie(SESSION_COOKIE), "users");
  if (!u) throw new Error("A családi fiókokhoz előbb hozd létre az admin fiókot (APP_PASSWORD + /__setup).");
  return u;
};
const origin = () => { const r = getRequest(); const h = r.headers; const proto = h.get("x-forwarded-proto") || new URL(r.url).protocol.replace(":", ""); return `${proto}://${h.get("x-forwarded-host") || h.get("host") || new URL(r.url).host}`; };

export const familyList = createServerFn({ method: "GET" }).handler(async () => {
  const me = admin();
  return { meId: me.id, users: listUsers().map(({ id, username, displayName, role, disabled, hasPassword, permissions }) => ({ id, username, displayName, role, disabled, hasPassword, permissions })) };
});
export const familyCreate = createServerFn({ method: "POST" })
  .inputValidator((d: { username: string; displayName: string; role: Role }) => {
    if (!ROLES.includes(d?.role)) throw new Error("Érvénytelen szerepkör.");
    return { username: String(d.username || ""), displayName: String(d.displayName || ""), role: d.role };
  })
  .handler(async ({ data }) => {
    const me = admin(); const u = createUser(data); audit(me.id, "user-create", u.username);
    return { link: `${origin()}/__invite?t=${createInviteToken(u.id)}` };
  });
export const familyUpdate = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string; displayName?: string; role?: Role; disabled?: boolean; permissions?: Partial<Record<Permission, boolean>> }) => d)
  .handler(async ({ data }) => {
    const me = admin();
    if (data.id === me.id && (data.disabled || (data.role && data.role !== "admin"))) throw new Error("A saját admin jogodat nem veheted el.");
    const { id, ...patch } = data; updateUser(id, patch); audit(me.id, "user-update", id); return { ok: true };
  });
export const familyResetLink = createServerFn({ method: "POST" }).inputValidator((d: { id: string }) => d).handler(async ({ data }) => {
  const me = admin(); if (!getUser(data.id)) throw new Error("Nincs ilyen felhasználó.");
  audit(me.id, "user-reset-link", data.id);
  return { link: `${origin()}/__invite?t=${createInviteToken(data.id)}` };
});
export const familyDelete = createServerFn({ method: "POST" }).inputValidator((d: { id: string }) => d).handler(async ({ data }) => {
  const me = admin(); if (data.id === me.id) throw new Error("Saját magadat nem törölheted.");
  deleteUser(data.id); audit(me.id, "user-delete", data.id); return { ok: true };
});
