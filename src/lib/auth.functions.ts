import { createServerFn } from "@tanstack/react-start";
import { getCookie, getRequest } from "@tanstack/react-start/server";
import {
  authStorageUnavailable,
  createChildProfile,
  updateChildProfile,
  listChildProfiles,
  familyAccountStatus,
  isOwner,
  revokeUserSessions,
  audit,
  createInviteToken,
  createUser,
  db,
  deleteUser,
  getUser,
  isHostedAccountPreview,
  listUsers,
  requirePermission,
  SESSION_COOKIE,
  sessionUser,
  updateUser,
  userCount,
  userCan,
  updateOwnProfile,
  changeOwnPassword,
  listOwnSessions,
  revokeOwnSession,
  revokeOtherOwnSessions,
  listAudit,
  type User,
} from "./auth.server";
import type { Avatar } from "./profile-schema";
import { PERMISSIONS, ROLES, type Permission, type Role } from "./permissions";

export type Me = {
  mode: "accounts" | "open" | "preview" | "unavailable";
  user: null | {
    id: string;
    username: string;
    displayName: string;
    role: Role;
    avatar: Avatar;
    can: Record<Permission, boolean>;
  };
};
export const getMe = createServerFn({ method: "GET" }).handler(async (): Promise<Me> => {
  if (isHostedAccountPreview()) return { mode: "preview", user: null };
  if (authStorageUnavailable()) return { mode: "unavailable", user: null };
  if (db() === null || userCount() === 0) return { mode: "open", user: null };
  const u = sessionUser(getCookie(SESSION_COOKIE));
  if (!u) return { mode: "accounts", user: null };
  const c = Object.fromEntries(PERMISSIONS.map((p) => [p, userCan(u, p)])) as Record<
    Permission,
    boolean
  >;
  return {
    mode: "accounts",
    user: {
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      role: u.role,
      avatar: u.avatar,
      can: c,
    },
  };
});

const familyAccess = () => {
  // Hosted previews (and any runtime without the NAS database) cannot see household accounts.
  if (authStorageUnavailable())
    throw new Error(
      "A NAS fióktárolója nem olvasható. Próbáld újra a mentési jogosultságok ellenőrzése után.",
    );
  if (isHostedAccountPreview() || db() === null)
    throw new Error(
      "A családi fiókok a Synology NAS-on kezelhetők; ez a nézet nem éri el a NAS felhasználóit. Nyisd meg a TexBoxot a saját NAS-címeden.",
    );
  const u = requirePermission(getCookie(SESSION_COOKIE), "family");
  if (!u)
    throw new Error(
      "A családi fiókokhoz előbb hozd létre az admin fiókot a NAS-címeden (/__setup).",
    );
  return u;
};
const admin = () => {
  const u = familyAccess();
  if (!userCan(u, "users")) throw new Error("A fiókok kezeléséhez admin jogosultság szükséges.");
  return u;
};
const owner = () => {
  const u = admin();
  if (!isOwner(u.id)) throw new Error("Ezt csak a tulajdonos végezheti el.");
  return u;
};
const origin = () => {
  const r = getRequest();
  const h = r.headers;
  const proto = h.get("x-forwarded-proto") || new URL(r.url).protocol.replace(":", "");
  return `${proto}://${h.get("x-forwarded-host") || h.get("host") || new URL(r.url).host}`;
};

export const familyList = createServerFn({ method: "GET" }).handler(async () => {
  const me = familyAccess();
  return {
    meId: me.id,
    canManageAccounts: userCan(me, "users"),
    owner: isOwner(me.id),
    children: listChildProfiles(),
    users: listUsers().map(
      ({ id, username, displayName, role, disabled, hasPassword, permissions, avatar }) => ({
        id,
        avatar,
        username,
        displayName,
        role,
        disabled,
        hasPassword,
        permissions: userCan(me, "users") ? permissions : {},
        ...familyAccountStatus(id),
      }),
    ),
  };
});
export const familyCreate = createServerFn({ method: "POST" })
  .inputValidator((d: { username: string; displayName: string; role: Role }) => {
    if (!ROLES.includes(d?.role)) throw new Error("Érvénytelen szerepkör.");
    return {
      username: String(d.username || ""),
      displayName: String(d.displayName || ""),
      role: d.role,
    };
  })
  .handler(async ({ data }) => {
    const me = admin();
    if (data.role === "admin") owner();
    if (data.role === "child") throw new Error("Gyermekhez szülői profilt hozz létre.");
    const u = createUser(data);
    audit(me.id, "user-create", u.username);
    return { link: `${origin()}/__invite?t=${createInviteToken(u.id)}` };
  });
export const familyUpdate = createServerFn({ method: "POST" })
  .inputValidator(
    (d: {
      id: string;
      displayName?: string;
      role?: Role;
      disabled?: boolean;
      permissions?: Partial<Record<Permission, boolean>>;
    }) => d,
  )
  .handler(async ({ data }) => {
    const me = admin();
    if (getUser(data.id)?.role === "admin" || data.role === "admin") owner();
    if (data.id === me.id && (data.disabled || (data.role && data.role !== "admin")))
      throw new Error("A saját admin jogodat nem veheted el.");
    const { id, ...patch } = data;
    updateUser(id, patch);
    audit(me.id, "user-update", id);
    return { ok: true };
  });
export const familyResetLink = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data }) => {
    const me = admin();
    if (getUser(data.id)?.role === "admin") owner();
    if (!getUser(data.id)) throw new Error("Nincs ilyen felhasználó.");
    audit(me.id, "user-reset-link", data.id);
    return { link: `${origin()}/__invite?t=${createInviteToken(data.id)}` };
  });
export const familyDelete = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data }) => {
    const me = admin();
    if (getUser(data.id)?.role === "admin") owner();
    if (data.id === me.id) throw new Error("Saját magadat nem törölheted.");
    deleteUser(data.id);
    audit(me.id, "user-delete", data.id);
    return { ok: true };
  });

export const familyCreateChild = createServerFn({ method: "POST" })
  .inputValidator((d: { displayName: string; icon: string }) => d)
  .handler(async ({ data }) => ({
    id: createChildProfile(familyAccess(), String(data.displayName || ""), data.icon),
  }));
export const familyUpdateChild = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string; displayName: string; icon: string; disabled: boolean }) => d)
  .handler(async ({ data }) => {
    updateChildProfile(familyAccess(), data.id, data.displayName, data.icon, data.disabled);
    return { ok: true };
  });
export const familyRevokeSessions = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data }) => {
    const me = admin();
    if (getUser(data.id)?.role === "admin") owner();
    revokeUserSessions(data.id);
    audit(me.id, "sessions-revoke", data.id);
    return { ok: true };
  });

/** Admin-only, read-only storage health (paths, presence, backups); never returns secrets or writes files. */
export const getStorageStatus = createServerFn({ method: "GET" }).handler(async () => {
  admin();
  const { storageReport } = await import("./data-guard.server");
  return storageReport();
});

// ---- 1b: own account. Every handler resolves the caller from the session cookie; no user id is accepted. ----
const self = (): User => {
  if (isHostedAccountPreview() || db() === null)
    throw new Error(
      "A saját profil a Synology NAS-on kezelhető; ez az előnézet nem éri el a családi fiókokat, így itt semmi nem mentődik.",
    );
  if (authStorageUnavailable())
    throw new Error("A NAS fióktárolója nem olvasható. A fiókbeállítások biztonsági okból szünetelnek.");
  const u = requirePermission(getCookie(SESSION_COOKIE));
  if (!u) throw new Error("Saját profilhoz előbb hozd létre az admin fiókot a NAS-címeden (/__setup).");
  return u;
};
export const profileGet = createServerFn({ method: "GET" }).handler(async () => {
  const u = self();
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    role: u.role,
    owner: isOwner(u.id),
    avatar: u.avatar,
    version: u.profileVersion,
    hasPassword: u.hasPassword,
  };
});
export const profileUpdate = createServerFn({ method: "POST" })
  .inputValidator((d: { displayName: string; icon: string; color: string; version: number }) => ({
    displayName: String(d?.displayName ?? ""),
    icon: String(d?.icon ?? ""),
    color: String(d?.color ?? ""),
    version: Number(d?.version ?? -1),
  }))
  .handler(async ({ data }) => {
    const u = updateOwnProfile(self(), data);
    return { version: u.profileVersion };
  });
export const passwordChange = createServerFn({ method: "POST" })
  .inputValidator((d: { current: string; next: string; signOutOthers: boolean }) => ({
    current: String(d?.current ?? ""),
    next: String(d?.next ?? ""),
    signOutOthers: d?.signOutOthers !== false,
  }))
  .handler(async ({ data }) => changeOwnPassword(self(), data, getCookie(SESSION_COOKIE)));
export const sessionsList = createServerFn({ method: "GET" }).handler(async () =>
  listOwnSessions(self().id, getCookie(SESSION_COOKIE)),
);
export const sessionRevoke = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string }) => ({ id: String(d?.id ?? "").slice(0, 64) }))
  .handler(async ({ data }) => {
    revokeOwnSession(self(), data.id, getCookie(SESSION_COOKIE));
    return { ok: true };
  });
export const sessionsRevokeOthers = createServerFn({ method: "POST" }).handler(async () => ({
  count: revokeOtherOwnSessions(self(), getCookie(SESSION_COOKIE)),
}));
export const auditList = createServerFn({ method: "GET" })
  .inputValidator((d: { scope: "me" | "family" }) => ({
    scope: d?.scope === "family" ? ("family" as const) : ("me" as const),
  }))
  .handler(async ({ data }) => listAudit(self(), data.scope));
