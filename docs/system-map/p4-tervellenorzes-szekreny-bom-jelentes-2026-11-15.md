# P4 — Tervellenőrzés, elosztószekrény-anyagjegyzék és eltéréslista (2026-11-15)

Állapot: **KÓD KÉSZ, izoláltan tesztelve.** Bejelentkezett éles végigpróba NEM TESZTELT (`external_unmanaged`).
Nincs adatbázis-/RLS-módosítás, éles írás, e-mail-küldés, Cloudflare-telepítés vagy publikálás.

## Mit tud
1. **Tervjel / lap / revízió / dokumentumtípus oldalszinten** (`sheet-identify.ts`): rajzszám (címkézett > címmező > fájlnév), lapszám és „X lapból áll”, revízió, dátum, szakág, típus (kapcsolási rajz, nézet, alaprajz, műszaki leírás, jelmagyarázat …). Minden érték oldal + szövegrészlet bizonyítékkal; ütközés, hiányzó lap, eltérő revízió jelölve. A4 álló oldalon (levél, leírás, Q&A) csak címkézett rajzszám fogadható el — a hivatkozott tervjel nem a lap azonosítója.
2. **Feldolgozási mátrix fájlonként**: „szövegréteg teljesen olvasva / részben / olvashatatlan (OCR szükséges) / nagyfájlos feldolgozó szükséges / nem PDF / hiba”. Olvashatatlan fájlnál soha nincs „minden terv ellenőrizve”.
3. **Elosztószekrény anyagjegyzék** (`cabinet-bom.ts`): nézeti rajz tételes listája + szekrénytest + kapcsolási rajz áramkörei. A kapcsolási rajz gépi jelölésszáma csak összevetésre szolgál; eltérésnél szakértői ellenőrzés és kérdés.
4. **Szekrénykalkuláció** (`cabinet-pricing.ts`) a P3 determinisztikus motorral (`priceDescriptor`, új árazó nincs): külön költségnem **anyag / összeszerelés-gyártás / helyszíni felszerelés-bekötés**. Normaórák alapból üresek; megadott normák „felhasználói feltételezés”, nem jóváhagyott VIBA-szabály. Bármely nyitott sor (nincs ár, nincs norma, ismeretlen mennyiség, nincs rajz) → **„Részösszeg — NEM teljes szekrényár”**.
5. **Eltéréslista** (`scope-check.ts`): költségvetés ↔ terv ↔ műszaki leírás ↔ ellenőrzött e-mailes pontosítás. Hiányzó tervre hivatkozás, rajz nélküli szekrény, terven lévő de kiírásban hiányzó szekrény, kábel-keresztmetszet eltérés (csak ha a kiírt keresztmetszet a terven egyáltalán nem szerepel), kizárás/feltételezés/egyeztetési pont a leírásból, gyártás+bekötés egy tételben (dupla elszámolás nélkül), opciós tétel, tipikus kimaradó munkarészek.
6. **Hiányjegyzék és kérdéslista** egyedi kérdésekkel; hiányzó vagy bizonytalan tervnél soha nincs kitalált teljes szekrényár.
7. **E-mailes pontosítás** csak akkor fogadható el, ha a levél a hívó számára látható, jogosult (`crm_mailboxes`) postafiókból való, ugyanahhoz a leadhez/céghez/projekthez kötött, és az idézet szó szerint szerepel. Egyébként okkal elutasítva.
8. **Integráció**: ajánlat oldal „Tervellenőrzés és szekrénykalkuláció” panel (csak Tulajdonos/Sales), belső CSV; Timothy `quote_check_plans` csak olvasó eszköze ugyanazzal a szerverfüggvénnyel. A tervszöveg nem utasítás (prompt injection teszt).

## Forrás és korlátok
- Forrás: P2 `package_file_units` (hívó RLS-ével), vagy az ajánlat kis PDF-jei közvetlen szövegréteg-olvasással (20 MB/fájl, 80 oldal/fájl, 80 MB és 400 oldal összesen, meglévő R2-aláírás). Nagyobb / feldolgozatlan fájl: „nagyfájlos feldolgozó szükséges” — nem állítjuk olvasottnak.
- Grafikus szimbólum, pólusszám-ábra, CAD (DWG/DXF) **nincs értelmezve**; szkennelt oldal OCR-t igényel (P2 feldolgozó vagy kérésre képfelismerés).
- Semmi nem mentődik (nincs P4 tábla); a P3 adatmodell-kérdés érvényes erre is.

## Tesztek (2026-11-15)
- Új P4 tesztek: `plans.test.ts` 17, `scope-check.test.ts` 10, `plan-review.server.test.ts` 9 (Marketing/PM/szerepkör nélküli elutasítás, nem látható ajánlat, más ajánlat dokumentuma, nem költségvetés, nagy/nem PDF/hamis PDF/kulcs-kilépés, csak SELECT, P2-oldalak letöltés nélkül, e-mail-pontosítás 5 elutasítási ok, normák).
- Teljes CRM: lásd commit üzenet (≥1279 sikeres), AI acceptance 21/21, típusellenőrzés OK.
- Izolált böngészős próba (`scripts/qa/check_plan_review.py`, szimulált szerver, valódi motorral számolt TESZT-eredmény, minden írás 403): Sales és Tulajdonos asztali, Sales mobil — panel, 5 teljes + 1 rajz nélküli részösszeg szekrény, eltérések, 13 kérdés, olvashatatlan fájl jelölés, CSV letöltés, nincs vízszintes túlcsúszás, nincs írás, nincs hiba. Projektvezető: panel nem jelenik meg.
- Valós minta, csak olvasva (R2 → `/tmp`, repóba nem került; `scripts/qa/p4-real-check.ts`): 17 PDF / 63 oldal 1,7 mp alatt. Herceghalom Ge-1…Ge-6 + műszaki leírás: 6/6 rajzszám, lapszám, dátum helyes; FE és E1 szekrény felismerve, szekrénytest (PRISMA G 1380×600×205, PrismaSet XS 750×426×151) helyes. **Valós eltérés jelezve**: FE nézet 54 kismegszakító / 4 RCD / 2 kontaktor ↔ kapcsolási rajz gépi jelölés 44 / 5 / 3; E1 16 ↔ 15 → szakértői kérdés, teljes ár blokkolva. V-1 szkennelt → „Olvashatatlan (OCR szükséges)”. Marina/MCA3 alaprajzok: 7 rajzszám felismerve, 1 bizonytalan (`AB2.03.B.RZ`, közepes megbízhatóság).

## Átvételi kapuk — nem teljesítve
- Specifikáció: ≥5 különböző valós szekrény BOM-jának **szakember általi ellenőrzése** — nem történt meg (csak 5 szintetikus TESZT + 2 valós szekrény gépi összevetése).
- Nagyfájlos (P2 Container) feldolgozás, OCR, CAD — nincs telepítve/engedélyezve.
- Bejelentkezett Sales/Owner végigpróba és Timothy élő chat — nem tesztelt.

## Döntések a 10:15-ös összefoglalóhoz (P4)
1. Ki ellenőrzi szakértőként az 5 valós szekrény anyagjegyzékét (javaslat: Herceghalom FE, E1 + 3 másik)?
2. Gyártási/szerelési és helyszíni bekötési normaórák (készülékenként / szekrényenként) — VIBA-szabályként jóváhagyandó.
3. Anyagár-forrás szekrényalkatrészekre (beszállítói lista / Ramon sablon) — P3 kérdéssel közös.
4. P2 Container telepítés és OCR-keret (nagy és szkennelt tervekhez).
5. Mentsük-e a tervellenőrzés eredményét (közös a P3 adatmodell-döntéssel)?

## P5 folytatás
A spec szerinti P5: ajánlatdokumentum-összeállítás és jóváhagyásos kiküldés-előkészítés a meglévő quote/Gmail P0 útvonalon — árazott TERVEZET + tervellenőrzési kérdéslista + lehatárolás (kizárás/feltételezés) egy ügyfélnek szánt, Tulajdonos/Sales által jóváhagyandó csomagba; Timothy összefoglaló a hiánylistából; semmi automatikus küldés. Előfeltétel-függetlenül végezhető: lehatárolás-szövegsablon a findingokból, ügyfélkérdés-levéltervezet (nem küldve), regressziós tesztek.
