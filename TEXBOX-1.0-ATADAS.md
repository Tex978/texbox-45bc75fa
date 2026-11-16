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

## Végleges 1.0 felületi átdolgozás – 2026-11-16
- **Shell:** az Otthonon is ugyanaz az öt fő tab; a régi hatos alsó menü helyett belső, görgethető fülek. Desktopon egy fő felső menü. Profil és harang megmaradt, Több nem ismétli a fő céloldalakat.
- **Főoldal:** rövid köszöntő/dátum és kis szerkesztőikon; három aktuális feladat részletes oldalra mutató gombbal, egy következő program, kompakt kártyarács. A személyes sorrend, elrejtés és jelenetkedvencek nem íródtak felül. Hőmérséklet/pára/napelem csak meglévő, nem-demo és hibamentes adatból jelenik meg. Hiba részlete kinyitható, nem sikernek látszik.
- **Otthon:** 30–32px hőmérséklet, kisebb állapotösszefoglaló és gyorselérések; visszafogott online/offline számok. Minden gyártói panel és Energia/Jelenetek megmaradt.
- **Szervező:** egy soros Bevásárlás/Receptek/Menü/Naptár/Jegyzetek fülek, kisebb fejléc, listaváltó + újlista-gomb, termékbevitel + kinyitható részletek. Frissítési információ ikon mögött, frissítési hibánál célzott figyelmeztetés. Állandó NAS-disclaimer helyett a valódi előnézeti/mentési hibák maradnak láthatók.
- **Ellenőrzés:** 244/244 Vitest, 54 fájl; teljes korábbi auth/guard/scenes/task/points/organizer regresszió. Célzott lint 0 hiba és 5 meglévő fast-refresh exportfigyelmeztetés. Automatikus típus/fordítás napló `build OK`; külön Node22 production Docker-image build nem igazolt és nem futtattam manuálisan.
- **Böngésző:** 14 URL × 360/390/768/1280, nincs vízszintes kilógás vagy pageerror; minden mobil tartalmi oldalon pontosan öt közös főtab, nincs fix Otthon-almenü; Szervező/Otthon fülek kattintása és nyílbillentyűs váltás működik. Sötét közös és világos Otthon megtekintve. Az előnézetben nincs bejelentkezett NAS-család: valódi családi adatos képernyő és többtelefonos átvétel **nyitott**. Izolált SQLite UI-mentés és visszaolvasás sikeres, nem élő NAS-teszt.
- **Nem változott:** szervermodulok, üzleti szabályok, DB/séma, adattár/guard, titkok, sessionök, Compose/Docker/Actions/Watchtower. Nem publikáltam, nem frissítettem NAS-t és nem küldtem eszközparancsot.

### Öt fő pont kézi NAS-ellenőrzése
1. Főoldal: saját kártyasorrend/elrejtés és kedvenc jelenetek megmaradnak, valós mérés és saját feladat/pont látható.
2. Otthon: az ötös közös alsó menü végig elérhető; Szobák/Eszközök/Jelenetek/Energia belső fül, meglévő gyártói panelek nyithatók.
3. Feladatok: korábbi felelősök/státuszok/pontok, szülői jóváhagyás és saját feladat megnyitása változatlan.
4. Család: bevásárlástétel és mennyiség/bolt megmarad, öt alfül, profilok és Ajándékbolt a Több/profil menüből elérhető.
5. Média: Keresés/Streaming, Plex, Letöltések/Tárhely működik; profil és harang oldalváltás után is elérhető.

**Felületi kör fájljai:** `src/components/Shell.tsx`, `Dashboard.tsx`, `Organizer.tsx`, `src/routes/home.tsx`, `src/routes/organizer.tsx`, `src/styles.css`, `src/test/dashboard-ui.test.tsx`, `navigation.test.tsx`, `organizer-ui.test.tsx`, `AGENTS.md`, `roadmap.md`, `.lovable/plan/TEXBOX-CSALADI-ROADMAP.md`, `TEXBOX-1.0-ATADAS.md`.

## Korábbi QA maradék kockázatai
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
## Tulajdonosi szoba/avatár javítás – 2026-11-16
- Kész: az Otthon Szobák és Eszközök fülén Szobák kezelése; minden összesítő eszközcsempén Szoba módosítása. Kereshető rövid eszközsorok, szobaszűrő, felvétel, átnevezés/összevonás és törlés. Xiaomi hőmérő/légtisztító/zár, Gree, Tuya, redőny és Bosch prefixelt kulcsai támogatottak; rejtett valódi eszközök a kezelőben is szerepelnek. Demo sorok nem menthetők.
- Tárolás: meglévő shared-prefs `home-rooms`, rooms jogosultsággal és külön verzióellenőrzött RPC-vel; az általános preferenciamentő nem írhatja. Explicit üres assignment elnyomja a régi szobát; a régi gyártói metaadat érintetlen fallback. Átnevezési/törlési alias kezeli a még át nem vett régi szobákat. Nincs renderkori migráció vagy vendor parancsváltozás.
- Az első explicit szobamódosítás előtt `backups/pre-phase-room.db` konzisztens VACUUM INTO és a meglévő (esetleg titkosított) JSON változatlan másolata `pre-phase-room-nas-state.json`. Backuphiba esetén nincs szobaírás. Nincs új SQLite séma, storage/auth/guard/deploy változtatás. Egyetlen NAS Node folyamaton a verzióellenőrzés és atomikus JSON-írás között nincs await; több külön Node példány közös JSON-on nem támogatott.
- Avatár: jól látható Avatar módosítása szekció; profilmenüből közvetlen link, meglévő 12 ikon és 6 szín megmarad. Saját SQLite profilmentés és restart után ikon/szín konkrét értékkel UI-tesztelve; fejléc és családi kártyák a meglévő avatar adatokból olvasnak.
- Ellenőrzés: 249/249 Vitest, 56 fájl; új hétkategóriás/fallback/merge/törlés/verzió/ACL/tiltott-fiók/restart/mentésmegőrzés tesztek. Xiaomi sensor és air UI mentés valódi izolált NAS-fájltárral/SQLite sessionnel; ikon cat + c2 megmarad. Célzott lint 0 hiba/5 exportfigyelmeztetés; automatikus build/typecheck OK. Publikus előnézeti drawer 360/390/768/1280 szélességen nem lóg ki; mobilon öt főtab megmarad. A modal nyitásakor a háttér navigáció szándékosan nem fókuszálható.
- Korlát: az egységes megjelenítés az Otthon összesítő Szobák/Eszközök/csempék és szobakezelő nézetre vonatkozik; a gyártói részletes panelek régi metaadat-szerkesztői változatlanok, új explicit assignmentet nem írnak felül. Élő NAS és bejelentkezett böngészős hardveres folyamat nem igazolt.
- Nyitott 9b: NAS SQLite családi szöveges chat (idempotens küldés, receipts, auth, snapshot, polling); ebben a biztonságos körben nem implementált, nincs álchat ikon vagy elveszett beszélgetés. Saját kép feltöltése külön biztonságos fájlfeldolgozási/kiadási kör; nincs látszat upload.
- NAS kézi ellenőrzés: teljes data mentés után sensor/air/lock hozzárendelés két felnőtt fiókból, rename/merge/törlés, gyermek írásának tiltása; restart és image-frissítés után szobák+régi integrációk megmaradása. Avatar mentés után fejléc/családi kártya másik telefonon. Innen nem publikáltunk és nem frissítettünk NAS-t.
- Fájlok: új `src/lib/rooms.ts`, `rooms.server.ts`, `rooms.functions.ts`, `src/components/RoomsManager.tsx`, `src/test/rooms.test.ts`, `rooms-ui.test.tsx`; módosított `src/lib/shared-prefs.ts`, `prefs.functions.ts`, `home-devices.ts`, `src/routes/home.tsx`, `src/components/Profile.tsx`, `Shell.tsx`, `src/test/profile-ui.test.tsx`, `src/lib/AGENTS.md` és a két roadmap/átadási jegyzet.
