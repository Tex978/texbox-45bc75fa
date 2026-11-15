# Telepítés Synologyra

1. GitHubon: a repó → **Actions** fül → várd meg, hogy a "Docker image" zöld legyen.
2. GitHubon: a profilod → **Packages** → a csomag → **Package settings** → **Change visibility → Public**
   (vagy hagyd privátnak, és a Synologyn add hozzá a ghcr.io regisztrációt egy tokennel).
3. Synology: **File Station** → hozz létre egy `docker/nas-vezerlo` mappát.
4. **Container Manager → Projekt → Létrehozás** → útvonal: a fenti mappa → forrás: "docker-compose.yml létrehozása" → másold be a `docker-compose.yml` tartalmát, írd át a repó nevét és a jelszót.
5. Nyisd meg: `http://NAS-IP:3050` → jelszó → Kapcsolatok oldalon add meg a címeket (itt már a helyi 192.168.x.x címek működnek).

Frissítés: magától történik – a Lovable-ben tett változás után kb. 10 percen belül.

Telefonról kívülről: Vezérlőpult → Bejelentkezési portál → Speciális → Fordított proxy
(pl. `https://nas.sajatddns.synology.me` → `localhost:3050`), vagy Tailscale.
