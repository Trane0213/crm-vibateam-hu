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