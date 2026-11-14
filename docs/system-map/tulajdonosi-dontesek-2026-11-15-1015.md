# Tulajdonosi döntések — 2026-11-15 10:15 (P2–P7, összevonva és rangsorolva)

Pontosítva P7-ben (2026-11-14 23:30 UTC). Az ismétlődő kérdések összevonva; a régi sorszámok a végén. Egyik pont sincs élesítve.
Költség: „0 Ft” = nincs új szolgáltatási díj, csak munkaidő. Árak, díjak és normák kizárólag tulajdonosi döntéssel kerülhetnek a rendszerbe.

## 1. prioritás — ingyenes, ez nyitja meg a P7 átvételt
| # | Döntés | Javaslat | Költség | Kockázat |
|---|---|---|---|---|
| D1 | **Bejelentkezett TESZT-végigpróba**: ki (javaslat: Ramon Sales-ként + Tulajdonos) és mikor futtatja a P7-jelentés 6. fejezetének három forgatókönyvét egy TESZT-ügyön? A projekt bejelentkezése az AI számára nem érhető el, jelszót chatben nem kérünk. | Igen, 1 óra, TESZT-ügy | 0 Ft | Alacsony (TESZT-adat, küldés nélkül) |
| D2 | **Egyetlen összevont adatbázis-migráció** (`docs/system-map/p7-migracio/01_p7_osszevont_migracio.sql`): árazási mód, változtathatatlan számítás-/tervellenőrzés-/kalkulációmentés, belső csomagjóváhagyás, díjtörzs (verzió + jóváhagyás), feladat-token elrejtése. Visszaállítás kész, izolált próba 56/56. Meglévő adat nem változik. | Engedélyezés, utána külön körben a mentés bekötése a felületbe | 0 Ft | Alacsony–közepes (új táblák; a kiadott ajánlatok nem érintettek) |
| D2a | A díjtörzset **Sales (Ramon) tervezetként** szerkesztheti, **csak Tulajdonos hagyja jóvá**; jóváhagyott verzió nem módosítható, csak visszavonható. | Igen | — | — |
| D2b | A belső árazási adatok (önköltség, fedezet, számítások, jóváhagyások) **projektvezető és Marketing elől rejtve** maradjanak (most is így van a felületen). | Igen | — | — |
| D3 | A kapott költségvetéses ajánlat **kiküldése kötelezően kérje** az érvényes belső jóváhagyást (a D2 után, a meglévő küldési útvonal kis módosítása). | Igen, D2 után, külön engedéllyel | 0 Ft | Közepes (a küldési útvonal változik) |

## 2. prioritás — üzleti értékek (nélkülük nincs automatikus ár, a rendszer „hiányzó ár”-at jelez)
| # | Döntés | Felelős / határidő kérdése | Kockázat |
|---|---|---|---|
| D4 | **VIBA díjtörzs tartalma** egy körben: munkadíj-óradíj (korábbi díj változatlan vagy 6 500 Ft-ra skálázva — az 5 800 Ft-os alap nem igazolt); családi ház m²-csomagok (név, tartalom, feltételek, Ft/m² anyag és munkadíj külön); rezsióradíjak, éjszakai/hétvégi/sürgősségi felár, minimális kiszállás, kiszállási díj; VBF felmérési, mérési és dokumentálási díj, jogosult felülvizsgáló; szekrénygyártási és bekötési normaórák; anyagár-források (beszállítói árlisták, Ramon sablonja). | Ki adja meg és ki hagyja jóvá, mikorra? | Üzleti (rossz díj = rossz ajánlat) |
| D5 | **Alapértékek**: tartalék, alapértelmezett árrés vagy fedezet és mértéke, kerekítés, ár max. kora (most 365 nap), járulékok. Most nincs alapérték, eladási árra semmi nem kerül. | Tulajdonos | Üzleti |
| D6 | A KV 11026 (kiküldött, elfogadása nem igazolt) díjai maradjanak-e **automatikus forrás** más projekteknél? | Tulajdonos | Közepes (nem elfogadott ár terjedhet) |
| D7 | **Szakértői ellenőrzés**: ki nézi át 5 valós szekrény anyagjegyzékét (javaslat: Herceghalom FE, E1 + 3 másik)? A P4 átvételi feltétele. | Tulajdonos jelöli ki | Szakmai |

## 3. prioritás — fájl- és munkamódszer (alacsony kockázat, javaslattal)
| # | Döntés | Javaslat |
|---|---|---|
| D8 | Nem képletes összegoszlopú Excelbe írható-e érték; régi `.xls` átalakítható-e? | Csak kifejezett tudomásulvétellel; `.xls` → külön döntés |
| D9 | Az ellenőrzött árazott Excel automatikusan mentődjön, vagy maradjon a „Fájlok mentése” gomb? | Maradjon a gomb |
| D10 | Timothy maga írjon-e tételt (új jóváhagyásos művelet), vagy maradjon a javaslatkód betöltése + kézi gomb? | Maradjon kézi, amíg a díjtörzs (D4) nincs |
| D11 | Új ajánlatverzió örökölje-e az árazási módot (a meglévő verziókészítő függvény kis módosítása, D2 után)? | Igen |
| D12 | Pilot mérési napló (ajánlatkészítési idő, AI-költség, elfogadás): első körben kézi táblázat, vagy adatbázis? | Kézi táblázat az első 3 ügyletre |

## 4. prioritás — fizetős infrastruktúra
| # | Döntés | Költség (nem hitelesített) | Kockázat |
|---|---|---|---|
| D13 | **P2 nagyfájlos feldolgozó** telepítése (Cloudflare Containers, a tulajdonos Cloudflare-fiókjában), közös titkos kulcs beállítása. Nélküle nagy/szkennelt tervcsomag nem dolgozható fel, csak tárolható; az 500 MB-os átvételi próba nem futtatható. | Workers Paid előfizetés + használat (az aktuális árat a Cloudflare-fiókban kell ellenőrizni) | Közepes (új szolgáltatás, üzemeltetés) |
| D14 | Képfelismerési keret: 300 oldal/csomag elég-e? | Oldalankénti modellköltség — a GPT-6 Astra ára nem hitelesített | Költség |
| D15 | Félbehagyott feltöltések megőrzése (javaslat 7 nap) — ütemezett takarítás kell. | Ütemező szükséges | Alacsony |

## Régi sorszámok megfeleltetése
Régi 1, 2, 13 → D2 (+D3, D11); 3, 4, 6, 7, 14, 15, 16, 17 → D4/D5; 5 → D6; 8 → D7; 9 → D8; 10 → D9; 11 → D13–D15; 12 → D1; 18 → D10. P2 „token elrejtése” → D2. Új (P7): D2a, D2b, D3, D11, D12.
