# 6. nagy csomag — Sales → projektvezető tényleges átadási munkafolyamat (2026-11-14)

Állapot: **KÓD KÉSZ, izolált TESZT-próbával ellenőrizve. Bejelentkezett Sales / PM / Owner végigpróba éles adattal: NEM TESZTELT** (a projekt `external_unmanaged`, böngészős munkamenet nem injektálható).
Nem változott: DB-séma, migráció, RLS, trigger, jogosultság, titok, külső integráció, ütemezés, költségkeret, AI-eszköz; nem volt éles adatírás, ügyfélküldés, publikálás vagy fizetős AI-hívás.

## 1. Audit (read-only) — mi volt kész, mi hiányzott

| Terület | Állapot a csomag előtt | Forrás |
|---|---|---|
| Megnyerés + projekt létrehozás | VALÓS, atomi: `sales_mark_won_with_project` (owner vagy kijelölt Sales, csak Szerződés szakaszból, érvényes PM) | RPC |
| Ajánlat / utánkövetés / kapcsolattartó átkötése | VALÓS: `projects_link_lead_records` trigger (nem másol) | trigger |
| `handoff_at` | VALÓS: `projects_lead_handoff_guard` tölti | trigger |
| Átadott adatok | `handoff_payload`: source, summary, notes, PM, created_via | projects |
| Cím, határidő, projekttípus | **HIÁNYZOTT** a megnyerésből; pótlás csak a Projektek lista ⋯ → Szerkesztés útján | projects |
| Projektvezető kijelölése utólag | **NEM VOLT UI** (George mégis „jelölj ki a projekt adatlapján”-t javasolt) | — |
| Projekt Átadás fül | csak TIG-előkészítő lista; a Sales-átvétel nem látszott | `projects.$id.tsx` |
| Megnyertük ablak | az átadási jegyzet előre kitöltve az ügy összefoglalójával → **kettős adat** (a summary külön is mentődik); kezdődátum UTC szerint; siker után az Áttekintés fül | `create-project-dialog.tsx` |
| Megnyert ügy a Sales-nél | Sales-előkészítő panel: „a Pipeline-ban van, … szerződés ott folytatódik” + kötelező következő lépés figyelmeztetés — **félrevezető**; projektlink nem volt | `sales-prep-panel.tsx` |
| Owner kritikus projekt | az „Átadás / előkészítés” (`atadas`) állapotot **tévesen „Műszaki átadás állapotban”** feliratozta | `owner-day-flow.ts` |
| George átadási hiányok | VALÓS, de saját, külön szabálylistával | `org-signals.ts` |
| Szerződés-jóváhagyás, e-aláírás, TIG, anyagigény | **NINCS ADATMODELL** — nem szimuláljuk | — |
| Jogosultság | projects olvasás: owner/PM/Sales/Marketing; írás: owner/PM/Sales (`projects_write`); leads: Sales csak saját, PM csak projekthez kötött; `/projects` útvonal: owner/PM/Sales | RLS, `permissions.ts` |

Éles pillanatkép (read-only SQL, 2026-11-14 03:06 UTC): 4 aktív projekt, mind atomi megnyerésből, mind van PM; **0 címmel, 0 határidővel, 0 feladattal, 0 dokumentummal, 0 elfogadott ajánlattal**; 3/4 kapcsolattartóval, 3/4 ajánlattal; 1 projekt átadási szövege 20 karakter alatti. Várható kép: mind a 4 „Sales- vagy Projektvezetői pótlásra vár”.

## 2. Megvalósított munkafolyamat

```text
Pipeline → Szerződés → Megnyertük ablak (előnézet: mi megy át automatikusan, mi hiányzik)
  → sales_mark_won_with_project (változatlan) → projekt Átadás fül (közvetlenül)
     1. Sales → projektvezető átvétel: következő lépés (szerepkör szerint) + 11 tételes ellenőrzőlista
        (állapot, felelős szerepkör, forrás, pótlás helye) + Alapadatok pótlása + Sales átadás adatai
        + „Nincs a CRM-ben” (szerződés-jóváhagyás/e-aláírás, TIG, anyagigény)
     2. Műszaki átadás a megrendelőnek (TIG-előkészítés) — a meglévő lista
  ← Megnyert ügy adatlap (Sales / Owner): „Megnyert → projektátadás” kártya, Sales teendők + „Pótlás helye”
  ← PM Mai projektmunka: „Sales-átadás átvétele” következő teendő
  ← Owner Mai vezetői munka: George-kártya „N hiányos Sales→PM átadás” → George-jelzések átadás-szűrővel
```

- **Egy szabályforrás:** `src/lib/handoff/sales-pm-handoff.ts` (tiszta, írás nélkül). George `handoff:` hiánylistája (`handoffGaps`) ugyanebből jön, azonos szöveggel és sorrenddel → nincs eltérés és nincs duplikált tétel.
- **Tételállapotok:** Rendben / Hiányzik / Ellenőrizendő / NINCS ÖSSZEKÖTVE (Sales-ügy nélküli projekt) / NINCS ADAT (be nem töltött forrás — sosem számít rendben-nek).
- **Fázis:** Tulajdonosi döntésre vár → Sales-pótlásra vár → Projektvezetői pótlásra vár → Átvételre vár → Ellenőrizendő → „Átvételi adatok rendben (a források szerint)” — ez kifejezetten nem ügyfél-elfogadás vagy aláírt szerződés.
- **Szerepkörös következő lépés:** a néző saját hiánya, majd saját ellenőrizendő tétele; különben „X pótlására vár” + „nem a te szerepköröd feladata”.
- **Egyetlen írás:** Alapadatok pótlása a meglévő `useUpsert("projects")` úton, csak a megváltozott cím/határidő; projektvezető csak Tulajdonosnak. `lead_id`/státusz sosem kerül a mentésbe. Hibánál a beírt érték megmarad. Sales/Marketing csak olvas.
- **Kettős adatbevitel megszüntetve:** az átadási jegyzet üresen indul (az összefoglaló automatikusan átkerül); kezdődátum budapesti nap.
- **Megnyert ügy a Sales-nél:** zöld „Megnyert ügy — a munka a projekten folytatódik” sáv + projektátadás-kártya; a következő lépés blokk megnyert ügynél rejtve.
- **Owner:** `atadas` felirat javítva („Sales-átadás átvétele folyamatban”), PM nélküli projekt az Átadás fülre visz; `/settings/ai-review?domain=handoff` mélylink.
- **Navigáció:** szerepkör szerinti vissza-link (Ma / Mai projektmunka / Mai vezetői munka), „Megnyert Sales-ügy” link csak akinek a `/leads` engedélyezett; Átadás fül hiányszámmal.

## 3. Módosított / új fájlok

Új: `src/lib/handoff/sales-pm-handoff.ts`, `project-basics.ts`, `handoff-links.ts`, `sales-pm-handoff.test.ts` (30 teszt), `AGENTS.md`; `src/hooks/use-project-handoff.ts`; `src/components/handoff/handoff-checklist.tsx`, `project-basics-form.tsx`, `lead-handoff-card.tsx`; `scripts/qa/check_handoff.py`.
Módosított: `src/routes/_authenticated/projects.$id.tsx`, `src/components/pipeline/create-project-dialog.tsx`, `pipeline-detail-sheet.tsx`, `src/components/lead-workspace/sales-prep-panel.tsx`, `lead-detail-column.tsx`, `src/lib/pm/pm-day-flow.ts` (+AGENTS), `src/lib/owner/owner-day-flow.ts`, `src/lib/george/org-signals.ts`, `src/components/george/org-signals-panel.tsx`, `src/routes/_authenticated/settings.ai-review.tsx`, `src/components/today/owner-home.tsx`, `src/lib/help-guide.ts`, `roadmap.md`.

## 4. Tesztek

- **1020/1020** Vitest (990 korábbi + 30 új), **21/21** AI acceptance, `tsgo -b --noEmit` PASS, `bun run build` PASS.
- Új tesztek: teljes / hiányos / Sales-ügy nélküli / be nem töltött forrás; 48 órás feladat-türelmi idő; szerződés és elfogadott ajánlat csak „Ellenőrizendő”, sosem jóváhagyás; szerepkörös következő lépés (Sales, PM, Owner, Marketing/nincs szerepkör); George ↔ Átadás fül azonos hiánylista, egy projekt = egy tétel, determinizmus; Megnyertük előnézet; `projectBasicsPatch` (csak változott mező, nincs lead_id/státusz, hibás dátum és üres PM kizárva); **negatív jogosultság:** Sales/Marketing nem pótol, PM nem cserél projektvezetőt, Marketing nem nyit projektet; PM `handoff_intake`; Owner felirat/fül; forrásszintű biztonsági határ (szabálymodul nem ír, olvasó csak SELECT admin kliens/AI nélkül, űrlap csak `useUpsert("projects")`, Megnyertük ablak kizárólag a meglévő RPC).
- **Izolált böngészőpróba** (`scripts/qa/check_handoff.py <role>`; kitalált TESZT-sorok, minden írás és a megnyerési RPC 403-mal blokkolva, nem valódi RLS):
  - PM, Owner, Sales × 1280 és 390 px: 11 tétel helyes állapottal, fázis, „Nincs a CRM-ben”, TIG-szakasz, átadott összefoglaló, 0 vízszintes túlcsordulás, 0 oldalhiba.
  - Alapadat-űrlap: PM és Owner szerkeszt, csak Owner választ PM-et, Sales csak olvas. Letiltott mentés: egyetlen PATCH `{"address":"TESZT utca 9."}` → hibaüzenet, érték megmaradt.
  - Sales-ügy nélküli projekt: lead/összefoglaló/ajánlat NINCS ÖSSZEKÖTVE.
  - Megnyert ügy (Sales, Owner): kártya, Sales-teendők, linkek a projekt `quotes/contacts/docs/handover` füleire.
  - Megnyertük ablak: előnézet (összefoglaló/forrás/ajánlat/utánkövetés automatikus, kapcsolattartó hiányzik, PM-mezők később), jegyzet üres; nem küldtük be.
  - PM Mai projektmunka: „Sales-átadás átvétele” teendő. Owner 4. csomag próbája újrafuttatva: változatlanul PASS.
  - Sales nézetben a meglévő napi briefing szerverfüggvénye meghívódott (izoláltan 503) — korábbi, nem e csomagban bevezetett viselkedés.
- **NEM TESZTELT:** bejelentkezett Sales/PM/Owner végigpróba éles adattal és valódi RLS-sel; valódi mentés visszaolvasása.

## 5. Commit, diff, rollback

Commit: `e7f0aa0` (25 fájl, +1360 / −56). Diff: `git show --stat e7f0aa0`. Visszavonás: `git revert e7f0aa0` — csak kód változott, adat-visszaállítás nem kell (a csomag nem írt éles adatot).

## 6. Megmaradt hiányok / külön döntés

1. Szerződés-jóváhagyási adatmodell és e-aláírás (most: csak feltöltött „Szerződés” fájl látszik, „Ellenőrizendő”).
2. TIG-adatmodell, anyagigény-nyilvántartás.
3. Megnyeréskor cím/határidő bekérése az RPC-ben — RPC-módosítás, jóváhagyás kell; most a PM pótolja.
4. Utólagos Sales-összefoglaló javítás: `handoff_payload` nem szerkeszthető (helyesen) — kiegészítés projektjegyzetben.
5. Tétel-szintű „átvettem / elfogadva” döntésnapló — új tábla + RLS kell.
6. `v_sales_user_load` a PM-választóban: ugyanaz a forrás, mint a megnyerésnél; az RPC szerepkör-ellenőrzése a közvetlen projektmentésnél nem fut, ezért a választás csak Tulajdonosé.

Következő nagy csomag javaslata: **Owner / George döntésnapló adatmodelljének jóváhagyásos terve** (tétel-szintű elfogadva/elvetve/felelősre bízva) és a szerződés-jóváhagyási adatmodell hatáselemzése — nem kezdtem el.
