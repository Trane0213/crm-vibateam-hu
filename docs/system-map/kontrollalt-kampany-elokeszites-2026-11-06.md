# Kontrollált kampány – előkészítési kör, 2026-11-06

## Elkészült
- A meglévő kampánylistán kifejezett cégkijelölés; keresés nem jelöl ki automatikusan. Külön kontaktválasztás, a mentett címzettek újranyitva is megmaradnak.
- Tárgy/üzenet mentése ugyanabban a kampányban, timestamp-feltételes módosítás és archiválás. Másik tervezet betöltésekor előző tervezet adata nem menthető.
- Mentett címzettelőnézet: `{{ceg}}` a kapcsolt cég, `{{nev}}` csak ember által igazolt személy. Gyűjtőcím és nem ellenőrzött/emailből következtetett személy nem kap automatikus névhelyettesítést. Az előnézet egyszerű szöveg, nem HTML.
- Kontaktbesorolás/forrás/ellenőrzöttség a meglévő közös megjelenítővel. Hiányos Gmail-előzmény továbbra is blokkolja a kész minősítést; három céges fiók és SENT/DRAFT-védelem változatlan.
- Service-only `campaign_store_preparation`: szerepkör/saját kampány, zárolt timestamp, kontakt email/cég readback, teljes címzettcsere egy tranzakcióban. Hibás/részleges mentés visszagörget, nem jelez sikert.

## Adatvédelem
Jóváhagyott additive migráció: két nullable üzenetmező a meglévő email_campaigns táblán, nullable selected a meglévő címzettlistán. Nincs új üzleti tábla vagy backfill. Baseline és visszaállítás: database/campaign-preparation-2026-11-06/baseline.txt és database/rollback_campaign_preparation_2026-11-06.sql.

Friss SELECT: 664 cég, 701 kontakt, 8 lead, 1 tervezet, 0 kampánycímzett. Az eredeti tervezet neve/célcsoportja/állapota/felelőse/updated_at változatlan, új tartalom null. authenticated/anon nem hívhatja a snapshotírót. Nem történt éles ügyfél-/kontakt-/lead-/kampányadatírás, levélküldés, ütemezésaktiválás, Gmail-hozzáférésmódosítás vagy publikálás.

## Ellenőrzés
- 681 Vitest PASS, köztük 8 új kijelölés/név/validálási szabályteszt.
- Elkülönített PostgreSQL PASS: saját Marketing/Owner szöveg readback; Sales/PM/másik Marketing tiltás; elavult módosítás; szervermeta; tartalommódosítás draftba visszavet; ismétlődő/hibás címzettcsere atomikus rollback; megváltozott kontakt tiltás; service-only.
- Asztali 1280 és mobil 390 px elkülönített TESZT-megjelenítés: mentett szöveg betöltése, korábbi kijelölés, nem igazolt név kihagyása, dirty állapotban ellenőrzés tiltva; mobil túlcsordulás nincs, runtime hiba 0. Nem indított mentést/küldést.
- Valódi /campaign-list → /auth. Bejelentkezett Owner/Marketing kampánymentés és teljes szerepkörös hosted E2E **NEM TESZTELT**: external_unmanaged, nincs biztonságosan átadható munkamenet. Elkülönített teszt nem helyettesíti.
- Migráció 16 korábbi biztonsági jelzést talált, újat nem vezetett be; külön körben vizsgálandók, nem bővítettük a hatókört.

## Használat és STOP
Cégkijelölés → kontaktkijelölés → kampánynév/tárgy/üzenet mentése → kijelölt kontaktok ellenőrzése/mentése → tárolt címzett mellett Üzenet előnézete. Ez továbbra is előkészítés, nem küldési jóváhagyás.

Későbbi külön kapu: leiratkozás/tiltás hiteles forrása, postafióklimitek, tartós kézbesítési ismétlésvédelem és ütemezés. TESZT-/éles küldés és aktiválás csak kifejezett tulajdonosi jóváhagyással. STOP.