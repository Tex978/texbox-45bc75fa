# TexBox adatvesztési incidens – diagnózis és mentési terv (csak olvasás)

Ebben a körben semmi nem módosult: nincs kód-, séma-, mount-, NAS- vagy publikálási változás.

## 1. Forrásaudit – amit ténylegesen láttam

- `deploy/docker-compose.yml`: `./data:/data` **relatív** bind mount. A `./` a Container Manager projektmappájához képest oldódik fel (pl. `/volume1/docker/<projektnév>/data`). Ha a projektet más néven / más mappából hozták létre újra, vagy a yaml-t máshonnan importálták, **új, üres data mappa** keletkezik, a régi érintetlenül megmarad máshol.
- `Dockerfile`: `VOLUME /data`. Ha a konténer valaha bind mount nélkül jött létre (kézi „Konténer létrehozása", nem Projekt), Docker **névtelen kötetet** csatol – ez a konténer újralétrehozásakor (nem Watchtower, hanem törlés + új) elveszhet / újra üres lesz.
- Watchtower: `WATCHTOWER_CLEANUP: true`, 300 mp. A Watchtower a régi konténer mount-beállításait átveszi, így önmagában valószínűleg nem okoz vesztést – **nem bizonyított**, ellenőrizni kell.
- GitHub Action: minden `main` push → új `latest` kép → 5 percen belül automatikus újraindítás. A 3. fázis (feladatok) kódja már a repóban van; minden további szerkesztés azonnal élesíthető a NAS-on.
- `auth.server.ts`: `mkdirSync(/data)` + `new DatabaseSync('/data/texbox.db')` – hiányzó fájlnál **csendben üres adatbázist hoz létre**, majd táblákat és `backups/pre-*.db` mentést (üresről). Hiba esetén `conn=null`.
- `app-gate.ts`: `userCount()==0` és `APP_PASSWORD` megvan → **felkínálja a /__setup első admin létrehozást**. Ez a pontos mechanizmus, ahogy a „kétszer újraregisztráltam" tünet létrejön: üres de írható /data = új telepítésnek látszik.
- `shared-store.server.ts`: ENOENT → `{}` cache, első íráskor új `nas-state.json` – így tűnnek el a szobák, kedvencek, kapcsolatok, és nincs hibaüzenet.
- `TEXBOX_SECRET_KEY`: ha megváltozik/hiányzik, a store **hibát dob**, nem töröl – ez a tünetet nem magyarázza (fiókok nincsenek titkosítva).

## 2. Lehetséges okok (valószínűségi sorrend, egyik sem bizonyított)

1. Eltérő bind mount forrás (projekt újralétrehozva / átnevezve / másik mappa) → új üres `data`.
2. Névtelen kötet (VOLUME) használata bind mount helyett, majd konténer újralétrehozás.
3. Két példány / másik URL (pl. régi és új konténer, más port, Lovable-előnézet vs. NAS) – a regisztráció az egyikben, használat a másikban.
4. Jogosultság: a mappa nem olvasható → fiókoknál „storage" hibalap, store-nál hibaüzenet (ez inkább hibát mutatna, nem csendes ürességet).
5. Böngészősüti elvesztése → csak újrabelépést okozna, újraregisztrálást nem; a szobák eltűnését nem magyarázza.

## 3. Synology ellenőrzés (biztonságos, semmit nem töröl / nem ír felül)

**A. Most rögtön: automatikus frissítés megállítása, törlés nélkül**
- Container Manager → Konténer → `watchtower` → **Leállítás** (nem Törlés). Ezzel a `nas-vezerlo` fut tovább, de nem frissül.
- A Lovable-ben addig ne legyen új push/publikálás.

**B. Melyik mappát használja ténylegesen a futó app**
- Container Manager → Konténer → `nas-vezerlo` → Részletek → **Kötet / Mount** fül: jegyezd fel a **Forrás** abszolút útvonalát, a **Cél** legyen `/data`.
- Ha a forrás `/var/lib/docker/volumes/...` vagy hosszú azonosító → névtelen kötet (2. ok).
- Projekt fül: jegyezd fel a projekt nevét és útvonalát; ellenőrizd, hogy nincs-e **két** TexBox projekt / két `nas-vezerlo`-szerű konténer, és melyik porton (3050) fut.

**C. Hol lehet a régi adat** (File Station, csak böngészés)
- `/volume1/docker/*/data/`, `/volume2/docker/*/data/` stb. – keresd a `texbox.db`, `texbox.db-wal`, `texbox.db-shm`, `nas-state.json`, `backups/` elemeket.
- File Station keresés: `texbox.db` és `nas-state.json` az összes kötetre.
- Hasonlítsd: módosítás dátuma, méret; a `backups/texbox-ÉÉÉÉ-HH-NN.db` fájlok dátuma mutatja, mikor futott az adott példány.

**D. Konzisztens nyers mentés (minden talált data mappáról)**
1. `nas-vezerlo` konténer **Leállítása** (nem törlés) – így a WAL lezárul és nem íródik közben.
2. File Station: a teljes `data` mappát **másolás** (nem áthelyezés) egy új, dátumozott helyre, pl. `/volume1/texbox-incidens/2026-11-16-<projektnév>/` – együtt a `texbox.db`, `-wal`, `-shm`, `nas-state.json`, `backups/` fájlokkal. A `-wal`/`-shm` fájlokat soha ne töröld külön.
3. Ugyanígy minden régi talált `data` mappáról külön alkönyvtárba.
4. Csak ezután indítsd újra a konténert (vagy hagyd leállítva, amíg döntünk).
- Ne regisztrálj újra, ne írj felül semmit, ne másolj régi fájlt az aktuális fölé – a visszaállítás külön, egyeztetett lépés lesz.

**E. Mit küldj vissza (titkok nélkül)**: a Mount Forrás útvonala, a projekt(ek) neve/útvonala, a talált data mappák listája fájlmérettel és dátummal. APP_PASSWORD-ot, kulcsot ne.

## 4. Későbbi javítás (csak jóváhagyás után, külön körben)

- **Abszolút host bind mount** a compose-ban (pl. `/volume1/docker/texbox/data:/data`) és a TELEPITES.md frissítése; `VOLUME /data` kivezetése vagy dokumentált figyelmeztetés.
- **Persistence marker**: első sikeres inicializáláskor `/data/.texbox-instance` (azonosító + létrehozás ideje). Ha a marker hiányzik, de a gate szerint már volt telepítés (vagy fordítva), **fail-closed**: nincs automatikus üres DB / üres store, hanem helyreállító hibalap.
- **Migrációs guard**: üres `texbox.db` létrehozása csak explicit első telepítéskor (pl. `TEXBOX_INIT=1` vagy /__setup megerősítés, amely kiírja a teljes data útvonalat és tartalmát).
- `shared-store`: ENOENT esetén, ha a marker létezik, hibát dobjon, ne `{}`-t.
- **Diagnosztikai oldal** (admin, csak olvasás): data útvonal, fájlok mérete/dátuma, marker, utolsó snapshot, mount típusa (inode/eszköz), író-olvasó teszt.
- Watchtower: opcionálisan csak kézi frissítés vagy verziózott tag (`:latest` helyett), hogy fejlesztés közben ne élesedjen minden push.
- Tesztek: hiányzó DB + marker → hiba, nem üres DB; hiányzó store + marker → hiba; első telepítés továbbra is működik.

## Kockázat most
A 3. fázis kódja már a fő ágon van; minden újabb módosítás 5 percen belül a NAS-ra kerülhet. Amíg a Watchtower nincs leállítva és a mount nincs igazolva, minden frissítés újabb „üres indulás" kockázat lehet.
