# Tulajdonosi döntések — 2026-11-15 10:15 (P2–P6 összevonva)

Minden pont blokkoló az adott részre; a tőlük független fejlesztés folyt. Jelenleg egyik sincs élesítve.

## Adatbázis (egy jóváhagyással összevonható)
1. **Árazás és tervellenőrzés mentése** (P3/P4): számítási verziók, Ramon ártörzse, módosítási napló, árazási mód, tervellenőrzési eredmény.
2. **Ajánlatcsomag belső jóváhagyása** (P5): `quote_package_approvals` tábla (SQL a P5 jelentésben), változtathatatlan sorok. Kérdés: a küldés kötelezően kérje-e ezt a jóváhagyást?

## Árak és normák
3. Korábbi VIBA-díj változatlan vagy 6 500 Ft-ra skálázva (az 5 800 Ft-os alap nem igazolt)?
4. Alapértékek: tartalék, célfedezet, kerekítés, ár max. kora (most 365 nap), járulékok.
5. A KV-díjak más projekteken automatikusan használhatók maradjanak?
6. Szekrénygyártási és bekötési normaórák VIBA-szabályként.
7. Anyagárak forrása (beszállítói árlisták, Ramon sablonja) — ki és mikorra.

## Szakmai ellenőrzés
8. Ki nézi át szakértőként 5 valós szekrény anyagjegyzékét (P4 átvételi feltétel)?

## Fájlok
9. Nem képlet összegoszlop esetén írható-e érték? Régi .xls átalakítható-e?
10. Az ellenőrzött Árazott Excel automatikusan mentődjön, vagy maradjon a P5 kifejezett „Fájlok mentése” gombja (most ez működik)?

## Infrastruktúra és költség
11. P2 nagyfájlos feldolgozó (Cloudflare Containers) telepítése, OCR-keret (javaslat 300 oldal/csomag), félbehagyott feltöltések megőrzése (javaslat 7 nap).

## Ellenőrzés
12. Bejelentkezett végigpróba P1–P5-re: ki és milyen TESZT-ügyön (jelszót chatben nem kérünk)?

## P6 — saját VIBA-ajánlat (új pontok)
13. **Kalkuláció mentése** (adatbázis, az 1–2. ponttal összevonható): `quotes.pricing_mode` mező és változtathatatlan `quote_calculations` tábla (SQL a P6 jelentésben). Addig a munkapéldány csak a felhasználó böngészőjében marad.
14. **VIBA m²-csomagok:** csomagnevek (pl. Alap/Közép/Prémium?), tartalom pontonként, feltételek és Ft/m² díj (anyag és munkadíj külön) — ki hagyja jóvá és mikor. Most nincs egyetlen jóváhagyott csomag sem.
15. **Rezsióradíjak:** szerepkörönkénti óradíj, éjszakai/hétvégi/sürgősségi felár, minimális kiszállási időkeret, kiszállási díj (alkalom vagy km). A 6 500 Ft-os minta maradjon csak referencia?
16. **VBF-díjak:** felmérési/kiszállási díj, javítás utáni mérés és dokumentálás díja; ki végzi a jogosult felülvizsgálatot (saját vagy külső).
17. **Önköltség-alapú árazás:** a saját ajánlatoknál árréssel vagy fedezettel dolgozzunk alapból, és mekkora célértékkel? (Most nincs alapérték; eladási árnál nem kerül rá semmi.)
18. **Timothy tételírása:** maradjon a mostani „javaslatkód betöltése + kézi beírás”, vagy legyen P0-jóváhagyásos Timothy-tételírás (új művelettípus, adatbázis-módosítással)?

