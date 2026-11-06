# Marketing 3. kör – tartós kampánytervezet és szigorú jogok (2026-11-06)

## Régi terv kritikája (javítva)
- `created_by default auth.uid()` önmagában hamisítható volt → guard trigger kliensnél mindig `auth.uid()`-ra írja, módosítása tilos.
- `is_owner_role` 'admin/superadmin' nevet is ownernek vesz → helyette `crm_role_of(...) = 'owner'` (nem bővül a jog).
- Marketing státuszt `approved`-ra állíthatott volna → `approved/sending/sent` nem létezik; `prechecked` csak service role-lal.
- Delete policy, anon SELECT-jog és nyitott recipients-írás → törlés nincs (archiválás), anon jog visszavonva, recipients kliensről csak olvasható.
- Rollback a régi policyt `to public` adta volna vissza → javítva: `database/rollback_email_campaigns_rls_2026-11-06.sql`.

## Migráció – ALKALMAZVA (csak 2 tábla)
Előtte 0 kampányrekord, egyetlen kódhivatkozás (audit-lista). `email_campaigns`: `created_by`, `updated_at`, `prechecked_at`, status ∈ draft/prechecked/archived, guard trigger. Új `email_campaign_recipients`: contact_id FK, `email_norm`, eligibility, indokok, időpontok; egyedi (kampány, email) és (kampány, kontakt); „ready” csak érvényes emaillel.
Readback: 0 kampány / 0 címzett; policyk: campaigns select/insert/update (authenticated), recipients select; anon SELECT=false, authenticated DELETE=false, recipients INSERT=false.

## RLS próba (valós szerepkörök, tranzakcióban, visszavonva) – PASS
draft kényszerített insertnél ✓ · kliens prechecked tiltva ✓ · created_by-csere tiltva ✓ · törlés tiltva ✓ · kliens címzett-írás tiltva ✓ · marketing csak saját (1/0) ✓ · másik marketing update 0 sor ✓ · sales 0 sor, insert tiltva ✓ · anon tiltva ✓ · owner lát+szerkeszt ✓ · duplikált cím tiltva ✓ · hibás cím nem lehet ready ✓ · szerver prechecked ✓. PM-felhasználó nincs, nem tesztelt.

## Kód
- Kampánylista panel: új/meglévő tervezet, mentés-állapot, szerkesztés, archiválás/visszaállítás, „Kiküldés tiltott”, tárolt ellenőrzés csoportokkal, 50-es lapozás (számlálók 1000 felett is), elavulás-jelzés (kontakt email változott vagy új levél az ellenőrzés óta).
- `campaign-drafts.functions.ts`: írás user-klienssel (RLS), címzett és prechecked csak szerveren, előtte user-RLS írhatósági próba. Hiányos előzményvizsgálat → tervezet marad. Postafióknevek nem tárolódnak, levéltartalom nem kerül ki.
- A 2. kör mentés nélküli DRY-RUN szerverfüggvénye megszűnt (egy nézet maradt), a közös logika `campaign-precheck.server.ts`.

## Tesztek
Vitest 635/635 PASS (szabályok: hiányos előzmény, másik postafiók kimenője, válasz, duplikáció, hibás cím), TypeScript PASS. Mentés→újraolvasás→szerkesztés→archiválás: DB-szinten a fenti RLS-próbában PASS; **bejelentkezett böngészős E2E: NEM TESZTELT**.

## Állapot
Éles mentés a publikálás után működik. Küldés, jóváhagyás, leiratkozási lista nincs. A Pretor-hiány és a téves Viba-Team kapcsolatok miatt a „kész” cím sem jelent küldési engedélyt.
