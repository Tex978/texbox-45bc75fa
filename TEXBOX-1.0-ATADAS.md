# TEXBOX 1.0 – átadási jegyzet

**Dátum:** 2026-11-16. **Fejlesztői QA:** lezárva a lent jelzett korlátokkal. **Éles Synology átvétel:** nyitott; a NAS közvetlenül nem érhető el innen.

## Mit tud az 1.0?
Magyar, önhostolt családi központ: meghívásos felnőttfiókok, kezelt gyermekprofilok és megőrzött gyermek-loginok; saját profil/jelszó/eszközök és napló; kézi és időzített jelenetek; feladatok/szülői döntés/személyes pontnapló/jutalombolt; bevásárlás, receptek, heti menü, naptár, belső értesítések, jegyzetek és ügyek. Személyes főoldal és öt fő terület. Keresésbe integrált Streaming, Plex, letöltések, tárhely és a meglévő Gree/Tuya/redőny/Xiaomi/Bosch/légtisztító/zár/Growatt nézetek megmaradtak. A gyártói kapcsolatok valós működése NAS-on igazolandó.

## Ebben a QA-körben javított hibák
| Szint | Reprodukció és javítás |
|---|---|
| P1 | Más fiók ismert beváltási kérésazonosítójára a szerver visszaadta az eredeti ügylet ID-ját/státuszát. Most a hívó, személy és jutalom egyezése, illetve a személyhez való hozzáférés kötelező; saját újrapróbálás nem költ újra. |
| P1 | Futó jelenet módosítása után a régi lépések továbbfuthattak, miközben az engedélyellenőrzés már az új lépéslistára történt. Most az eredeti verzió kötelező minden lépés és adapter-küldés előtt; változáskor további régi parancs nem indul. A már elküldött fizikai parancsot nem lehet visszavonni. |

Mindkettő előbb elbukó, majd sikeres izolált regressziós teszttel igazolt. A javítás ugyanúgy védi a kézi és időzített jelenetindítást. Új funkció/séma/migráció nincs. Új NAS-snapshotot nem vezettem be: a legutóbbi meglévő profilmentés `backups/pre-profile-phase1b.db` maradt; az éles mentésekhez nem nyúltam.

## Ellenőrzési eredmény és határok
- **243/243 Vitest-teszt, 54 fájl**, teljes regresszió; **8/8 Python Gree-próba** külön ideiglenes környezetben a Dockerben rögzített 2.7.5 könyvtárral. Valódi eszközparancs nem történt.
- Izolált valódi SQLite: auth/session-visszavonás, profil/jelszó UI-mentés és visszaolvasás, privát/gyermek ACL, approval/pont/beváltás egyediség, készlet/foglalás, értesítési elkülönítés, scheduler lease/DST/restart; organizer/calendar/notes regressziók. A két szülő versengő döntésének stale-version próbái sikeresek; ez nem két éles NAS-telefon bizonyítéka.
- Ügy→feladat: meglévő `SAVEPOINT task_tx` és külső tranzakció ellenőrizve; szándékosan hibázó kapcsolatbeillesztés után feladat sincs, újrapróbálás pontosan egyet hoz létre. A task modulhoz nem nyúltam.
- POST Origin: idegen login/invite/RPC tiltás és saját originű hitelesített RPC átengedés tesztelve; a meglévő TanStack CSRF middleware jelen van. Saját profil RPC-k sessionből választják a célt.
- **Célzott lint:** 6 módosított/új kódfájl, 0 hiba/figyelmeztetés. Teljes projektlintet nem nevezünk tisztának: korábban ismert, körön kívüli technikai adósság marad.
- **Típus/automatikus build:** legutóbbi ellenőrzési napló `build OK`, a QA-tesztben talált típushiba javítva. **Külön production Node22/Docker image build és futtatás ebben a körben nem igazolt**; az automatikus napló nem igazolja a GHCR-image vagy NAS működését.
- **Böngésző:** 14 régi útvonal × 390/768/1280 px; mind betöltött, nincs vízszintes kilógás vagy pageerror; `/streaming` → `/search?view=streaming`. Tartalomugrás, Több menü Enter/Escape használat működik. Világos/sötét és előnézeti hibaállapotok megtekintve. Bejelentkezett családi böngészőfolyamat nem volt elérhető az előnézetben; az izolált UI-tesztek nem helyettesítik az éles átvételt.
- Render/UI/navigáció nem lett újratervezve. `/data`, DATA_DIR/DATA_FILE, instance ID, titkok, 3b guard, Compose, Dockerfile, Watchtower, port és Actions érintetlen. Nem publikáltam és nem indítottam NAS-frissítést.

## Maradék kockázatok
- **P0:** új reprodukált, nyitott adatvesztési hiba ebben a körben nem került elő; ez nem általános adatvesztés-mentességi garancia. A korábbi NAS-incidens élő oka és restart/frissítés utáni megőrzés továbbra sem igazolt.
- **P1 átvételi kapu:** éles adatmount, image-fordítás, belépés és ütemező/hardver viselkedése külön ellenőrzendő. A scheduler single Node processre készült; hosszú gyártói hívás/folyamatcsere lease-viselkedését a tesztek nem igazolják minden éles körülményre.
- **P2/korlát:** külső gyártói API-k rendelkezésre állása nem garantált; ACK nem fizikai állapot. A meghívó/reset 8 karakteres és a saját jelszócsere 10 karakteres meglévő szabálya eltér. A folyamatmemóriás próbálkozási zár restartkor alaphelyzetbe kerül. Privát értesítések címzettszűrése tesztelt, későbbi jogosultságváltozás korábbi inbox-bejegyzéseit nem törli automatikusan.

## NAS-on kézzel végzendő átvétel
1. **Új image előtt adatmentés:** a külön Watchtower körülbelül 120 másodpercenként ellenőrizhet és automatikusan frissíthet. A tulajdonos a mentési ablakra állítsa le, ne törölje; ezt az agent nem végezte el és nem módosította a beállítását.
2. Container Managerben rögzítsd a `texbox` konténer `/data` csatolásának **abszolút forrását**; restart/frissítés előtt-után ugyanaz legyen. Csak egy megfelelő példány használja a megszokott portot. Ne hozz létre új üres data mappát, ne regisztrálj új admint hibánál.
3. Leállított TexBox mellett mentsd a **teljes csatolt data mappát**: `texbox.db`, meglévő `texbox.db-wal`/`texbox.db-shm`, `nas-state.json`, `.texbox-instance.json`, `backups` és minden további fájl. WAL/SHM fájlt ne törölj. A titkosítási kulcsot külön biztonságosan őrizd; ne másold chatbe. Ellenőrizd a mentés olvashatóságát; automatikus restore tilos.
4. Ellenőrizd a meglévő napi/fázisbackupokat, különösen `pre-profile-phase1b.db`; a napi mentés DB-megnyitáskor készül, nem garantált éjféli szolgáltatás. Teljes NAS-mentés továbbra is szükséges.
5. **Sima restart**, majd külön **image-frissítés** után ugyanazzal a korábbi fiókkal jelentkezz be; ne új regisztrációval. Ellenőrizd ugyanazokat a szobaneveket, kapcsolatokat, kedvenceket, személyes elrendezést, feladat/pont/jutalom és szervezőadatokat. Meglévő session megmaradása is ellenőrizendő.
6. Két felnőtt külön telefonon: meghívó egyszer használható, profilnév/ikon átjön, másik eszköz visszavonása érvényes, jelszócsere működik. Privát jegyzet/személyes pont másik felnőttnél nem látszik. Kezelt gyermekprofil nem belépési fiók; child-login nem szerkeszt jogot/pontot, csak engedélyezett családi adatot lát.
7. Gyermekfeladat → két szülő jóváhagyása: egyetlen ledger-jóváírás, külön értesítés; gyermekjutalom foglalás → egy döntés, egyszeri levonás vagy feloldás/készlet-visszaadás. Bevásárláspipa nem ad pontot. Ügyből kétszeri task-gomb egyetlen 0 pontos feladat.
8. Naplóban keresd a `TexBox scheduler started` sort; ellenőrizd a friss lease/aktiválhatóságot és az emlékeztetőt. A naplósor önmagában nem bizonyít sikeres időzített parancsot. Új szabály alapból kikapcsolt; kiesett futást nem pótol, megszakadt fizikai parancsot nem ismétel.
9. **Csak a tulajdonos által előre jóváhagyott, biztonságos jelenettel** végezz kézi és jövőbeli időzített próbát, fizikai állapot visszaellenőrzésével. Zárat ne automatizálj. A fejlesztői QA nem vezérelt készüléket.
10. Ellenőrizd a Keresés/Streaming, Plex-poszter, letöltés/tárhely és minden gyártói olvasás működését; hiba esetén a státuszt rögzítsd, ne állíts vissza adatot vakon. Éles sikeres átvétel csak ezek után jelenthető.

## Tudatosan opcionális 2.0 backlog
Telefonos push, érzékelőalapú automatizálás, konkrét személyes eszközkedvencek, részletes admin/eszközaktivitás/szobajogok, ügyemlékeztető/naptárkapcsolás, fájl- és profilképfeltöltés, drag-drop, kozmetika és saját energiagyűjtés. Nem akadályozzák az 1.0 fejlesztői lezárását; külön kérés nélkül nem indul új modul.

## Pontos változtatási lista
Javítás: `src/lib/points.server.ts`, `src/lib/scenes.server.ts`.
Tesztek: `src/test/points.test.ts`, `src/test/scenes.test.ts`, `src/test/app-gate.test.ts`, új `src/test/profile-ui.test.tsx`.
Dokumentumok: `src/lib/AGENTS.md`, `roadmap.md`, `.lovable/plan/TEXBOX-CSALADI-ROADMAP.md`, új `TEXBOX-1.0-ATADAS.md`.