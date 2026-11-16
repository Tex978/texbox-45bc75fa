# Okosotthon (/home) – mobil-first újratervezés

Csak megjelenés, információs hierarchia, navigáció és elrendezés változik. Integrációk, lekérdezések, vezérlési parancsok, polling (Growatt 15 perc), eszközadatok és szerveroldal változatlan. Egyetlen funkció sem törlődik.

## Jelenlegi állapot (átnézve)
- `src/routes/home.tsx`: fejléc (cím + családi fotó + frissítés), 4 összesítő csempe, 5 nézetfül (Áttekintés, Klíma, Redőnyök, Eszközök, Energia), alfülek (Hőmérők/Klímák/Légtisztító; Smart Life/Bosch/Zárak).
- Komponensek: Thermometers, Purifiers, Locks (home.tsx-ben), Gree, Blinds, Tuya, Appliances, SmartEnergy, ThermometerHistory, SmartHomeUI.
- Stílusok: `.smart-home` scope a `src/styles.css`-ben, sok egyedi px-érték és több töréspont, kevés közös kártyaminta.

## Képernyő-struktúra (telefon)

```text
+--------------------------------+
| Jó reggelt · Otthon      ⟳ ☾  |  kompakt fejléc, fotó nélkül
| ● 14 online  ○ 2 offline       |  állapotsor
+--------------------------------+
| [21–24°] [1,8 kW] [2 nyitva]   |  vízszintes összesítő chipek
| Gyorsműveletek                 |
| (Minden redőny le)(Klíma ki).. |  nagy, görgethető gombok
| Kedvencek                      |
| [kártya][kártya]               |  2 oszlopos eszközrács
| Szobák                         |
| Nappali · 5 eszköz · 23°   >   |
| Hálószoba · 3 eszköz · 21° >   |
+--------------------------------+
| Otthon  Szobák  Eszközök  Energia  Több |  alsó tab bar
+--------------------------------+
```

1. **Otthon**: üdvözlés, online/offline összesítő, összesítő chipek, gyorsműveletek, kedvencek, szobalista.
2. **Szobák**: szobánkénti nézet (hőmérséklet, páratartalom fent, alatta az eszközök kártyái).
3. **Eszközök**: összes eszköz típus szerinti szűrőchipekkel (Hőmérők, Klímák, Légtisztító, Redőnyök, Smart Life, Bosch, Zárak) és kereséssel; a mai alfülek ide olvadnak.
4. **Energia**: a mai napelem/energiaáramlás nézet új kártyákban.
5. **Több**: eszközkezelők (átnevezés, elrejtés), kapcsolat-állapotok, ugrás a Kapcsolatok oldalra, téma választó.

Eszközrészlet: kártyára koppintva alsó lap (bottom sheet) nyílik a teljes vezérléssel (klíma mód/hőfok/ventilátor, redőny csúszka, Bosch programok, hőmérő előzmények). A kártyán csak a fő művelet (kapcsoló / gyors állapot) marad.

Asztali nézet: ugyanez bal oldali navigációval és 3–4 oszlopos rácsban; a tab bar 1024px felett oldalsávvá alakul.

## Design rendszer
- **Színek**: semleges grafit alap, egy hangsúlyszín (jégkék) + állapotszínek tokenként: `--state-on`, `--state-off`, `--state-offline`, `--state-warning`, kategória-árnyalatok (klíma, energia, árnyékolás, eszköz) halvány háttérrel. Minden a `styles.css` tokenjeiben, világos és sötét értékkel.
- **Világos/sötét mód**: `.dark` osztály, alapértelmezés a rendszer beállítása, kézi váltó a fejlécben; csak a böngészőben tárolva, hidratálás után olvasva.
- **Tipográfia**: egy modern grotesk (pl. Geist vagy Manrope) – skála: 12 / 14 / 16 / 20 / 28; számok tabulárisan.
- **Térköz**: 4-es rács (4, 8, 12, 16, 24, 32); kártya belső térköz 16.
- **Kártyák**: 16px lekerekítés, finom árnyék világosban, keret sötétben; aktív eszköz színes ikonháttérrel.
- **Ikonok**: csak lucide, egységes 1.75 vonalvastagság, 20/24px; ikon kerek színes "pill" háttérben.
- **Érintés**: minimum 48px célterület, kapcsolók 52×32, csúszkák vastag fogantyúval, alsó lap húzható.
- **Állapotjelzés**: minden kártyán pont + szöveg (Be / Ki / Offline / Hiba), offline kártya halványítva, de kezelhető maradó funkciói megmaradnak; "Minta" címke a demo adatokra.

## Lépésenkénti megvalósítás
1. Design tokenek és sötét mód a `styles.css`-ben; régi `.smart-home` szabályok leltára.
2. Közös UI elemek: `DeviceCard`, `StatusDot`, `SummaryChip`, `QuickAction`, `DeviceSheet` (shadcn Drawer/Sheet), `HomeTabBar`.
3. Új `home.tsx` váz: 5 tab, a mostani lekérdezések és frissítés változatlanul; családi fotó eltávolítása a fejlécből (a fájl és a főoldali használat marad).
4. Meglévő eszközkomponensek átcsomagolása: a vezérlő logika marad, csak a kártya/sheet elrendezés változik (Gree, Blinds, Tuya, Appliances, Thermometers, Purifiers, Locks, SmartEnergy, ThermometerHistory).
5. Kedvencek és gyorsműveletek: a már létező parancsokat hívják (pl. minden redőny le = a meglévő redőnyparancs egymás után).
6. Szobák nézet.
7. Asztali elrendezés, akadálymentesség (aria, fókusz), csökkentett mozgás.
8. Ellenőrzés Playwrighttal 360/390/430/824/1280 szélességen, világos és sötét módban; a meglévő tesztek futtatása; `AGENTS.md` szabály frissítése.

## Kockázatok
- **Szobák**: az eszközadatokban nincs megbízható szoba-mező. Két út: (a) csak a böngészőben tárolt hozzárendelés – nem közös a telefonok közt; (b) a meglévő közös szerveres beállítás-tárban tárolni – ez kis szerveroldali bővítés lenne, ezt külön jóváhagyásra javaslom. Alapértelmezés: (b), ha elfogadod; addig névből tippelt csoportosítás ("Nappali", "Háló").
- **Kedvencek** ugyanígy: közös tárolás csak kis szerver-bővítéssel.
- **Gyorsműveletek**: több eszköz egyszerre vezérlése több egymás utáni hívást jelent – Gree felhő és Tuya korlátai miatt sorban, visszajelzéssel kell futtatni.
- **Nagy komponens-átdolgozás**: a vezérlők áthelyezésekor könnyű elveszíteni egy-egy ritka funkciót (Bosch távoli indítás figyelmeztetés, Xiaomi ellenőrzés link, Renault/Home Connect újrakapcsolás). Előtte funkciólistát készítek és a végén tételesen ellenőrzöm.
- **Sötét/világos mód** a többi oldalt is érintheti; a váltót csak az Okosotthonon jelenítem meg, de a tokenek globálisak – ellenőrizni kell a többi oldalt is.
- **Hidratálás**: téma és kedvencek böngészős tárolása csak betöltés után olvasható, különben villanás/hiba.
- Élő eszközökkel csak a Synologyn lehet végleg ellenőrizni; itt a minta adatokkal tesztelek.
