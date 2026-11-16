# TEXBOX – egyeztetett családi központ

Állapot: 2026-11-16. A TEXBOX 1.0 egyetlen lezáró fejlesztői QA-köre elvégezve; éles Synology-elfogadás külön nyitott. Az alábbi korábbi auditok és fázisállapotok történeti szövegek; a mai irányadó státusz az alábbi lezárás. Nem egy új projekt terve.

## TEXBOX 1.0 – végső fejlesztői QA
- Kész: fiókok/profil/jelszó/munkamenetek, 2a jelenetek, 2b/1 időzítés, feladatok, személyes pontok/jutalombolt, 5a/5b szervező/naptár, 6a/6b főoldal és öt terület, 7a belső értesítések, 8a jegyzetek/ügyek; régi média/NAS/gyártói nézetek megtartva.
- Javított reprodukált P1: idegen beváltási kérésazonosító nem adhat vissza másik ügyletet; futás közben változó jelenet régi lépései nem küldhetők tovább, az adapter újraellenőrzése is verzióhoz kötött. Új regressziós tesztek.
- Eredmény: 243/243 Vitest-teszt (54 fájl), 8/8 parancsmentes Python-próba; célzott lint tiszta; automatikus ellenőrzés `build OK`, típushiba nincs. Külön production Node/Docker image-build ebben a körben nem igazolt.
- 14 URL három szélességen (390/768/1280), Streaming a Keresésben, öt fő terület, billentyűzetes tartalomugrás/menu: publikus előnézetben ellenőrizve. A családi UI mentési útvonalai izolált SQLite-tesztekben ellenőrzöttek; éles bejelentkezett NAS-böngészőpróba nincs.
- Adatbiztonság: nincs új séma/migráció/snapshot, deploy vagy /data/auth/guard/titok konfigurációváltozás; nincs publikálás, éles parancs vagy NAS-frissítés.
- Kötelező éles átvétel: `TEXBOX-1.0-ATADAS.md` ellenőrzőlistája. Watchtower az új image után frissíthet, előzetes teljes adatmentés szükséges.
- Opcionális 2.0, nem lezárási akadály: 7b push, 2b/2 szenzorok, 1c, 6c konkrét eszközkedvencek, 8b ügyemlékeztető/kapcsolások, fájlfeltöltés és kozmetika. Új modul nem indul automatikusan.

## Változatlan alap és minden fázis kapuja

- Synology Docker / TanStack Start / Node 22, `/data/texbox.db` és `/data/nas-state.json`. Nincs automatikus Cloud-migráció, fizetős szolgáltatás vagy Home Assistant függőség.
- Meglévő fiókok, titkok, eszközök és beállítások megőrzése. Minden sémafejlesztés additív, tranzakciós és frissítés előtti konzisztens mentéssel védett. A titkosítási kulcs nem változhat; külön kell megőrizni.
- A hosted előnézet nem a NAS: nincs NAS-fiókmentés, hardveres ellenőrzés vagy valódi kapcsolatállapot állítása. Sikertelen mentés nem lehet sikernek feltüntetve.
- Megmarad Plex, NAS, Radarr, Sonarr, qBittorrent, Xiaomi ellenőrzés és előzmények, Gree részletes kiválasztott panel és gyorskapcsolók, redőnyök/csoportvezérlés, Tuya/Smart Life, Bosch/Home Connect, légtisztító, zár, Growatt és előzmények. Parancsokat, pollingot és query key-ket nem cserélünk pusztán UI-fejlesztés miatt.
- Streaming a Keresésben marad; `/streaming` kompatibilis átirányítás. Letöltések, Tárhely, Energia, Kapcsolatok mind elérhető marad.
- Valós mérések; célhőmérséklet nem aktuális szobahőmérséklet. Hiányzó energiaadat nem nulla és nem becslés. Integrációs hibák láthatók.
- Magyar, olvasható tipográfia, egységes ikonok/témák, telefonos alsó menü és PC navigáció, tablet, billentyűzet/fókusz, legalább 44 px érintési cél. Nincs díszgomb vagy nem működő makett.
- Minden fázis: célzott és regressziós tesztek, automatikus build ellenőrzése, lint, mobil/desktop ellenőrzés, konkrét fájllista, NAS-on maradó ellenőrzés. Nincs automatikus publikálás.

## Audit – forrásból igazolt jelenlegi állapot

Vizsgált területek: auth.server/auth.functions/app-gate/start/server, permissions, family, Shell, router cache, shared-store/shared-prefs/prefs, media-preferences, home, EnergyHistory, streaming redirect, Dockerfile/compose, tesztek.

- Létező felnőtt/gyermek loginfiókok: scrypt jelszóhash, véletlen token hashként, HttpOnly/SameSite süti, 30 nap alapértelmezett lejárat; HTTPS-nél Secure. Közös jelszó csak az első admin létrehozásához.
- Meglévő meghívó és reset közös, egyszer használható, 72 órás token; e-mailküldő nincs. Tiltás törli a munkameneteket. Admin és felnőtt és gyermek szerep, funkciószintű szerveroldali guard, meglévő CSRF middleware. Az első admin nem hozható létre ismét, ha már vannak fiókok.
- Profilmenü korábban csak sikeres getMe eredménynél látszott. Hibánál/betöltésnél/open módban null volt: ez bizonyított UI-hiba. A NAS-on konkrét eltűnés pontos kiváltó oka nem rekonstruálható a NAS naplója és sütije nélkül; nem állítjuk, hogy a fiók törlődött.
- NAS tárolási hiba fail-closed; Workers előnézet elkülönítve. Korábban getMe a hibás NAS-tárolót open állapotnak is nevezhette, ez külön állapottal javítandó.
- JSON közös állapot atomikus fájlcserével, opcionális AES-GCM titkosítással; kapcsolati titkok nem adhatók kliensnek. Régi sütik csak hiányzó értékbe migrálnak. Téma/okosotthon-kedvencek még háztartásiak; média szűrők már felhasználónként külön NAS-kulccsal.
- Mentés: napi névvel SQLite snapshot a tároló megnyitásakor, 14 példány; nem külön, éjfélkor futó mentőszolgáltatás. Külső NAS/Hyper Backup továbbra is szükséges.
- Hiányzott a külön, e-mail/jelszó nélküli gyermekprofil, tulajdonosi elkülönítés, munkamenetszám/lezárás és őszinte meghívóstátusz.
- Még nincs feladat, pont, jutalom, szervező, szerkeszthető jelenet vagy tartós automatizálás. Szoba/eszközszintű ACL és személyes főoldal szintén következő feladat; ezek nem kész képességek.

## 1. fázis – stabil fiókok és család

Megfogható eredmény: meglévő admin megtartása, stabil profilmenü, működő felnőtt meghívás/aktiválás/reset, külön szülői gyermekprofil.

- [x] Látható fiókbetöltés/lekérdezési hiba/preview/tárolási hiba, újrapróbálás; visszatéréskor és időszakosan frissülő munkamenet. Lejárt sütinél egyértelmű újrabelépés.
- [x] Család elérhető avatarból, mobil Több és Okosotthon alkalmazásmenüből.
- [x] `family_meta` tulajdonosi jelölés, `child_profiles` külön tábla; a users/sessions/invites és titkok átírása nélkül. Első meglévő aktív admin jelölése tulajdonosnak, új telepítésen az első admin. Több régi admin esetén ellenőrizni kell a kijelölt tulajdonost a frissítés után.
- [x] Kötelező `backups/pre-family-phase1.db` frissítés előtti snapshot; hiba esetén nincs új családi séma és a hozzáférés lezárva marad.
- [x] Szülői gyermekprofil saját névvel/ikonnal, szerkesztés, inaktiválás; mindkét szülő kezelheti. Nem önálló hitelesítő fiók. A régi gyermek-loginfiókok változatlanul megmaradnak; automatikus összevonás nincs.
- [x] Felnőtt meghívás, státusz, linkmásolás, reset, aktív munkamenetszám és admin által lezárás. Nincs „levél elküldve” állítás.
- [x] Tulajdonosi fiók nem törölhető/tiltható/lefokozható; adminfiókok módosítása, létrehozása/resetje tulajdonosi művelet. Felnőtt nem kap kapcsolati titok/fiókadmin jogosultságot.
- [x] Saját profil szerkesztése, auditnapló olvasható felülete és munkamenetek egyenkénti listája/lezárása: 1b (fejlesztői környezetben kész, NAS-on nyitott).
- [ ] Szoba/eszköz/jelenet ACL: a 2. fázis biztonsági előfeltétele; addig a meglévő funkciójogok élnek.
- [ ] Személyes kedvencek/téma/főoldal és értesítések migrációja: 1b/6. Meglévő közös értékek nem törölhetők; először személyes másolat, majd személyes módosítások.

Elfogadás: régi admin/session változatlan újranyitás után; jelszó helyett hash; egyszer használható és lejáró meghívás, új link érvényteleníti a régit; két szülő szerkeszthet gyermeket; gyermek tiltott jogosultságot override-dal sem kap; profilnév a mentés után új sessionben visszaolvasható; NAS hiba nem open; előnézet nem mutat mentési sikert; mobil/desktop kezelhető.

## Jogosultsági mátrix és auth-flow

| Művelet | Tulajdonos | Családi admin | Felnőtt | Gyermek/profil |
|---|---|---|---|---|
| Kritikus adminfiók kezelés | igen | nem | nem | nem |
| Kapcsolati beállítások | meglévő adminjog | meglévő adminjog, további szűkítés 1b | nem | nem |
| Felnőtt meghívás/reset/tiltás | igen | nem-admin célra | nem | nem |
| Gyermekprofil kezelés | igen | igen | igen | nem |
| Szoba és jelenet/feladat/jutalom szerkesztés | igen | igen | szülői jog szerint | nem |
| Eszköz/jelenet indítás | eszköz ACL | eszköz ACL | eszköz ACL | explicit engedély |
| Saját pont/jutalom/értesítések | saját | saját | saját | saját, szülő jóváhagyása |

A jövőbeli mátrix további sorai nem jelentenek már megvalósított szerverjogot. Minden olvasó/író handler saját ellenőrzést kap; UI rejtése nem védelem. Szülői szerep nem jogosít biztonsági titkok kezelésére.

Belépés: username+jelszó → szerver validál → hash-elt, lejáró session → HttpOnly süti → getMe ellenőrzés → profil. Meghívás: admin készít felnőtt fiókot → linket másol → címzett állít jelszót → link elfogy, régi sessionök megszűnnek → új session. Reset ugyanilyen admin által átadott egyszer használható link; nincs önkényes e-mailküldés. Gyermekprofil: szülő menti és kezeli, nincs login.

## 2. fázis – Okosotthon jelenetek, aztán automatizálás

### 2a megvalósított állapot – 2026-11-16

- [x] Otthon → Jelenetek fül, magyar szerkesztő: név/ikon/szín, személyes/családi láthatóság, több sorrendezhető eszközművelet, létrehozás/módosítás/törlés, revíziós ütközésvédelem.
- [x] NAS SQLite additív `scenes`, `scene_device_acl`, `scene_runs` és egy aktív futtatást engedő index; kötelező `backups/pre-scenes-phase2a.db` snapshot. A régi fiókok/sessions/gyermekprofilok és JSON titkok változatlanok. Korábbi Docker-kód az új táblákat figyelmen kívül hagyja; rollbackhez nem kell adatot törölni.
- [x] Képességkatalógus: Gree power on/off, célhőmérséklet egész 16–30 °C, a meglévő GREE_MODES/GREE_FANS validált értékei; redőny open/close/stop/position 0–100; Smart Life csak tényleges boolean switch_led. Helyi Gree olvashatósága és eszközök offline állapota ellenőrzött a katalógusban.
- [x] Meglévő plain szervervezérlők használata, nem RPC-hívás másik RPC-ből. Gree és redőny közös parancsadapter; Tuya meglévő ensure/sendTuya. Tuya fetch 10 másodperces megszakítható korlát, meglévő Gree/UDP korlátok megtartva.
- [x] Tulajdonos szerkeszti a saját jelenetét, admin a családiakat is; személyes jelenet más számára nem olvasható. Gyermek-login csak explicit jelenet és minden mögöttes eszközengedéllyel. Szülői gyermekprofil nem bejelentkezési szereplő. Admin eszközengedély szerkesztő mentett ACL-listával; explicit tiltás felnőttre is él, korábbi felnőtt parancs alapból kompatibilis.
- [x] Eszköz-ACL és folyamaton belüli közös zárolás Gree, Tuya, egyedi/csoportos redőny közvetlen parancsokon is; jelenetben előtte és minden lépésnél újraellenőrzés. Egy jelenethez SQLite szinten egy aktív run, request UUID idempotencia, eszközönként napló és részleges hiba. Folyamat újraindításakor run megszakadtként lezárva; fizikai parancs nem ismétlődik automatikusan.
- [x] Elfogadott parancs nem állított fizikai állapot: Gree cloud a meglévő readbacket használja; helyi Gree success event, redőny hub ACK, Tuya API success. Egységes UI „parancs elfogadva”, eszköznézetben fizikai állapot ellenőrzendő. Hiányzó kapcsolat/offline nem jelenetsiker.
- [ ] Tuya fényerő és egyéb kódok: a jelenlegi API nem ad írható tartományt, ezért nem ajánljuk. Bosch/légtisztító/zár/szenzor csak a meglévő eszköznézetben marad, nem jelenetlépés. Modell-specifikus Gree mód/fan képességet a meglévő integráció nem ad; a támogatott szerverértékek a készüléken hibázhatnak, amit a napló jelez.
- [ ] Szobaszintű ACL, főoldali opcionális gyorsindító, sablonok és tartós többprocesszes eszközlock későbbi bővítés; a jelenlegi Docker egy Node-folyamatára készült közös parancszár.
- [ ] Élő NAS elfogadás: meglévő admin session, jelenet mentés másik telefonról visszaolvasva, gyermek explicit engedély és tiltott közvetlen hívás, Gree/UDP/Tuya valódi ACK és fizikai readback. Automatizált teszt éles készüléket nem indított.

Automata tesztek: izolált SQLite CRUD/adatmegőrzés, személyes/családi ACL, gyermek kettős engedély, szerverfüggvény közvetlen signed-out tiltás, felnőtt szerkesztés, részleges API-hiba, revízió, párhuzamos run/device-lock/idempotencia, UI paraméteres mentés. Telefon/PC preview NAS-belépés hiányát jelzi, nem ment hamisan.

### 2b változatlanul külön, még nem implementált

Időzítés, hét napjai, érzékelőesemények, tartós NAS scheduler, DST/kiesés/pótlás és újraindítás utáni automatizmus nincs a 2a-ban. Feladatok/pontok/jutalmak/szervező sem készült ebben a körben.

1. Valós eszközképességek katalógusa; támogatott műveletek adapterei a meglévő parancsokhoz. Gree on/off/mód/célhőfok/fan, fény on/off/fényerő és redőny csak ha tényleg támogatott.
2. NAS-on szerkeszthető jelenetek: név, ikon, szín, családi/személyes láthatóság, engedélyezett indítók; több eszköz, sorrend és validálás. Jó reggelt/Elindulunk/Filmnézés/Jó éjszakát csak választható sablon, nem bekötött demó.
3. Eszköz/szoba és jelenet ACL; futtatáskor minden mögöttes eszköz jogosultságát újra ellenőrizni. Per-eszköz zárolás, műveletnapló, részleges hiba/eredmény. Kézi indítás Otthon és Főoldal.
4. Külön 2b automatizálás: idő/hét napja, engedélyezés, tartós NAS scheduler, újraindítás utáni visszaállás, duplázás elleni run-key. Esemény/érzékelő trigger csak valós vendor támogatással. Leállás alatti pótlás és Europe/Budapest DST szabály külön döntés.

Javasolt táblák: scenes, scene_actions, scene_acl, device_acl, scene_runs, scene_action_results; automation_rules/runs csak 2b. Modulok: scenes.server/functions, capability adapter, SceneEditor/SceneRun, home/index. Elfogadás: UI mentés és új eszközről visszaolvasás; több eszköz valódi futtatása NAS-on; jogosulatlan kézi RPC tiltva; egy hibás eszköz eredménye látszik; dupla indítás védett; scheduler újraindítás teszt. Éles zár/redőny/klímaparancs előtt tulajdonosi próbajóváhagyás.

## 3. fázis – feladatok

### Megvalósított állapot

- [x] `/tasks` Feladatok, desktop főmenü/mobil Több; Ma, Heti, Közös, szülői Kezelés. Személy/saját/jóváhagyásra váró szűrő, gyermek nevében vállalás és teljesítés. Áttekintőn kompakt kattintható Mai teendők, a régi tartalom megmaradt.
- [x] Valódi NAS SQLite sablon CRUD: cím/leírás/kategória, nem negatív egész pontérték, személyes/családi láthatóság, user vagy kezelt gyermekprofil vagy közös felelős, dátum/helyi határidő, prioritás. Sablon törlése archivál; lezárt teljesítések és naplók megmaradnak.
- [x] Egyszeri/napi/heti napok/kétheti/havi/kiválasztott dátum ismétlés. Budapest civil dátum, havi 29–31 rövid hónap utolsó napjára esik, később visszatér az eredeti napra; kétheti ritmus kezdés hetéhez kötve. Nincs időzített értesítés/scheduler. Határidő helyi HH:MM adat, DST-nél nincs fizikai időzített futás.
- [x] Előfordulás automatikusan olvasáskor/60 másodperces UI-frissítéskor, legfeljebb ma+7 napig. Egyedi sablon+dátum kulcs. Régi esedékességek megőrzése, sablononként legfeljebb 366 nap feldolgozása kérésenként; hosszú kiesésnél jelzett folytatás. Az alkalmazás megnyitásakor magától megjelenik a következő napi feladat, nem kell újralétrehozni.
- [x] Tranzakciós nyitott/vállalt/pending/approved/returned/rejected/cancelled életciklus, verzióellenőrzés; felnőtt automatikus elfogadás, gyermek csak egyik szülő döntésével, indokos visszaküldés/elutasítás és új teljesítés. Legacy child-login nem azonos a gyermekprofillal.
- [x] Minden RPC belépést ellenőriz; szerver oldalon minden olvasás és módosítás újraellenőrzi az aktív személyt és jogokat. Mindkét family-jogosult felnőtt kezel családi sablont és gyermekjóváhagyást. Személyes felnőttfeladat más számára nem látható. Gyermek sablon/pont/jóváhagyás módosítása tiltva.
- [x] `task_templates`, `task_occurrences`, `task_events`, `task_approvals`; additív egytranzakciós séma, kötelező `backups/pre-tasks-phase3.db` snapshot az új táblák előtt. Meglévő fiók, session, jelenet és JSON/titok nincs átírva. Az egyszeri approval snapshot személyhez kötött, későbbi ledger forrás; nem pontegyenleg és nem jóváírás.
- [x] Izolált valódi SQLite/UI/RPC tesztek: CRUD, restart, backup, személyes ACL, ismeretlen személy, gyermek override, napi/heti/havi/kétheti/DST, dupla claim/approval, indokos visszaküldés/elutasítás, UI gyermekfeladat mentés/újranyitás/teljesítés/jóváhagyás; korábbi fiók/jelenet regressziók.
- [x] Ellenőrzés: 133 teszt / 35 fájl sikeres; új feladatfájlok célzott lintje tiszta. 390/768/1280 px publikus NAS-korlát állapot böngészőben túlcsordulás és runtime hiba nélkül; bejelentkezett NAS böngészőfolyamat nem elérhető. A tartós UI-folyamat izolált SQLite-teszttel ellenőrzött, nem éles NAS-on.
- [ ] Élő NAS elfogadás: data-mentés + Docker-frissítés, meglévő admin/session/kapcsolatok/jelenetek megőrzése, két telefonos mentés/claim/jóváhagyás, másnapi ismétlődés és lejárt session közvetlen RPC tiltása. Innen a NAS nem elérhető; új kulcs/fiók nem szükséges.
- [ ] Következő bővítés: explicit értesítési csatorna/kiküldés és forgó kiosztás. Prioritás/helyi határidő és reminder mező előkészített, működő értesítést nem állítunk. Régi lezárt előfordulások teljes kereshető archívuma külön bővítés (SQLite-ban és naplóban megmarad; UI elmúlt 7 nap lezárt + minden nyitott elmaradás).

Sablonszerkesztés a jövőbeli, még érintetlen nyitott előfordulásokat generálja újra; a mai/elmúlt/vállalt/elkészült adatok megőrzött snapshotok. Pontkönyvelés és jutalombolt csak 4., automatizálás csak 2b, teljes kiegyensúlyozott főoldal csak 6. fázis. A történeti tervezési célok alább nem kész pontfunkciók.

- Közös/személyes, vállalható/kijelölt/forgó, kategória, pont, felelős, határidő. Appon belüli sablon és szerkesztő.
- Napi/heti/havi/egyedi nap/kétheti/egyszeri ismétlődés; NAS szerver generál konkrét előfordulásokat, egyedi template+date kulcs, Europe/Budapest.
- Tranzakciós vállalás, nincs két felelős ugyanarra az egyszeri vállalható feladatra. Felnőtt teljesítés automatikus személyes pont; gyermek egyik szülő jóváhagyására vár, visszaküldhető. Szülő kicsi helyett jelölhet. Napló és értesítés.
- Kompakt mai widget; Ma/Heti/Közös/Kezelés nézet.

Táblák: task_templates, task_occurrences, task_claims, task_submissions, task_decisions; személyes pont ledger a 4. fázissal közös tranzakcióban. Elfogadás: ismétlés és DST, párhuzamos vállalás, újraindítás utáni egyediség, két szülő egyidejű jóváhagyása csak egyszer ír pontot; gyermek nem ír pontot/jóváhagyást közvetlen handlerrel.

## 3b – adatmegőrzési megbízhatóság (kód kész, élő NAS-próba nyitott)

- [x] A fiók-adatbázis nem jön létre üresen: a data mappát a kód nem hozza létre; jelző nélküli üres mappánál „Új TexBox-telepítés?” oldal (APP_PASSWORD + `UJ TELEPITES`), csak utána első admin.
- [x] `.texbox-instance.json` jelző rögzíti a már létrejött texbox.db és nas-state.json fájlokat; hiányuk, hiányzó/olvashatatlan/írhatatlan mappa, sérült jelző vagy eltérő TEXBOX_INSTANCE_ID → 503 hibaoldal, semmi nem íródik.
- [x] Régi (jelző előtti) telepítés meglévő fájlok alapján automatikusan átvéve, adatok változatlanok.
- [x] nas-state.json ENOENT csak megerősített, még sosem írt telepítésnél jelent üres beállítást.
- [x] Admin-only, csak olvasó „Adattárolás állapota” (útvonalak, jelenlét, jogosultság, WAL, mentések, /proc/self/mountinfo alapú csatolásvizsgálat); titkot nem ad vissza.
- [x] deploy compose: texbox projekt, hosszú bind `create_host_path: false`, DATA_DIR/DATA_FILE, Watchtower tiltva; TELEPITES.md különbségtáblával, mentés/visszaállítás leírással. Automatikus törlés/restore nincs.
- Korlát: teljesen új üres mappában jelző sincs — ezt csak a kézi megerősítés és a TEXBOX_INSTANCE_ID szűkíti, abszolút garanciát nem ad.
- [ ] Élő Synology: meglévő data felismerése, állapotkártya, újraindítás/frissítés utáni megmaradás, egyetlen 3050-es példány.

## 4. fázis – személyes pontok és jutalombolt

Állapot (2026-11-16): kód és izolált tesztek kész (point_ledger, rewards, redemptions, reward_events, reward_wishes); élő Synology-ellenőrzés nyitott.

- Minden családtagnak – felnőtteknek is – kizárólag saját pontszámla. NINCS közös családi egyenleg vagy közös feladatpont.
- Append-only személyes ledger, egyedi forráskulcs, tranzakciós jóváírás/visszavonás/okkal admin korrekció; saját történet és cél.
- Admin/szülő által appon belül szerkeszthető jutalom képpel/címmel/pontárral/kategóriával/joggal/készlettel/korláttal, kívánságlista, beváltási történet és állapot.
- Felnőtt beváltás szabadon, azonnali terhelés, opcionális átadásra vár. Gyermek: pontfoglalás → egyik szülő jóváhagyásakor atomikus levonás; elutasításkor felszabadítás. Mindkét szülő látja; egyetlen döntés. Negatív rendelkezésre álló egyenleg tilos.
- Opcionális későbbi kihívás teljesített feladatszámon, közös pont nélkül; nem alapprioritás.

Táblák: point_accounts/ledger, point_holds, rewards, reward_limits, redemptions, wishlist/goals. Elfogadás: két párhuzamos beváltás/két jóváhagyás/ismételt submit/rollback/stock verseny; gyermek nem módosíthat árat vagy pontot. Minden egyenleg a személyhez kötött, régi gyermek-login és új profil összerendelése csak jóváhagyott veszteségmentes tervvel.

## 5. fázis – családi szervező

- Bevásárlás: közös szinkronlista, mennyiség/kategória/bolt/visszatérő termék/ki vásárolta. Kipipálás önmagában nem ad feladatpontot.
- Receptek: adag/hozzávaló, heti menü, listára összevont mennyiségek; főzés explicit feladathoz kapcsolható.
- Színkódolt közös naptár: esemény/program/ügyintézés/határidő, ismétlés/emlékeztető; teendővé alakítás egyedi kapcsolókulccsal.
- Jegyzet/kívánság/karbantartás/dokumentum opcionális későbbi bővítés.

Táblák: shopping_lists/items, recurring_products, recipes/ingredients, meal_plan, calendar_events/occurrences/reminders; revízió/optimista konkurenciakezelés. Kezdetben hitelesített rövid polling vagy bizonyított NAS push, új külső szolgáltatás nélkül. Elfogadás: két telefon párhuzamos módosítása nem veszít adatot; adagváltás/egységösszevonás; ismétlődő naptár nem dupláz feladatot; értesítés és DST; listapipa nem pontforrás.

## 6. fázis – kiegyensúlyozott főoldal és navigáció

- Személyes köszöntő/értesítés; FELÜL kedvenc okoseszközök és kézi jelenetek, KÖZVETLENÜL ALATTA mai személyes/közös teendők; majd kompakt naptár/bevásárlás/mai menü/saját pont/jutalom.
- NAS-ra mentett személyes widget sorrend/láthatóság; üres és irreleváns elemek kicsik. Közös adatok és személyes főoldal szétválasztva.
- Öt terület: Főoldal, Otthon, Feladatok, Család (szervező/jutalom), Média. Meglévő fiókkezelés a Családon belül; Letöltések/Tárhely/Energia/Kapcsolatok logikus aloldal vagy Több. Régi URL-ek maradnak vagy átirányítanak.
- Mobil alsó menü/PC oldalsáv/tablet, egyszerű gyermeknézet, szülői jóváhagyásszámláló; világos és sötét, hozzáférhetőség. Meglévő jó funkciókat fokozatosan integrálni, nem egyszerre lecserélni.

Elfogadás: összes régi oldal elérhető, streaming továbbra is Search; billentyűzet és telefon; személyes rendezés két sessionből visszajön; gyermek nem lát védett adatot cache-ből; kijelentkezés cache/história takarítás; nincs makettadat.

## Opcionális külön fázis – NAS energia-idősor

A Growatt inverteres napi kW és heti/havi/éves kWh meglévő valódi API-előzményeit megőrizzük. Saját mérésgyűjtést nem kezdünk ebben a körben. Új tároláshoz külön tulajdonosi jóváhagyás, megőrzési idő/tárhely és mérési gyakoriság döntés; a 15 perces védelmet nem megkerülni. Időbélyeg/időzóna/duplikáció/kiesés/újraindítás, nyers érték versus aggregátum, export/backup tesztek; hiány nem szintetikus adat.

## Backup / telepítés / rollback

1. Frissítés előtt a NAS-on állítsd le a konténert és mentsd a TELJES csatolt data könyvtárat (db, WAL/SHM, JSON, backups) és a korábbi képtagot. A titkosítási kulcsot külön biztonságos helyen őrizd, ne chatben.
2. Az első fázis külön konzisztens snapshotot készít a SQLite-ról a családi táblák előtt; meglévő admin/session/hash/JSON nem módosul. Az új táblák IF NOT EXISTS-szel és egy tranzakcióban készülnek; nincs DROP vagy users ALTER.
3. Ugyanaz a volume, port, hálózat és meglévő env; új kötelező env nincs. APP_PASSWORD, opcionális TEXBOX_SECRET_KEY, SESSION_DAYS, DATA_DIR/DATA_FILE meglévő szabályok maradnak. Dockerfile/compose nem változik.
4. Rollback: konténer leállítása, korábbi képtag indítása ugyanazzal a data-val. Régi kód az additív új táblákat figyelmen kívül hagyja. Adatbázis visszaállítása csak tényleges sérülés esetén, leállítva, aktuális teljes mentés után; a snapshot utáni új profilok elvesznének, ezért ne állíts vissza vakon.
5. NAS elfogadás: régi admin saját címen belép, avatar stabil oldalváltás/fókusz/újraindítás után; felnőtt meghívás másik telefonról aktiválható; gyermek mentés két szülőnél azonos; reset/tiltás régi sessiont bezár; kapcsolatok és eszközvezérlők változatlanul olvashatók. Hosted preview nem bizonyítja ezeket.

## Nyitott tulajdonosi döntések és sorrend

Elsőként: 1. fázis NAS-próbája. Utána 1b profil/audit/ACL alap rövid biztonsági lépés, majd a kért 2. fázis kézi jelenetei. Az automatizálás külön mérföldkő, a feladat/pont szoros tranzakciós kapcsolattal a következő kettő. Szervező és végleges főoldal ezekre épül.

Nem szükséges új kulcs az első fázishoz. Később dönteni kell e-mailküldő opcionális bevezetéséről, tulajdonosváltás biztonságos folyamatáról, szülői funkciójogokról, gyermek önálló belépéséről, push értesítések csatornájáról, automatizálás kiesés/DST viselkedéséről és energia saját tárolásáról. Egyik sincs automatikusan bekapcsolva.

## Állapot 2026-11-16 – 5a
Kód és izolált tesztek kész: shop_lists, shop_items, recipes, menu_entries (pre-organizer-phase5.db mentés után, additív). Élő Synology-ellenőrzés nyitott. 5b naptár/ügyintézés, 6. főoldal + öt menüpont, 2b automatizálás változatlanul későbbi.

## Állapot 2026-11-16 – 5b
Naptár CRUD + ismétlődés + alkalom-kivétel + feladathivatkozás kész izolált tesztekkel (calendar_events, calendar_exceptions, calendar_task_links). Nyitott: push/emlékeztető ütemező, jegyzetek/ügyek, élő Synology-ellenőrzés. 2b automatizálás és 6. főoldal később.

## Állapot 2026-11-16 – 6a
Öt menüs navigáció és valós adatú családi főoldal kész, séma-változás nélkül; régi áttekintő a /media oldalon. 6b: tartós személyre szabás és főoldali eszközállapot/vezérlés. Élő NAS-ellenőrzés nyitott.

## 6b – Személyre szabható főoldal (fejlesztői környezetben kész, NAS-on nyitott)
- Kész: additív `dashboard_prefs` tábla (person_key, verzió), kötelező `backups/pre-dashboard-phase6b.db` snapshot; saját elrendezés minden fióknak, szülő kezeli a gyermekprofilokét; ismeretlen/tiltott kártya és jelenet szűrése; verzióütközés érthető hibával; audit; előnézetben nincs mentés.
- Szerkesztő: fel/le gombok (billentyűzet, érintés), szem ikon, kedvenc jelenetek sorrendje, Mentés/Mégse, megerősített visszaállítás.
- Nyitott: 6c konkrét kedvenc eszközök élő állapottal; drag-drop; élő NAS restart/két eszköz teszt.

## 2b/1 – Időzített jelenetek (fejlesztői környezetben kész, NAS-on nyitott)
- Kész: napi / kiválasztott napok / N hetente / egyszeri szabály, Europe/Budapest (tavaszi rés kimarad, őszi ismétlés csak elsőre), kikapcsolt alapállapot, megerősítő összefoglaló, szerkesztés = újra kikapcsol, jelenet módosítása/törlése leállítja.
- Ütemező: Node szerverfolyamat, a szerverbelépő betöltésekor és minden kérésnél idempotensen indul; SQLite lease (90 s) biztosítja az egy példányt; UNIQUE(rule_id, slot) atomikus claim; 3 perces türelmi idő, utána „kimaradt”; félbehagyott futás „megszakadt”, nem ismétlődik. Zárat tartalmazó jelenet nem időzíthető. `TEXBOX_SCHEDULER=off` kikapcsolja.
- Nyitott: élő NAS-ellenőrzés (indulási napló, valódi próbafutás egyeztetett jelenettel), 2b/2 érzékelő-triggerek, értesítések.

## 7a – Értesítési központ (fejlesztői környezetben kész, NAS-on nyitott)
- Kész: `notifications` (UNIQUE recipient+source+event), `notification_settings` (verzió); címzett csak bejelentkezési fiók; gyermekfeladat-teljesítés és gyermek-jutalomkérés minden más jogosult szülőnek külön; döntés az érintett fióknak, kezelt profilnál a másik szülőnek; bevásárlás nem értesít; értesítés hibája nem görgeti vissza az üzleti tranzakciót.
- Emlékeztetők: csak „emlékeztetés” jelölésű naptáresemény/feladat, fiókonként választott előidő (15 p/1 ó/3 ó/1 nap), Europe/Budapest, 10 perces ablak, utólagos pótlás nincs; a 2b/1 ütemező lease-tulajdonosa futtatja.
- Nyitott: 7b push, élő NAS-ellenőrzés.

## 8a – Családi jegyzetek és ügyek (fejlesztői környezetben kész, NAS-on nyitott)
- Kész: `family_notes`, `family_note_events` (audit), `matter_task_links` (egy ügy → egy feladat); személyes elem csak a létrehozónak; közös elem felnőtteknek, gyereknek csak kifejezett megosztással; gyerek nem ír; közös elemet a létrehozó és a jogosult szülők szerkeszthetik, láthatóságot csak a létrehozó állít; archiválás fizikai törlés helyett.
- Nyitott (8b): ügyhatáridő-emlékeztető, naptáresemény-kapcsolás, főoldali kártya.

## 1b – Saját profil, jelszó, eszközök, jogosultságok (fejlesztői környezetben kész, NAS-on nyitott)
- Kész: `/profile` (név, beépített ikon/szín, verzióvédelem), jelszócsere jelenlegi jelszóval + erősségszabály + fiókonkénti zár, más eszközök opcionális kijelentkeztetése; saját munkamenetlista nem visszafejthető azonosítóval, egyedi/összes többi lezárása, a jelenlegi védett; saját és admin családi eseménynapló (nyers adatok nélkül); családi kártyák avatarral, szereppel, meghívóstátusszal; jogok kategóriákba rendezve csak a létező kulcsokkal. Szerverfüggvény-POST Origin-ellenőrzés. Új tábla: `user_profiles`; mentés: `backups/pre-profile-phase1b.db`.
- Javítva: ügy→feladat (`matterToTask`) egy tranzakcióban; a feladatmodul tranzakciója beágyazva savepointot használ. Hibás link-lépés esetén a feladat sem marad meg.
- Felhasználónév szándékosan nem módosítható. Gyermekprofil továbbra sem tud önállóan belépni.
- Nyitott 1c: admin nézet más felnőtt eszközeiről, szoba-szintű jog, utolsó aktivitás, profilkép-feltöltés.
- NAS-ellenőrzés: frissítés előtt teljes `/data` mentés; frissítés után a `backups/pre-profile-phase1b.db` megléte, régi belépés működése, két eszközön névváltás, egy eszköz kijelentkeztetése, jelszócsere.
