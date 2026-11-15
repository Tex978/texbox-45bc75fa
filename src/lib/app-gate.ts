// Optional password gate for the self-hosted build: active only when APP_PASSWORD is set.
async function tokenFor(pw: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("nas-vezerlo:" + pw));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}

function page(err: boolean) {
  return `<!doctype html><html lang="hu"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NAS Vezérlő – belépés</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#16140f;color:#eee;font-family:system-ui}form{display:grid;gap:12px;width:260px}input,button{padding:12px;border-radius:8px;border:1px solid #444;background:#222;color:#eee;font-size:16px}button{background:#f0a020;color:#111;border:0;font-weight:600}</style></head>
<body><form method="post" action="/__login"><h2>NAS Vezérlő</h2>${err ? "<div>Hibás jelszó</div>" : ""}<input type="password" name="pw" placeholder="Jelszó" autofocus><button>Belépés</button></form></body></html>`;
}

export async function gate(request: Request): Promise<Response | null> {
  const pw = process.env["APP_PASSWORD"];
  if (!pw) return null;
  const token = await tokenFor(pw);
  const url = new URL(request.url);
  if (url.pathname === "/__login" && request.method === "POST") {
    const form = await request.formData();
    if (form.get("pw") === pw) {
      return new Response(null, {
        status: 303,
        headers: {
          location: "/",
          "set-cookie": `nas-auth=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000`,
        },
      });
    }
    return new Response(page(true), { status: 401, headers: { "content-type": "text/html; charset=utf-8" } });
  }
  const cookie = request.headers.get("cookie") ?? "";
  if (cookie.split(/;\s*/).includes(`nas-auth=${token}`)) return null;
  return new Response(page(false), { status: 401, headers: { "content-type": "text/html; charset=utf-8" } });
}
