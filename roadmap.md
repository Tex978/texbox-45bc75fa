# Aktuális családi központ – 2026-11-16
Részletes jóváhagyott követelmények és elfogadási kapuk: `.lovable/plan/TEXBOX-CSALADI-ROADMAP.md`.
- [x] 1. fázis: stabil profilmenü, felnőtt meghívás, tulajdonosi védelem, külön gyermekprofil; 98 teszt sikeres, automatikus build OK; 390/1280 px publikus állapot ellenőrizve, izolált valódi SQLite + UI mentés/újranyitás tesztelve. Érintett lint hibamentes egy figyelmeztetéssel; teljes lint korábbi 671 hibája nyitott.
- [ ] NAS elfogadás: meglévő admin/session, két eszközös mentés, felnőtt aktiválás/reset, Docker-frissítés; helyi NAS nem érhető el innen.
- [ ] 1b: saját profil, audit/munkamenet részletek, személyes kedvencek és ACL alap.
- [x] 2a: mentett/szerkeszthető kézi jelenetek, Gree/redőny/boolean Tuya-lámpa adapterek, eszköz-ACL, futtatási napló és duplaindítás-védelem; izolált tesztek, NAS éles ellenőrzés nélkül.
- [ ] 2a élő NAS: frissítés és data-mentés után két eszközös jelenetmentés, gyermek ACL, valódi gyártói ACK és fizikai állapot ellenőrzése; innen az otthoni eszközök nem érhetők el.
- [ ] 2b: tartós időzítés/automatizálás, DST/kiesési szabályok; még nincs scheduler.
- [x] 3. fázis alap: NAS SQLite feladat/sablon CRUD, Budapest ismétlődés, vállalás, gyermek szülői jóváhagyása/visszaküldés/elutasítás, audit és egyedi approval-forrás, Feladatok oldal + kompakt mai widget. Pontledger nincs.
- [ ] 3. élő NAS elfogadás: teljes data-mentés után frissítés, régi session/integrációk, kéttelefonos CRUD/claim/approval és másnapi ismétlődés; NAS innen nem elérhető.
- [ ] 3. későbbi bővítés: értesítés-kiküldés, forgó kiosztás, teljes lezárt feladatarchívum felülete (adatok megőrizve).
- [ ] 4. fázis: kizárólag személyes pontszámla és jutalombolt.
- [ ] 5. fázis: bevásárlás, receptek/menü, naptár.
- [ ] 6. fázis: személyes kiegyensúlyozott főoldal és öt fő terület.
- [ ] Opcionális energia-idősor: csak külön tárolási jóváhagyás után.

## Korábbi mérföldkövek (történeti, nem a mai funkciólista)
# TexBox átfogó fejlesztés (jóváhagyott terv)
- [x] Belépési hiba: a hosted előnézet virtuális tárolójának elkülönítése a NAS-tól; valódi NAS tárolási hibánál a védelem megmarad, családi fiókoknál egyértelmű korlátjelzés.
- [x] Aktuális kör: Streaming a Keresésben, régi URL átirányítva; személyes NAS-szűrők; jogosultság/titokkezelés, energiahiány, műveleti visszajelzések és mobil használat javítva; automatikus build OK, 390/1440 px ellenőrizve. Teljes lintben korábbi formázási és any-típus hibák maradtak; NAS családi/hardveres ellenőrzés frissítést igényel.
- [x] M1 Biztonsági alap: családi fiókok a NAS-on, belépés/kijelentkezés, első admin (/__setup), jogosultság minden módosító műveleten, titkosított kapcsolati adatok, napi adatbázis-mentés, telepítési leírás.
- [x] M3 (alap) Család oldal: meghívó és jelszó link, szerepkörök, egyedi jogosultságok, letiltás, profilmenü.
- [x] M2 Közös beállítások a NAS-on: kedvencek, téma, Gree szobák, redőny-kizárások, Bosch nevek; böngészős értékek egyszeri átvétele; 63 teszt sikeres.
- [x] M4 Keresés szűrők: műfaj, év, TMDB-értékelés, rendezés, elérhetőség; telefonon alsó panel, böngészőnként megőrizve; 69 teszt sikeres.
- [x] M5 Streaming felfedező: TMDB HU szolgáltatók, új (hét/hónap/3 hónap) és népszerű, kérés gomb.
- [x] M6 Egységes keret: telefonos alsó menü (Több menüvel), új Áttekintő (köszöntő, összesítők, gyorselérés, vízszintes posztersorok), közös oldalfejléc és üres állapot; 71 teszt sikeres.
- [ ] M7 Energia saját idősortárolás.
- [ ] Élő ellenőrzés a Synologyn: frissítés után az admin létrehozása és TEXBOX_SECRET_KEY megadása a felhasználónál.

# Okosotthon megújítás
- [x] Klímák: egy kiválasztott részletes panel, kompakt gyorsvezérlők, böngészős szobabeosztás; Okosotthon/Energia elrendezés; 50 teszt és automatikus build sikeres, mobil/desktop panelváltás és szobamentés tesztadatokkal ellenőrizve. A teljes lint korábbi hibái nem érintett szerverfájlokban maradtak.
- [x] Telefonközpontú Okosotthon: tömör fejléc, állandó alsó kategóriamenü, külön klíma/Bosch/Smart Life nézetek, olvasható hőmérősorok és alsó előzményablak; négy képernyőméreten ellenőrizve, élő hőmérő eszközkezelő és 7 napos előzményválasztás működik; öt regressziós teszt sikeres.
- [x] Gree+ általános kapcsolati hiba szűkítése: belépés és eszközlekérés külön, biztonságos hibajelzése; időkorlátok és korlátozott párhuzamos lekérés az öt klímához; nyolc Python- és három vezérlési teszt sikeres.
- [ ] Gree+ most jelzett hiba pontos élő oka: a Synology frissítése után kapott részletes hiba szükséges; az otthoni fiók és hálózat innen nem elérhető.
- [x] Hőmérők: közösen mentett elrejtés/visszaállítás, nevek átvétele és csak látható eszközök az összesítésben; kilenc teszt sikeres, telefonon élő hőmérő elrejtése, újratöltése és visszaállítása ellenőrizve.
- [x] Hiányzó telefonos beállítások: tartós mentési hibák látható jelzése, régi sütik átvételének javítása, tárolási állapot és öt sikeres regressziós teszt.
- [ ] Beállítások élő ellenőrzése a tb.texbox.synology.me címen: belépés védi, innen nem elérhető; a javítás frissítése és az eredeti böngészőben a korábbi beállítások átvétele szükséges.
- [x] GitHub feltöltési hiba azonosítva: a digest-linux/amd64 és digest-linux/arm64 tiltott neveket külön, perjel nélküli architektúracímkék váltják.
- [x] Gree+ hőfokállítás: hibás szöveges képességellenőrzés helyett könyvtári hőfokkezelés és parancscsoport; öt Python-próba és három vezérlési szabályteszt sikeres.
- [ ] Gree+ hőfokállítás élő ellenőrzése: a javított Synology-verzió és a felhasználó klímája szükséges.
- [x] Okosotthon újraszervezése: kompakt állapotáttekintő, kategóriaváltás és eszközrács; három képernyőméreten ellenőrizve, a redőnyvezérlés bemutatóban működik; élő szolgáltatások nem ellenőrizhetők fiókok nélkül.
- [x] Home Connect: HTTP-hibák elkülönítése és újraösszekötés elérhetővé tétele a hibás kapcsolat mellett.
- [ ] Home Connect élő adatlekérés ellenőrzése: a felhasználó újraengedélyezett fiókja szükséges; az eredeti válaszkód nem áll rendelkezésre.
- [x] Keresés: külön filmek/sorozatok, ajánlott/új/népszerű/felkapott kategóriák, kattintható adatlap és IMDb-link; hat teszt és bemutató böngészős ellenőrzés sikeres.
- [ ] Élő filmkínálat, szereplőfotók, jelenetképek, előzetesek és IMDb-pontszámok ellenőrzése: TMDB/OMDb hozzáférés és elérhető Radarr/Sonarr szükséges a Synologyn; a bemutató nem helyettesíti az élő ellenőrzést.
- [x] Autók rész teljes eltávolítása az appból (VW letiltja a külső belépést, a Renaultot a felhasználó sem kérte tovább): oldal, belépési háttér, beállításmezők, Docker-függőségek és tesztek törölve.
- [x] Egységes modern megjelenés minden oldalon: közös színek, ikonmenü, vezérlők; hat oldal ellenőrizve három képernyőméreten.
- [x] GitHubon a Gree Python-telepítés hibás lépésének azonosítása; Debian-alapú telepítés és importellenőrzés hozzáadása.
- [x] Az új Docker-kép GitHubon elkészült: 43726953260 sikeres; a Synologyn futó verzió ebből nem igazolható.
- [x] Teljes alakos gyermekfotó körbevágása és elhelyezése az Áttekintő és Okosotthon oldal tetején.
- [x] Telefonközpontú Okosotthon elrendezés, alsó szakasznavigáció és nagyobb érintési felületek; négy képernyőméreten ellenőrizve.
- [x] Hőmérők előzményei: Xiaomi-adatokból grafikon, 24 órás és 7 napos nézet, üres és hibás állapot.
- [ ] Valós Xiaomi mérési előzmények élő ellenőrzése: az előnézetben nincs beállítva a felhasználó Mi fiókja.
- [x] Gree+ fiókos csatlakozás lehetőségének ellenőrzése: közvetlen belépés lehetséges, a vezérlési mód eszköztípustól függ.
- [x] Gree+ fiókos belépés és vezérlés kialakítása, eszközfelderítéssel és parancs utáni állapotellenőrzéssel.
- [ ] Gree+ élő belépés és Smart One/Smart R/Cascade kompatibilitás ellenőrzése: frissített Synology alkalmazásban megadott fiókadatok szükségesek.
- [x] Monitor 3 hőmérő hiányzó méréseinek javítása a feltöltött adatok és gyártói mérési leírás alapján.
- [ ] Gergő hőmérő javításának élő ellenőrzése: a frissített Synology alkalmazásban szükséges.
- [x] Growatt belépés újrahasználata, ritkább frissítés és hibánál várakozás.
- [x] Öt Gree+ klíma helyi csatlakoztatása és vezérlése.
- [ ] Valós Gree vezérlés ellenőrzése: a Synologyn futó frissítés és a klímák otthoni IP-címe szükséges.
- [x] Egységes ikonok, eszközcsoportok és korszerű vezérlők.
- [x] Áttekinthető napelemes energiaáramlás és eszközállapotok.
- [x] Asztali és telefonos megjelenítés, meglévő kezelési lehetőségek ellenőrzése.
- [x] Betöltési adateltérés javítása és adatátadási regressziós teszt.