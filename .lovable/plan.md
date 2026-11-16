# TexBox – átfogó továbbfejlesztési terv

## 1. Jelenlegi állapot (audit)

- **Belépés:** egyetlen közös jelszó (`APP_PASSWORD`, `src/lib/app-gate.ts`). A süti a jelszó SHA-256 lenyomata, nem jár le egy évig, nincs felhasználó, szerepkör, kijelentkezés vagy próbálkozás-korlát. Ha nincs beállítva, az app teljesen nyitott.
- **Tárolás:** `src/lib/shared-store.server.ts` – egy JSON fájl (`/data/nas-state.json`), kulcs → szöveg, atomikus írással, memóriában tartott másolattal. A kapcsolati adatok (Plex, Arr, qBittorrent, DSM, Growatt, Xiaomi, Tuya, Gree, Bosch) titkosítás nélkül vannak benne. Régi böngésző-süti a tartalék.
- **Csak böngészőben tárolt adatok (localStorage):** kedvencek, téma, Gree szobák és hozzárendelések, redőny/Tuya/háztartási gép beállítások egy része – ezek telefononként eltérnek.
- **Adatbázis nincs** (sem Supabase, sem más). Docker: `node:22-bookworm-slim`, `/data` kötet, port 3050, Watchtower frissítés, GitHub Action képépítés.
- **Szerverfüggvények:** 43 darab egy fájlban (`nas.functions.ts`, 857 sor); egyik sem ellenőriz felhasználót vagy jogosultságot.
- **Keresés / média:** TMDB (`TMDB_KEY`), OMDb (`OMDB_KEY`), Radarr/Sonarr. Kategóriák: ajánlott, új, népszerű, felkapott; nincs műfaj-, év-, értékelés- vagy szolgáltatószűrő, a feltételek nem maradnak meg.
- **Streaming:** külön oldal nincs. A TMDB `watch/providers` és a `discover` `watch_region=HU` szűrője a meglévő kulccsal elérhető (adatforrás: JustWatch).
- **Energia:** a Growatt inverter-szintű előzmény működik (nap/hónap/év/összes, a hét napi adatokból). Saját mérésgyűjtés nincs.
- **UI:** az Okosotthon és az Energia új. Az Áttekintő, a Keresés, a Letöltések, a Tárhely és a Kapcsolatok még a régi, egyszerű elrendezést használja. Nincs profilmenü.

## 2. Javasolt megoldás: minden a NAS-on, külső szolgáltatás nélkül

**Ajánlott: SQLite (`/data/texbox.db`) + saját belépés a meglévő szerveren.**
- Előny: semmilyen új konténer vagy fiók nem kell, ingyenes, az adatok otthon maradnak, a mentés egyetlen fájl.
- Megvalósítás: a Node 22 beépített `node:sqlite` modulja vagy `better-sqlite3`. A jelszavak scrypt lenyomatként tárolódnak, a munkamenet véletlen tokenből képzett, HttpOnly sütiben.
- **Alternatíva – Lovable Cloud (hosted):** kész belépés, e-mailes meghívó és jelszó-visszaállítás. Hátrány: az adatok a felhőben vannak, a NAS-nak internetkapcsolat kell hozzá, a LAN-szolgáltatásokat így sem éri el közvetlenül. Ezt csak akkor érdemes választani, ha a valódi e-mailes meghívó fontos.
- **Alternatíva – self-hosted Supabase vagy Postgres a Synologyn:** 6–10 konténer és sok memória. Egy családnak túlzás.

## 3. Adatmodell (SQLite)

```text
users(id, username, display_name, avatar, password_hash, role, disabled, created_at)
sessions(id_hash, user_id, expires_at, user_agent, created_at)
invites(token_hash, role, expires_at, used_by)        -- egyszer használható link
permissions(user_id, key, allowed)                    -- felülírás a szerepkörön felül
secrets(name, ciphertext, iv, updated_at)             -- AES-GCM, kulcs: TEXBOX_SECRET_KEY
settings(scope, owner_id NULL, key, json, updated_at) -- scope: household | user
audit_log(id, user_id, action, target, at)
energy_samples(ts_utc PK, pv_w, load_w, grid_in_w, grid_out_w, batt_w, soc)
energy_daily(day_local PK, pv_kwh, load_kwh, in_kwh, out_kwh, source)
```
- **Közös (household):** eszköznevek, szobák, Gree/hőmérő/redőny hozzárendelések, Tuya rejtett eszközök.
- **Személyes (user):** kedvencek, téma, keresési szűrők.

## 4. Szerepkörök és jogosultságok

| Művelet | Admin | Felnőtt | Gyerek |
|---|---|---|---|
| Áttekintő, Tárhely megtekintése | igen | igen | igen |
| Keresés, Streaming | igen | igen | igen (korhatár-szűrővel, opcionális) |
| Film kérése (Radarr/Sonarr) | igen | igen | beállítható |
| Letöltések kezelése, törlés | igen | igen | nem |
| Okosotthon vezérlés | igen | igen | beállítható (pl. csak lámpa és redőny) |
| Zárak | igen | igen | nem |
| Szobák és eszköznevek szerkesztése | igen | igen | nem |
| Kapcsolatok, titkos adatok | igen | nem | nem |
| Felhasználókezelés | igen | nem | nem |

A titkos adatok soha nem kerülnek a böngészőbe. A Kapcsolatok oldal csak annyit mutat, hogy egy adat be van-e állítva, és felülírni lehet.

## 5. Belépés és átállás

1. Első indítás: ha nincs felhasználó, a `/setup` oldalon létrejön az admin (a régi `APP_PASSWORD` igazolja a jogosultságot).
2. Belépés felhasználónévvel és jelszóval: 30 napos munkamenet, kijelentkezés, 5 hibás próbálkozás után várakozás.
3. Meghívás: az admin linket hoz létre (szerepkör + lejárat), a családtag a linken állít jelszót. Jelszó-visszaállítás: az admin új linket ad ki (e-mail nélkül, LAN-on ez a legegyszerűbb).
4. Minden szerverfüggvény egy közös ellenőrzésen megy át (`requireUser(permission)`). A Plex képek útvonala is.
5. Átállás: induláskor a `nas-state.json` tartalma titkosítva a `secrets` és `settings` táblába kerül, a régi fájl `nas-state.json.bak` néven megmarad. Böngészőből az első belépéskor egyszer átkerülnek a localStorage-adatok (kedvencek, Gree szobák), meglévő közös adatot nem írnak felül.

## 6. Keresés és Streaming felfedező

- **Keresés:** szűrőpanel (telefonon alulról felcsúszó lap). Típus, TMDB műfajok magyar nevekkel, év-tartomány, minimum értékelés, rendezés (népszerűség, értékelés, megjelenés), elérhetőség (könyvtárban / kérhető / HU streaming). Szűrők az URL-ben és a felhasználó beállításai között.
- **Új `/streaming` oldal:** szolgáltató-chipek (Netflix, Max, Disney+, Prime Video, Apple TV+, SkyShowtime stb. – azok, amelyeket a TMDB `watch/providers/regions` HU-ra visszaad). Fülek: Új (7 / 30 / 90 nap, `discover` + `with_watch_providers` + `watch_region=HU`), Népszerű, Felkapott (napi és heti TMDB trending, szolgáltatóra szűrve az adott cím HU-adatai alapján). Csak a TMDB által HU-ra igazolt szolgáltató jelenik meg, „Forrás: JustWatch” jelöléssel.
- **Korlát:** a TMDB nem ad pontos „mikor került fel a platformra” dátumot, csak megjelenési dátumot. Ezt az oldal kiírja. Gyorsítótár 6 óra, a TMDB kérésszám-korlátja miatt.

## 7. Energia-előzmény saját tárolással

- A Growatt API jelenleg is ad napi, havi és éves adatot, ezért a saját gyűjtés kiegészítés: 15 percenként egy mérés (a meglévő megosztott lekérés újrahasznosításával, extra belépés nélkül) és éjjel a napi összesítő mentése.
- Az időpontok UTC-ben tárolódnak, a nap határa Europe/Budapest szerint számol (téli/nyári időszámítás). A kulcs a mérés időpontja, így nincs duplikáció. A hiányzó időszak hiányként jelenik meg.
- Előny: a Growatt kiesésekor is van előzmény, és a hét, valamint a tetszőleges időszak-összehasonlítás gyors.

## 8. UX/UI az egész appban

- Egységes keret: asztali gépen bal oldali menü, telefonon alsó menü (Áttekintő, Média, Otthon, Energia, Több). Felül profil és felhasználóváltó (avatar, név, szerepkör, kijelentkezés).
- **Áttekintő:** személyes köszöntés, hibák és figyelmeztetések elöl, Most nézik / Nemrég nézett / Új a könyvtárban, otthon-összesítő.
- **Média:** Keresés, Streaming és Könyvtár egy helyen, alfülekkel.
- **Letöltések:** sebesség-összesítő, szűrők, nagy gombok, megerősítés törlés előtt.
- **Tárhely:** kötetek, telítettség, figyelmeztető szintek.
- **Beállítások:** Kapcsolatok (állapotjelzéssel és teszttel), Család (fiókok, meghívók, jogosultságok), Megjelenés, Mentés.
- Egységes állapotok: betöltés közbeni váz, üres állapot teendővel, hiba újrapróbálással, demó-jelzés csak az admin számára részletes.

## 9. Gree klímák

A kiválasztott klíma panelje és a szobák már elkészültek. Ebben a tervben a szobák és hozzárendelések a közös `settings` táblába kerülnek (egyszeri átvitel a böngészőből), a Gree parancsok és a lekérdezés nem változnak.

## 10. Mentés és visszaállítás

- Hyper Backup a `/data` mappára (DB + régi JSON). Az app éjjel `texbox-YYYYMMDD.db` pillanatképet készít (SQLite `VACUUM INTO`), 14 napig megtartja.
- Admin oldal: mentés letöltése. A titkos adatok csak a `TEXBOX_SECRET_KEY` kulccsal olvashatók, ezt külön (jelszókezelőben) kell megőrizni.
- Visszaállítás: konténer leállítása, `.db` fájl visszamásolása, indítás. Ez le lesz írva a `deploy/TELEPITES.md` fájlban.

## 11. Környezeti változók (docker-compose)

- `TEXBOX_SECRET_KEY` (új, kötelező, 32 bájtos véletlen érték, a titkok titkosításához)
- `DATA_DIR=/data` (új; a `DATA_FILE` a régi fájl helye marad)
- `SESSION_DAYS=30` (opcionális)
- `APP_PASSWORD` (csak az első admin létrehozásához; utána elhagyható)
- Meglévők maradnak: `TMDB_KEY`, `OMDB_KEY` és a kapcsolati env tartalékok.

## 12. Mérföldkövek (prioritás szerint)

1. **M1 – Biztonsági alap (ezt érdemes először):** SQLite, felhasználók, belépés és munkamenet, admin létrehozása, `requireUser` minden szerverfüggvényen, titkosított titkok, átállás a JSON-ból, mentés.
2. **M2 – Közös beállítások:** `settings` tábla, localStorage-átvitel, kedvencek, téma, szobák és Gree-hozzárendelések szerverről.
3. **M3 – Család:** meghívók, szerepkörök, jogosultsági mátrix, gyerekkorlátok, profilmenü, napló.
4. **M4 – Keresés:** szűrők és megőrzött feltételek.
5. **M5 – Streaming felfedező oldal.**
6. **M6 – Egységes app-keret és oldalak újratervezése.**
7. **M7 – Energia saját idősortárolás.**

## 13. Tesztek

- Jelszó-lenyomat ellenőrzése, a hibás jelszó elutasítása, lejárt munkamenet, kijelentkezés.
- Jogosultság: gyerek nem éri el a kapcsolatokat, törlést, zárakat; admin igen; jogosultság nélküli kérés 401/403.
- A titkos adatok nem kerülnek bele egyetlen kliensnek küldött válaszba sem.
- Átállás: a JSON adatai megmaradnak, kétszeri futtatás nem duplikál.
- Energia: duplikált időpont, nyári/téli időszámítás váltásának napja, hiányzó időszak.
- Streaming: csak a HU-ra igazolt szolgáltató jelenik meg.

## 14. A te döntésed kell hozzá

- Saját NAS-os belépés (ajánlott) vagy Lovable Cloud?
- Meghívás csak linkkel, vagy kell e-mail is? (E-mailhez SMTP-adatok kellenének.)
- Gyerekfiókok alapkorlátai: mit vezérelhetnek és kérhetnek, kell-e korhatár-szűrés?
- A régi közös jelszavas belépés maradjon-e tartalékként?
- Az `TEXBOX_SECRET_KEY` megadása a docker-compose-ban (útmutatót adok).
- API-kulcs: a meglévő TMDB-kulcs elég, új nem kell.

## Technikai megjegyzések és kockázatok

- A `nas.functions.ts` szétbontása modulokra (media, home, energy, admin) lesz az M1 része, a viselkedés nem változik.
- A `node:sqlite` a Node 22-ben még kísérleti. Ha gond van vele, a `better-sqlite3` natív fordítást kér az arm64/amd64 képekben (a natív runnerek ezt kezelik).
- Az átállás ideje alatt a régi JSON csak olvasható tartalékként szolgál, adatot nem töröl a rendszer.
- A hosted előnézetben nincs fájlrendszer, ott az app demó/belépés nélküli módban fut tovább.
