# 9b/2 – közvetlen következő chat-bővítés: média és fájlok

Állapot: nincs implementálva; nincs demófeltöltés, látszatmentés vagy működésképtelen papírkapocs. Az egységes szobák és az ikon/szín avatár megmarad; a 9b/1 valódi szöveges chatre épít.

- Harang melletti meglévő chatpanel; papírkapocs/+ a szövegmezőnél, több fájl és opcionális szöveg/képaláírás. Mobil galéria/kamera/fájlválasztó böngészőtámogatás szerint; progress és megszakítás.
- JPG/PNG/WebP képek; HEIC csak valódi kezelés esetén. MP4/WebM beágyazott lejátszás; MOV letöltés. PDF/TXT/DOCX/XLSX/ZIP és egyéb engedélyezett családi fájlok; fájlnév, méret, biztonságos letöltés. Képelőnézet és teljes nézet.
- Fájlok kizárólag tartós /data/chat-attachments; metadata meglévő /data/texbox.db-ben, message ID és küldő ID kapcsolattal. Additív/idempotens migráció előtt konzisztens VACUUM INTO snapshot; meglévő data-guard változatlan. Nincs Cloud vagy public könyvtár.
- Kötelező aktív, hitelesített családi fiók és friss szerveroldali ACL minden upload/download/Range/törlés útvonalon; gyermek-küldési jogosultságot külön egyeztetni, jelenleg csak olvasás. Nincs nyilvános statikus URL, DM, AI, hívás vagy push.
- Véletlen belső fájlnév; útvonalbejárás kizárása; valódi MIME/szignatúra ellenőrzése, ZIP-alapú Office típus ellenőrzése. HTML/SVG/JS és futtatható fájlok (.exe/.apk/.sh/.bat stb.) tiltása; nosniff, kontrollált Content-Type és Content-Disposition. Titkok nem kerülnek naplóba.
- Szerveroldali max 10 MB/kép, 100 MB/videó, 25 MB/egyéb, 5 csatolmány/üzenet. Konfigurálható háztartási kvóta. Átviteli méretkorlát streaming/szakaszolt upload közben; nincs teljes videó memóriában/base64. Magyar hibák.
- Védett HTTP Range MP4/WebM esetén; nincs kötelező transzkódolás. Hiányzó/hibás fájl külön jelölve.
- Konzisztens üzenet+csatolmány commit; hiba után nincs félig elküldött üzenet. Küldő/request ID deduplikáció, személyes monoton olvasási kurzor és olvasatlan számláló megmarad. Fájltörlés csak explicit jogosultsággal/audittal; metadata/régi üzenetek megőrzése; nincs nagy automatikus árvatörlés.
- Izolált SQLite/temp data: szöveg+kép/videó/PDF, MIME hamisítás, traversal, idegen/nem aktív fiók, visszavont session, méret/kvóta/max 5, rollback, thumbnail/Range, restart. Böngészőben 360/390/768/1280 chat/feltöltés UX, teljes korábbi regresszió.
- Nincs éles NAS upload, eszközparancs, publikálás; Compose/Watchtower/mount/port/APP_PASSWORD/TEXBOX_SECRET_KEY/instance ID/Actions változatlan.
