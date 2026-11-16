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


## Családi fiókok (új)

1. Frissítés után nyisd meg az appot, lépj be a régi közös jelszóval (`APP_PASSWORD`).
2. Automatikusan a **/__setup** oldalra kerülsz: hozd létre a saját admin fiókodat.
3. A profilmenüben (jobb felső sarok) → **Család és jogosultságok**: új családtag felvétele, szerepkör (Admin / Felnőtt / Gyerek), egyedi jogosultságok, letiltás, törlés. Mindenkinek egyszer használható linket adsz, azon állítja be a jelszavát (72 óráig érvényes). Elfelejtett jelszónál ugyanígy új link.
4. A fiókok a `data/texbox.db` fájlban vannak, a jelszavak csak lenyomatként. Naponta mentés készül: `data/backups/texbox-ÉÉÉÉHHNN.db` (14 nap).

## Kapcsolati adatok titkosítása

Add meg a `TEXBOX_SECRET_KEY` értéket a docker-compose-ban, majd indítsd újra a projektet. Az első indításkor a `data/nas-state.json` tartalma titkosítva újraíródik. **A kulcsot őrizd meg** (jelszókezelő): elvesztése esetén a kapcsolatokat újra meg kell adni.

## Visszaállítás

Állítsd le a projektet, másold vissza a kívánt `backups/texbox-*.db` fájlt `data/texbox.db` néven (és a Hyper Backupból a `nas-state.json`-t), majd indítsd el. Ugyanazt a `TEXBOX_SECRET_KEY`-t használd.
