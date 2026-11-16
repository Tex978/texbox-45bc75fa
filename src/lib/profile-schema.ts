// Client-safe profile rules: built-in avatars, password strength, simple user-agent labels, audit labels.
export const AVATAR_ICONS = [
  "initials", "child", "star", "cat", "dog", "heart", "sun", "moon", "leaf", "rocket", "music", "bike",
] as const;
export type AvatarIcon = (typeof AVATAR_ICONS)[number];
export const AVATAR_ICON_LABELS: Record<AvatarIcon, string> = {
  initials: "Monogram", child: "Gyermek", star: "Csillag", cat: "Cica", dog: "Kutya", heart: "Szív",
  sun: "Nap", moon: "Hold", leaf: "Levél", rocket: "Rakéta", music: "Zene", bike: "Bicikli",
};
export const AVATAR_COLORS = ["c1", "c2", "c3", "c4", "c5", "c6"] as const;
export type AvatarColor = (typeof AVATAR_COLORS)[number];
export const AVATAR_COLOR_LABELS: Record<AvatarColor, string> = {
  c1: "Jégkék", c2: "Zöld", c3: "Borostyán", c4: "Levendula", c5: "Korall", c6: "Grafit",
};
export type Avatar = { icon: AvatarIcon; color: AvatarColor };
export const DEFAULT_AVATAR: Avatar = { icon: "initials", color: "c1" };
export const isAvatarIcon = (v: unknown): v is AvatarIcon =>
  typeof v === "string" && (AVATAR_ICONS as readonly string[]).includes(v);
export const isAvatarColor = (v: unknown): v is AvatarColor =>
  typeof v === "string" && (AVATAR_COLORS as readonly string[]).includes(v);

/** Server-enforced password rule; returns a Hungarian error or null. */
export function passwordProblem(pw: string, ctx: { username?: string; displayName?: string } = {}) {
  if (typeof pw !== "string" || pw.length < 10) return "A jelszó legalább 10 karakter legyen.";
  if (pw.length > 200) return "A jelszó legfeljebb 200 karakter lehet.";
  if (/^(.)\1+$/.test(pw)) return "A jelszó ne egyetlen ismételt karakter legyen.";
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  if (kinds < 2 && pw.length < 16)
    return "Használj legalább kétféle karaktert (kis-/nagybetű, szám, jel), vagy legalább 16 karaktert.";
  const low = pw.toLowerCase();
  for (const w of [ctx.username, ctx.displayName, "texbox", "jelszo", "password", "12345678"])
    if (w && w.length >= 3 && low.includes(w.toLowerCase())) return "A jelszó ne tartalmazza a nevedet vagy egyszerű szavakat.";
  return null;
}
export function passwordStrength(pw: string): 0 | 1 | 2 | 3 {
  if (!pw || pw.length < 10) return 0;
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  if (pw.length >= 16 && kinds >= 3) return 3;
  return kinds >= 3 || pw.length >= 14 ? 2 : 1;
}

/** Plain browser/OS label from a stored user agent; never returns the raw string. */
export function describeUserAgent(ua: string | null | undefined): string {
  const s = ua || "";
  if (!s) return "Ismeretlen eszköz";
  const os = /Android/i.test(s) ? "Android" : /iPhone|iPad|iPod/i.test(s) ? "iPhone/iPad"
    : /Windows/i.test(s) ? "Windows" : /Mac OS X|Macintosh/i.test(s) ? "Mac"
    : /Linux/i.test(s) ? "Linux" : "Ismeretlen rendszer";
  const br = /Edg\//.test(s) ? "Edge" : /OPR\/|Opera/.test(s) ? "Opera" : /SamsungBrowser/.test(s) ? "Samsung Internet"
    : /Firefox\//.test(s) ? "Firefox" : /Chrome\//.test(s) ? "Chrome" : /Safari\//.test(s) ? "Safari" : "Böngésző";
  const kind = /Mobile|Android|iPhone/i.test(s) ? "telefon" : /iPad|Tablet/i.test(s) ? "tablet" : "számítógép";
  return `${br} · ${os} (${kind})`;
}

export const AUDIT_LABELS: Record<string, string> = {
  login: "Bejelentkezés",
  "password-set": "Jelszó beállítva meghívó/visszaállító linkkel",
  "password-change": "Saját jelszó módosítva",
  "profile-update": "Saját profil módosítva",
  "session-revoke": "Egy eszköz kijelentkeztetve",
  "sessions-revoke-others": "Minden más eszköz kijelentkeztetve",
  "user-create": "Családtag meghívva",
  "user-update": "Családtag beállításai módosítva",
  "user-reset-link": "Új meghívó/visszaállító link",
  "user-delete": "Családtag törölve",
  "sessions-revoke": "Családtag munkamenetei lezárva",
  "child-create": "Gyermekprofil létrehozva",
  "child-update": "Gyermekprofil módosítva",
};
