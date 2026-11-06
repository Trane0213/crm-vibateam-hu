# Közös cégadatlap – 2. kör, megjelenítési rész

- A meglévő `/customers/$id` owner és marketing megjelenítése közös marketingállapot-összefoglalót és közös **Kampányok** fület használ. Nem új cégnyilvántartás; ugyanaz a company ID.
- Kampánytagság a mentett `email_campaign_recipients` → látható `email_campaigns` kapcsolatból, pontos contact ID-kkel, user-RLS mellett. Nem a Kampánylista aktuális kereséséből vagy notesból. 1000-es adatlapok/200-as kontaktcsoportok, 25-ös felületi lapozás; előellenőrzési kategória és indok látható, tartalom/küldés nincs.
- Marketing cégoldalon **Utánkövetések** fül: a már olvasott, jogosult cégsorok és link a meglévő utánkövetés-kezeléshez. RLS és felelősi scope változatlan. A tasks táblának nincs company_id mezője, ezért nem találgatunk céges feladatkapcsolatot.
- Idővonal: kimenő jelző önmagában nem „elküldve”, DRAFT külön piszkozat, csak a meglévő közös bizonyítékőrrel igazolt SENT elküldött. A régi marker nem teljes státusztörténet; 200-as és lapozott forráskorlátok nem teljes történetként szerepelnek.
- Kampányfrissítés a meglévő egycsatornás közös refreshben, nem új subscription. Az új mező-/szerepjog vagy Realtime-publication módosítás nem része ennek.

## Hátralévő kapu
**A 2. kör nem teljes:** a marketing workflow még `companies.notes` markereket olvas/ír. Strukturált állapotot és ellenőrzött kontakt-provenienciát nem állítunk késznek. Külön migrációs előkészítés: `database/plan_company_marketing_state_2026-11-06.md`; nem alkalmazott, nincs backfill vagy markerátvezetés. Sales-handoff, Gmail-send és kampánymenet nem módosult.

## Ellenőrzés
658/658 regressziós teszt PASS, 60 fájl (3 új idővonal-bizonyítékteszt). Automatikus fordítás: build OK. Belső, bejelentkezett kampány-/cég-/utánkövetés-/szerepkör végigpróba NEM TESZTELT: external_unmanaged és nincs biztonságos átadható munkamenet. Nem történt üzleti adatírás, levélküldés, migráció vagy publikálás. STOP a strukturált tárolás külön engedélyezési kapujánál.