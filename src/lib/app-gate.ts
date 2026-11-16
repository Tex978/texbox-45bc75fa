// Request gate for the self-hosted build.
// - Family accounts exist in texbox.db: every request needs a valid session (login / invite pages excepted).
// - No accounts yet + APP_PASSWORD set: the shared password unlocks the first-admin setup page.
// - No accounts and no APP_PASSWORD (hosted preview): open, as before.
import {
  authStorageUnavailable,
  acceptInvite,
  createUser,
  db,
  endSession,
  inviteUser,
  login,
  createSession,
  sessionMaxAge,
  sessionUser,
  SESSION_COOKIE,
  userCount,
  audit,
} from "./auth.server";
import { ensureReady, initializeNewInstall, NEW_INSTALL_PHRASE } from "./data-guard.server";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const html = (body: string, status = 200, headers: Record<string, string> = {}) =>
  new Response(
    `<!doctype html><html lang="hu"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>TexBox – belépés</title>
<style>*,*::before,*::after{box-sizing:border-box}:root{color-scheme:dark}body{margin:0;padding:16px;min-height:100vh;display:grid;place-items:center;background:radial-gradient(circle at 30% 0%,#1d2733,#0f1216 60%);color:#e9edf2;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
form{display:grid;gap:12px;width:min(396px,calc(100vw - 32px));padding:28px;border-radius:20px;background:#161b21;border:1px solid #27303a;box-shadow:0 20px 60px #0008}
h1{margin:0 0 4px;font-size:22px}p{margin:0;color:#97a3b0;font-size:14px;line-height:1.45}label{display:grid;gap:6px;font-size:13px;color:#b7c1cc}
input,button{padding:13px 14px;border-radius:12px;border:1px solid #2c3642;background:#0f1318;color:#e9edf2;font-size:16px}button{background:#7cc4f0;color:#0b1520;border:0;font-weight:700;cursor:pointer;margin-top:4px}
.err{background:#3a1717;border:1px solid #6b2a2a;color:#ffc9c9;padding:10px 12px;border-radius:10px;font-size:14px}</style></head><body>${body}</body></html>`,
    {
      status,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        ...headers,
      },
    },
  );
const field = (name: string, label: string, type = "text", extra = "") =>
  `<label>${label}<input name="${name}" type="${type}" ${extra}></label>`;
const err = (e?: string) => (e ? `<div class="err" role="alert">${esc(e)}</div>` : "");
const loginPage = (e?: string) =>
  html(
    `<form method="post" action="/__login"><h1>TexBox</h1><p>Jelentkezz be a saját fiókoddal.</p>${err(e)}${field("username", "Felhasználónév", "text", 'autocomplete="username" autocapitalize="none" required autofocus')}${field("pw", "Jelszó", "password", 'autocomplete="current-password" required')}<button>Belépés</button><p>Elfelejtett jelszóhoz kérj új linket az admintól.</p></form>`,
    e ? 401 : 200,
  );
const setupPage = (e?: string) =>
  html(
    `<form method="post" action="/__setup"><h1>Első admin fiók</h1><p>Add meg a régi közös jelszót (APP_PASSWORD), majd hozd létre a saját admin fiókodat.</p>${err(e)}${field("legacy", "Régi közös jelszó", "password", "required")}${field("username", "Felhasználónév", "text", 'autocapitalize="none" required')}${field("name", "Megjelenített név")}${field("pw", "Új jelszó (min. 8 karakter)", "password", 'autocomplete="new-password" minlength="8" required')}<button>Admin létrehozása</button></form>`,
    e ? 400 : 200,
  );
const setupNoticePage = (reason: "storage" | "password") =>
  html(
    reason === "storage"
      ? `<form><h1>Az első admin fiók a NAS-on hozható létre</h1><p>Ez a cím nem a saját NAS-odon fut, ezért itt nem tudunk fiókot menteni. Nyisd meg a TexBoxot a saját NAS-címeden (pl. <code>http://NAS-IP:3050</code>), és ott hozd létre az admin fiókodat a közös jelszó (APP_PASSWORD) megadásával.</p></form>`
      : `<form><h1>Hiányzó közös jelszó</h1><p>A fiókok mentése itt elérhető, de a közös jelszó (APP_PASSWORD) nincs beállítva, ezért az admin fiók nem hozható létre. Írd be a docker-compose.yml <code>environment</code> részébe, indítsd újra a projektet, majd nyisd meg újra ezt az oldalt.</p></form>`,
  );
const initPage = (e?: string, hasPassword = true) =>
  html(
    hasPassword
      ? `<form method="post" action="/__init"><h1>Új TexBox-telepítés?</h1><p>A csatolt data mappa üres: nincs benne fiókadatbázis, beállításfájl és telepítésjelző. Ha korábban már használtad a TexBoxot, <b>ne folytasd</b> – valószínűleg rossz mappa van csatolva. Állítsd le a konténert, és ellenőrizd a kötet forrását.</p>${err(e)}${field("legacy", "Közös jelszó (APP_PASSWORD)", "password", "required")}${field("confirm", `Írd be: ${NEW_INSTALL_PHRASE}`, "text", 'autocapitalize="characters" required')}<button>Új, üres telepítés indítása</button></form>`
      : `<form><h1>Üres data mappa</h1><p>A csatolt data mappa üres. Új telepítéshez állítsd be az APP_PASSWORD értékét a docker-compose-ban; ha korábban már használtad a TexBoxot, ellenőrizd a kötet forrását.</p></form>`,
    e ? 400 : 503,
  );
const invitePage = (t: string, name: string, e?: string) =>
  html(
    `<form method="post" action="/__invite"><h1>Szia, ${esc(name)}!</h1><p>Állítsd be a jelszavadat a TexBoxhoz.</p>${err(e)}<input type="hidden" name="t" value="${esc(t)}">${field("pw", "Új jelszó (min. 8 karakter)", "password", 'autocomplete="new-password" minlength="8" required autofocus')}<button>Jelszó mentése</button></form>`,
    e ? 400 : 200,
  );

const cookieOf = (req: Request, name: string) =>
  (req.headers.get("cookie") ?? "")
    .split(/;\s*/)
    .find((c) => c.startsWith(name + "="))
    ?.slice(name.length + 1);
const https = (req: Request) =>
  req.url.startsWith("https") || req.headers.get("x-forwarded-proto") === "https";
const sessionCookie = (req: Request, value: string, maxAge: number) =>
  `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${https(req) ? "; Secure" : ""}`;
const go = (req: Request, to: string, t?: string) =>
  new Response(null, {
    status: 303,
    headers: {
      location: to,
      ...(t !== undefined ? { "set-cookie": sessionCookie(req, t, t ? sessionMaxAge() : 0) } : {}),
    },
  });
const ip = (req: Request) =>
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
  req.headers.get("x-real-ip") ||
  "local";

async function legacyToken(pw: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("nas-vezerlo:" + pw));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}
function same(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function gate(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname;
  const post = request.method === "POST";
  const guard = ensureReady();
  if (guard.status === "blocked")
    return html(
      `<form><h1>A TexBox biztonsági okból nem indult el</h1><p>${esc(guard.message)}</p><p>Semmit nem töröltünk és nem hoztunk létre. Ne regisztrálj új admint.</p></form>`,
      503,
    );
  if (guard.status === "new-install") {
    const legacyPw = process.env["APP_PASSWORD"];
    if (path === "/__init" && post && legacyPw) {
      const o = request.headers.get("origin");
      const exp = `${https(request) ? "https" : "http"}://${request.headers.get("x-forwarded-host") || request.headers.get("host") || url.host}`;
      if (o && o !== exp) return new Response("Nem engedélyezett kérés.", { status: 403 });
      const f = await request.formData();
      if (!same(String(f.get("legacy") || ""), legacyPw))
        return initPage("A közös jelszó nem egyezik.");
      try {
        initializeNewInstall(String(f.get("confirm") || ""));
      } catch (e) {
        return initPage((e as Error).message);
      }
      return new Response(null, { status: 303, headers: { location: "/__setup" } });
    }
    return initPage(undefined, !!legacyPw);
  }
  if (authStorageUnavailable())
    return html(
      "<form><h1>A belépés átmenetileg nem elérhető</h1><p>A fiókok tárolója nem olvasható. Ellenőrizd a NAS data mappáját.</p></form>",
      503,
    );
  if (post && path.startsWith("/__")) {
    const origin = request.headers.get("origin");
    const expected = `${https(request) ? "https" : "http"}://${request.headers.get("x-forwarded-host") || request.headers.get("host") || url.host}`;
    if (origin && origin !== expected)
      return new Response("Nem engedélyezett kérés.", { status: 403 });
  }
  const legacy = process.env["APP_PASSWORD"];
  const hasDb = db() !== null;
  const accounts = hasDb ? userCount() : 0;

  if (path === "/__logout") {
    if (request.headers.get("sec-fetch-site") === "cross-site")
      return new Response("Nem engedélyezett kérés.", { status: 403 });
    endSession(cookieOf(request, SESSION_COOKIE));
    return go(request, "/", "");
  }

  // Invite / password-reset links work without a session.
  if (hasDb && path === "/__invite") {
    if (post) {
      const f = await request.formData();
      const t = String(f.get("t") || "");
      try {
        return go(request, "/", acceptInvite(t, String(f.get("pw") || "")));
      } catch (e) {
        const u = inviteUser(t);
        return u
          ? invitePage(t, u.displayName, (e as Error).message)
          : loginPage((e as Error).message);
      }
    }
    const t = url.searchParams.get("t") || "";
    const u = inviteUser(t);
    return u
      ? invitePage(t, u.displayName)
      : loginPage("A link lejárt vagy érvénytelen. Kérj újat az admintól.");
  }

  if (accounts > 0) {
    if (path === "/__login") {
      if (!post)
        return sessionUser(cookieOf(request, SESSION_COOKIE)) ? go(request, "/") : loginPage();
      const f = await request.formData();
      const r = login(
        String(f.get("username") || ""),
        String(f.get("pw") || ""),
        ip(request),
        request.headers.get("user-agent") || "",
      );
      return "token" in r ? go(request, "/", r.token) : loginPage(r.error);
    }
    if (sessionUser(cookieOf(request, SESSION_COOKIE))) return null;
    if (path.startsWith("/_serverFn") || path.startsWith("/api/"))
      return new Response(JSON.stringify({ error: "Bejelentkezés szükséges." }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    return loginPage(
      cookieOf(request, SESSION_COOKIE) ? "A munkameneted lejárt. Jelentkezz be újra." : undefined,
    );
  }

  // The first-admin page only exists where accounts can actually be saved (the NAS, with APP_PASSWORD set).
  if (path === "/__setup" && !(hasDb && accounts === 0 && legacy))
    return setupNoticePage(hasDb && accounts === 0 ? "password" : "storage");

  if (!legacy) return null; // hosted preview / unconfigured: open as before

  // No accounts yet: shared password still works, and unlocks first-admin setup.
  if (hasDb && accounts === 0 && path === "/__setup") {
    if (!post) return setupPage();
    const f = await request.formData();
    if (!same(String(f.get("legacy") || ""), legacy))
      return setupPage("A régi közös jelszó nem egyezik.");
    try {
      const u = createUser({
        username: String(f.get("username") || ""),
        displayName: String(f.get("name") || ""),
        role: "admin",
        password: String(f.get("pw") || ""),
      });
      audit(u.id, "setup-admin");
      return go(request, "/", createSession(u.id, request.headers.get("user-agent") || ""));
    } catch (e) {
      return setupPage((e as Error).message);
    }
  }
  const token = await legacyToken(legacy);
  if (path === "/__login" && post) {
    const f = await request.formData();
    if (same(String(f.get("pw") || ""), legacy))
      return new Response(null, {
        status: 303,
        headers: {
          location: hasDb ? "/__setup" : "/",
          "set-cookie": `nas-auth=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`,
        },
      });
    return html(
      `<form method="post" action="/__login"><h1>TexBox</h1>${err("Hibás jelszó")}${field("pw", "Jelszó", "password", "autofocus")}<button>Belépés</button></form>`,
      401,
    );
  }
  if ((request.headers.get("cookie") ?? "").split(/;\s*/).includes(`nas-auth=${token}`))
    return null;
  return html(
    `<form method="post" action="/__login"><h1>TexBox</h1><p>${hasDb ? "Belépés után létrehozhatod a saját admin fiókodat." : ""}</p>${field("pw", "Közös jelszó", "password", "autofocus")}<button>Belépés</button></form>`,
    401,
  );
}
