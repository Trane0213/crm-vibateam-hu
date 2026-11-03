# V2.1/A – hatáselemzés és visszaállítás

## Hatókör
Kizárólag négy működési javítás. B/C felületi átrendezés, sablonalap-szerkesztés és automatikus PDF-generálás nem része ennek a szakasznak.

## Igazolt hibák
- `quote_lock_sent` csak zárolást írt, kiküldési bizonyíték nélkül; a státuszellenőrzés egy kézzel megadható időpontot fogadott el bizonyítéknak.
- A sablonöröklő trigger a csoport legújabb ajánlatából választott, nem a kiválasztott forrásból; verzió és alternatíva nem másolta kifejezetten a sablonmezőket.
- A nyomtatás a lead kapcsolattartóját használta az ajánlat kiválasztott kapcsolattartója helyett.
- A kísérőlevél alapértelmezetten mellékletre hivatkozott, miközben üres mellékletlista is küldhető volt (a 15:36-os TESZT levélben igazoltan 0 melléklet).

## Adatbázis-változtatás
- Új kiküldésbizonyíték-őr: sikeres, Gmail-azonosítós és időpontos, szerver által írt `quote_sends` nélkül nem állítható kiküldési időpont/zárolás/kiküldést jelentő állapot.
- Meglévő RPC-k frissítése: verzió és alternatíva pontos forrásból másolja a négy sablonmezőt; új lead-piszkozat az A alternatíva legutóbbi sablonját veszi át. A csoportszintű heurisztikus öröklő trigger megszűnik.
- Nincs táblabővítés, adatátírás, RLS vagy szerepkörváltozás. A `quote_sends` kliensnek továbbra is csak olvasható. Meglévő lezárt ajánlatok nem módosulnak.
- Hatás: bizonyíték nélküli rögzítés ezután hibát ad; valódi Gmail-küldés és valódi Gmail-levél hozzárendelése megmarad. Pipeline és lead üzleti szabályok érintetlenek.

## Visszaállítás
`database/rollback_quotes_v21_A_2026-11-03.sql`: kizárólag az érintett függvények/trigger korábbi definícióit állítja vissza, üzleti sort nem töröl vagy módosít. Visszaállítás ismét lehetővé tenné a bizonyíték nélküli zárolást, ezért csak tulajdonosi döntéssel.

## Ellenőrzés
Elkülönített PostgreSQL-adatbázis TESZT-fixture-ekkel: téves zárolás és hamis dátum elutasítása; sikeres/sikertelen bizonyíték megkülönböztetése; eltérő alternatívák forráshű sablonöröklése. Célzott Vitest, teljes regresszió, automatikus fordítási jelzés. Hitelesített böngészős és valódi mellékletes küldési próba külön jelölendő; külső Supabase-munkamenet nem átadható.

## PASS/FAIL – 2026-11-03 14:50 UTC
- **PASS (kód/elkülönített SQL):** igazolatlan kiküldési rögzítés tiltása; közvetlen zárolás és hamis időpont elutasítva. Sikertelen/folyamatban lévő/hiányzó Gmail-azonosítós bizonyíték nem elfogadott; sent és recorded bizonyíték elfogadott.
- **PASS (elkülönített SQL):** új verzió és új alternatíva a kiválasztott forrás `template_key`, `template_version`, `template_terms`, `site_address` értékeit örökli más sablonú testvéralternatíva mellett is. Forrássor változatlan.
- **PASS (unit):** PDF kapcsolattartója a mentett ajánlat választása; nincs lead-kapcsolattartó helyettesítés. Hiányzó/nem olvasható kiválasztott kontakt esetén nyomtatás blokkolt.
- **PASS (unit, kliens+szerver):** mellékletre hivatkozó levél üres mellékletlistával blokkolt. Nem hivatkozó szöveg melléklet nélkül megmarad. Nem került be automatikus PDF-generálás.
- **PASS:** ajánlatkezelő tesztek 22/22; AI acceptance 12/12; automatikus build OK (14:49:27 UTC).
- **FAIL – teljes regresszió:** 120/121; egy korábbi `nav-config.test.ts` tulajdonosi menüelérési teszt hibás. A korábban hozzáadott saját Gmail-menüpont explicit rejtett Owner számára, a teszt ezt nem veszi figyelembe. Nem módosítottam a V2.1/A-n kívüli menüt/tesztet. A menüteszt-fájl nélkül 117/117 PASS, ez nem teljes regressziós PASS.
- **NEM TESZTELT:** bejelentkezett PDF/mellékletes küldési végigpróba és élő Gmail-levél hozzárendelése (külső Supabase, nincs átadható munkamenet). A 15:36-os korábbi TESZT-küldés nem a javítás utáni végteszt.
- **PASS – éles read-only:** korábbi TESZT-ajánlat állapota és időpontjai változatlanok; új bizonyíték-őr jelen van, heurisztikus öröklő trigger nincs. `quote_sends` csak SELECT RLS policy-val rendelkezik, kliensírásra nincs policy (táblaszintű írási grant létezik, de RLS tiltja); RLS/grant nem módosult.
- Migráció sikeres: `20261103144647_fe6eca65-1c6b-4f95-be3c-f293cf922abf.sql`. 16 korábbi linter-jelzés maradt, a migráció nem vezetett be újat; külön vizsgálat szükséges, ebben a szakaszban nem módosult.
- **STOP:** B/C nem indult, publikálás és új éles levélküldés nem történt. A szakasz nem nevezhető teljesen végteszteltnek.

### Reprodukció
`bunx vitest run src/lib/quotes`; `bunx vitest run`; `bun run ai:acceptance`.
Az SQL-próba `database/tests/quotes_v21_A.sql`, kizárólag új, elkülönített PostgreSQL-ben futtatható; nem éles DB-re szánt script.