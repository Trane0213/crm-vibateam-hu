# VIBA CRM – UX-egyszerűsítés: 1. kör (audit + terv + prototípus)

Cél: a meglévő funkciókat kevesebb kattintással, kevesebb menüponttal és érthető magyar szavakkal használhatóvá tenni. Nincs új CRM, nincs új funkció, nincs éles adat-, jogosultság- vagy adatbázis-változás, nincs publikálás és ügyfélküldés.

## Kiinduló tények (ellenőrizve)
- Kb. 75 bejelentkezett oldal (Ma, Sales x6, ajánlatok, projektek, jelenlét x8, levelezés, beállítások x17 stb.).
- Létező munkakörök az adatbázisban: tulajdonos, admin, projektvezető, értékesítő, marketing, általános felhasználó.
- Csoportvezető, villanyszerelő és műszaki előkészítő munkakör NEM létezik. Ezekhez az 1. körben csak tervezett felület készül; tényleges bevezetésük új jogosultságot igényel (külön tulajdonosi döntés).

## 1. Teljes UX-audit (dokumentum)
`docs/system-map/ux-audit-2026-11-15.md`
- Minden oldal, menüpont, űrlap és munkafolyamat egy táblázatban, besorolva: Megtartandó / Egyszerűsítendő / Összevonandó / Szakértői nézetbe / Timothy automatizálhatja / Eltávolítható (adatvesztés nélkül).
- Mérés minden fő feladatra: kattintás, adatbevitel, képernyőváltás, becsült idő — a jelenlegi kódból és Playwright-bejárásból számolva (izolált környezet), jelenlegi vs. tervezett.

## 2. Munkakörönkénti terv (8 munkakör)
`docs/system-map/ux-terv-munkakorok-2026-11-15.md`, munkakörönként:
- jelenlegi és tervezett munkafolyamat, menütérkép (legfeljebb 5 fő menüpont), felületvázlat
- Timothy-pontok (melyik képernyőn, milyen kontextust kap automatikusan)
- fejlesztési feladatok, kockázatok, függőségek, mérhető elfogadási feltételek (pl. „új ajánlat indítása max. 3 érdemi művelet")
- Elv: a menü elrejtése nem jogosultság; a meglévő RLS és szerepkör-ellenőrzés változatlan marad.

## 3. Ellenőrizhető prototípus — ajánlatkészítés (első prioritás)
Egyetlen ajánlat-munkaterület, három lépéssel:
```text
[1. Ajánlatkérés / dokumentumok] -> [2. Utasítás Timothynak] -> [3. Ellenőrzés és jóváhagyás]
                 Szakértői beállítások (alapból összecsukva):
                 óradíj, tartalék, árrés, mód, feldolgozás
```
- Meglévő panelek újrarendezése (kapott Excel, saját kalkuláció, ajánlatcsomag, küldés), nem új mentési/küldési útvonal.
- Beépített Timothy-sáv az ajánlat oldalán: a meglévő AI-panelt nyitja az aktuális ajánlat/ügyfél/dokumentum kontextussal (URL alapú kontextus marad), gyorsparancsokkal (pl. „csak erősáram árazása, hiánylista").
- „Mi a következő teendő?" sáv minden állapotban; hibánál konkrét javító gomb.
- Hiányzó/nem jóváhagyott árat Timothy nem pótol — a meglévő szabály kijelzése.
- A prototípus kapcsolóval (csak előnézet, csak felület) kapcsolható be; a régi nézet érintetlen. Nem publikáljuk.

## 4. Fejlesztési sorrend (jóváhagyás után, szakaszonként STOP)
1. Ajánlatkészítés + Sales Ma/leadek
2. Projektvezető + terepi (csoportvezető, villanyszerelő — szerepkör-döntés után)
3. Marketing, műszaki előkészítő, adminisztráció/pénzügy, tulajdonos

## Ellenőrzés
- Meglévő 1430 teszt + 21 AI-elfogadási teszt változatlanul zöld.
- Új tesztek: a szakértői beállítások elrejtése nem változtatja a számítást; menüszűrés nem ad és nem vesz el jogot.
- Playwright desktop + mobil képernyőképek a prototípusról (izolált, bejelentkezett éles próba nem elérhető).

## Döntést igényel (nem blokkolja az 1. kört)
- Új munkakörök (csoportvezető, villanyszerelő, műszaki előkészítő) felvétele — jogosultság-bővítés.
- A teljes átépítés indítása a prototípus átvétele után.
