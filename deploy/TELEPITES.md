# Telepítés Synologyra

## Új telepítés (ajánlott compose: `deploy/docker-compose.yml`)

1. GitHubon várd meg, hogy az **Actions → Docker image** zöld legyen (a csomag legyen Public, vagy add meg a ghcr.io tokent a Synologyn).
2. **File Station**: hozd létre a projektmappát és benne a `data` mappát, pl. `/volume1/docker/texbox/data`. A compose `create_host_path: false` beállítása miatt hiányzó mappával a konténer **nem indul el** – ez szándékos.
3. **Container Manager → Projekt → Létrehozás**, név: `texbox`, útvonal: `/volume1/docker/texbox`, másold be a compose tartalmát, írd át az `APP_PASSWORD`-ot, és lehetőleg add meg a `TEXBOX_INSTANCE_ID`-t és a `TEXBOX_SECRET_KEY`-t.
4. Nyisd meg: `http://NAS-IP:3050`. Üres data mappánál az app az **„Új TexBox-telepítés?”** oldalt mutatja: add meg az `APP_PASSWORD`-ot és írd be: `UJ TELEPITES`. Csak ezután jön az első admin (`/__setup`).
5. Ha ezt az oldalt egy **már használt** TexBoxnál látod: **ne erősítsd meg**, ne regisztrálj újra. Rossz mappa van csatolva – állítsd le a konténert és ellenőrizd a kötet forrását.

Csak egy példány fusson a 3050-es porton: a régi `nas-vezerlo` projektet állítsd le (ne töröld a data mappáját), mielőtt a `texbox` elindul.

## Különbség a régi compose-hoz képest

| | Régi (`nas-vezerlo`) | Új (`texbox`) |
|---|---|---|
| Kötet | `./data:/data` rövid forma – hiányzó mappát Docker üresen létrehoz | hosszú bind forma, `create_host_path: false` – hiányzó mappánál nem indul |
| Watchtower | engedélyezve, 5 percenként automatikus frissítés | letiltva (`watchtower.enable: "false"`), nincs Watchtower szolgáltatás |
| Útvonalak | alapértelmezett | `DATA_DIR` és `DATA_FILE` kifejezetten `/data` |
| Példány-azonosító | nincs | opcionális `TEXBOX_INSTANCE_ID` |

A NAS-on futó compose-t a Lovable nem tudja átírni; a fenti változtatásokat a Container Managerben kell elvégezni.

## Adatvédelem az alkalmazásban (3b)

- A data mappában egy `.texbox-instance.json` telepítésjelző rögzíti, hogy a `texbox.db` és a `nas-state.json` létrejött-e már. Ha később valamelyik hiányzik, az app **leáll hibaoldallal**, és nem hoz létre üreset.
- A korábbi, jelző nélküli telepítéseket az első indításkor automatikusan felismeri (meglévő `texbox.db` vagy `nas-state.json` alapján), és semmit nem ír át bennük.
- `TEXBOX_INSTANCE_ID` megadásakor a jelző ehhez kötődik; eltérő mappa csatolásakor hibaoldal jelenik meg.
- **Korlát:** egy teljesen új, üres mappában jelző sincs, ezt az app nem tudja megkülönböztetni egy valódi első telepítéstől – ezért kell kézzel megerősíteni. A jelző nem pótolja a mentést.
- Ellenőrzés: **Család és fiókok** oldal → **Adattárolás állapota** kártya (csak adminnak, csak olvas): útvonalak, fájlok, jogosultságok, mentések, és hogy a `/data` külön csatolt kötet-e.

## Mentés (teljes data mappa)

1. Container Manager → `texbox` → **Leállítás** (ne Törlés). Így az SQLite konzisztens.
2. Másold a **teljes** `data` mappát egy új, dátumozott helyre (pl. `/volume1/texbox-mentes/2026-11-16/`), benne: `texbox.db`, ha van `texbox.db-wal` és `texbox.db-shm` (soha ne töröld őket külön), `nas-state.json`, `.texbox-instance.json`, `backups/`.
3. Indítsd újra a konténert. Rendszeresen: Hyper Backup a teljes data mappára.

Az app naponta `backups/texbox-ÉÉÉÉHHNN.db` mentést készít (14 db marad), sémaváltás előtt `backups/pre-*.db` mentést; ezeket az app nem törli. A `nas-state.json` napi mentését nem az app végzi – azt a Hyper Backup fedje le.

## Visszaállítás (csak kézzel, az app sosem állít vissza magától)

1. Állítsd le a konténert. Készíts mentést a jelenlegi data mappáról is (semmit ne írj felül mentés nélkül).
2. Teljes mappából: másold vissza a mentett mappa **teljes tartalmát** (WAL/SHM fájlokkal együtt).
   Napi mentésből: a `backups/texbox-*.db` fájlt másold `texbox.db` néven, és töröld mellőle csak a **régi** `texbox.db-wal`/`-shm` fájlt, miután azt is elmentetted.
3. Ugyanazt a `TEXBOX_SECRET_KEY`-t és `TEXBOX_INSTANCE_ID`-t használd, majd indítsd el.

## Családi fiókok

Belépés után a profilmenü → **Család és jogosultságok**: családtagok, szerepkörök, egyszer használható meghívólinkek (72 óra). A jelszavak csak lenyomatként tárolódnak.

## Kapcsolati adatok titkosítása

`TEXBOX_SECRET_KEY` megadásakor a `nas-state.json` értékei titkosítva íródnak. **A kulcsot őrizd meg**; elvesztése esetén a kapcsolatokat újra meg kell adni.

Telefonról kívülről: Fordított proxy (`https://…` → `localhost:3050`) vagy Tailscale.
