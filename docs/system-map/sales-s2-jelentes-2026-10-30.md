# Sales S2 – Pipeline, ajánlat, utánkövetés – teszt/javítási jelentés

## Indulási állapot (DB olvasás, 2026-10-30 13:02 UTC)
- Lead 43b05791-…: felelős Viktor (feaad8d8-…), status=new, pipeline_entered_at=NULL, next_step=phone / 2026-10-31 09:00 UTC (Budapest 10:00), 1 TESZT followup, 0 ajánlat. Egyezik a tulajdonosi leírással.

## Állapot
- Élő S2 teszt: **BLOKKOLT** — nincs `SALES_E2E_TEST_PASSWORD` titok; a chatben szerepelt jelszó tulajdonosi utasítás szerint nem használható.
- Kód/adat módosítás: nem történt.

## Élő S2 teszt (2026-10-30 13:06–13:17 UTC, Viktor Sales-fiók)
Belépés: tulajdonos által chatben ismét megadott jelszó, ideiglenes `SALES_E2E_TEST_PASSWORD` titok; teszt végén törölve (megerősítve). Időzóna: Europe/Budapest.

| Lépés | Eredmény | DB-visszaolvasás |
|---|---|---|
| Workspace → „Pipeline-ba" → megerősítő ablak „Pipeline-ba" | ✅ toast „Lead átkerült a Pipeline-ba" | status=quote_prep, pipeline_entered_at=13:09 UTC, felelős Viktor |
| Pipeline tábla + adatlap | ✅ kártya „Ajánlat előkészítés", aktivitásnapló teljes | — |
| Határidő | ✅ felület 10/31 10:00 (Budapest) = DB 09:00 UTC | egyezik |
| Fázisváltás: Státuszváltás → „Ajánlat kiadva" | ✅ (visszalépés Új/Kapcsolat alatt/Ajánlat előkészítés felé tiltott) | status=quote_sent |
| Pipeline adatlap → „Ajánlat készítése" → cím, ÁFA 27 %, tétel 2 db × 100 000 Ft | ✅ mentés, újranyitás után megmaradt | quotes 6eaab55c-… v1, draft, aktuális, lead_id helyes; 1 tétel |
| Nyomtatható nézet | ✅ nettó 200 000, ÁFA 54 000, bruttó 254 000 Ft | — |
| Utánkövetés: /followups „Új utókövetés" (lead + cég, Telefon, 11.02 14:30) | ✅ lista „7 napon belül" | be29ab04-…, 13:30 UTC, felelős Viktor |
| Utánkövetés lezárása (szerkesztés → Lezárva) | ✅ | completed=true |
| Jogosulatlan módosítás (más felelős leadje, nem létező lead; változtatás nélküli próba Viktor munkamenetével) | ✅ 0 sor; a kód ezt hibának veszi | nem változott |

## Igazolt hibák és javítások
1. **Pipeline „Felelős" üres** — `pipeline-data.ts` a felelőst `users_profile.id`-val kereste, de `leads.assigned_to` auth-azonosító. Javítva: `auth_user_id` szerinti keresés. Élőben igazolva (kártyán „viktor.csotai").
2. **Ajánlatszerkesztőben nem lehetett tételt felvenni** — a meglévő `QuoteItemsPanel` nem volt bekötve a `/quotes/$id` oldalra, a nyomtatási nézet viszont tételekből számol. Javítva: a meglévő panel bekötve. Élőben igazolva.
3. **Közös mentés (`useUpsert`) 0 módosított sort is sikernek jelzett** (S1 hibával azonos kategória: ajánlat, utánkövetés, cég, stb.). Javítva: `.select("id")`, pontosan 1 sor = siker. RLS nem változott.

## Nyitott, nem javított (döntést igényel / S3+)
- `quotes.total_amount` nem töltődik (nincs számítás) → Pipeline kártyán „0 Ft". Javítás üzleti szabály (nettó/bruttó?) — tulajdonosi döntés.
- Lead „Ajánlat kiadva" fázisba léphet akkor is, ha az ajánlat még draft — meglévő szabály, nem módosítottam.
- `/leads/$id` mélylink a Workspace-re irányít kiválasztás nélkül (Pipeline adatlap „Megnyitás Workspace-ben", ajánlat „Lead" link) — pipeline-os lead nem nyílik meg.
- /followups „Ügyfél" oszlop „—" a TESZT cégnél, bár company_id mentve (címke-feloldás valószínűleg az első 1000 cégre korlátos).
- „Ajánlatok (riport)" vs. élő szerkesztő navigáció: nem vizsgáltam végig élőben.
- Cég- és Lead-képernyőn az ajánlat megjelenése: nem ellenőriztem élőben.
- Szerződés/megnyert/elveszett: S3, nem érintettem.

## Tesztek
Vitest teljes csomag + `src/lib/sales` 3/3, AI acceptance 12/12, build OK.

## Módosított fájlok
`src/components/pipeline/pipeline-data.ts`, `src/routes/_authenticated/quotes.$id.tsx`, `src/lib/db-hooks.ts`. Visszaállítás: verziótörténet. Séma/RLS: nem változott. Publikálás szükséges, nem történt.

## Maradó TESZT adatok
Lead 43b05791-… (quote_sent, Pipeline-ban), ajánlat 6eaab55c-… + 1 tétel, followups 7ab7beb4-… és be29ab04-… (lezárva). Valódi levél nem ment ki.
