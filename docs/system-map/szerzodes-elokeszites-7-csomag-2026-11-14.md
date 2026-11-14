# 7. nagy csomag — Sales ajánlat → szerződés-előkészítés → tulajdonosi döntés-előkészítés → PM átadás (2026-11-14)

Állapot: **KÓD KÉSZ, izolált TESZT-próbával ellenőrizve. Bejelentkezett Sales / Owner / PM végigpróba éles adattal és valódi RLS-sel: NEM TESZTELT** (a projekt `external_unmanaged`, böngészős munkamenet nem injektálható).
Nem változott: DB-séma, migráció, RLS, trigger, edge/szerverfüggvény, jogosultság, titok, külső integráció, ütemezés, költségkeret, AI-eszköz. Nem volt éles adatírás, e-mail-küldés, publikálás vagy fizetős AI-hívás. A 6. csomagot (e7f0aa0) nem duplikálja, hanem kiegészíti.

## 1. Audit (read-only) — tényleges állapot a csomag előtt

| Terület | Állapot | Forrás |
|---|---|---|
| Szerződés szakasz | VALÓS lead-státusz `contract`; átmenet `quote_sent`/`follow_up` → `contract` (STATUS_TRANSITIONS) | leads, constants.ts |
| Megnyerés | VALÓS, atomi `sales_mark_won_with_project` (változatlan) | RPC |
| Elfogadott ajánlat | VALÓS `quotes.status = accepted`; nincs „melyik a szerződés alapja” jelölés | quotes |
| Ajánlati feltételek | VALÓS `quotes.template_terms` (payment / warranty / schedule kulcsok) és `quote_documents.document_type = contract_terms` | quotes, quote_documents |
| Szerződésfájl | VALÓS `project_documents.document_type = contract` (csak megnyerés után, projekthez) | project_documents |
| Fájlhozzáférés | VALÓS `r2PresignDownload`: csak a hívó RLS-e szerint látható rekord kulcsára ad 5 perces linket | r2.functions.ts |
| Megrendelő | `companies`: név, `company_type` (köztük `maganszemely`), `tax_number`; **nincs cím/székhely mező** | companies |
| Kapcsolattartó | `contacts`: név, e-mail, `email_invalid` | contacts |
| Szerződés-nyilvántartás, jóváhagyás, döntésnapló, e-aláírás | **NINCS** (sem tábla, sem RPC, sem integráció) | — |
| Szabályforrások | **3 párhuzamos**: `contractReadiness` (Pipeline, 6 tétel), `contractPrepWarnings` (Owner, 5 szöveg), átadási lista `accepted`/`contract_doc` tételei | sales-flow.ts, owner-day-flow.ts, sales-pm-handoff.ts |
| Elfogadott ajánlat 4. lépése | statikus szöveg + Pipeline-link (PM-nek is megjelent a szöveg, link nélkül) | quotes.$id.tsx |
| Projekt Átadás fül | szerződésfájl csak darabszámként; a fájl innen nem nyitható | projects.$id.tsx |

Éles pillanatkép (read-only SQL, 2026-11-14 ~04:10 UTC): leadek 1 quote_prep, 2 follow_up, 1 new, 2 lost, 4 won, **0 contract**; aktuális ajánlatok 5 draft, 2 sent, 1 negotiation, **0 accepted**; ajánlat-dokumentum 2 priced_budget, 3 unpriced_budget, **0 contract_terms**; projekt-dokumentum 10 quote, 15 other, **0 contract**; 8 aktuális ajánlaton van `template_terms`; a 4 megnyert ügy közül 1 ügyfélnek van adószáma. Várható kép élesben: a 4 megnyert projektnél „Elfogadott ajánlatverzió: Hiányzik”, a függő tételek NINCS ADAT, szerződésfájl „Ellenőrizendő”.

## 2. Megvalósított munkafolyamat

```text
Ajánlat „Elfogadott” → 4. Utánkövetés: rövid szerződés-állapot + link a teljes listára (Pipeline / projekt Átadás)
  → Pipeline adatlap (Szerződés szakasz vagy elfogadott ajánlat): teljes 12 tételes Szerződés-előkészítés
     + szerződés-/feltételfájlok (Megnyitás jogosultság szerint) + Tulajdonosi döntés-előkészítés + „Nincs a CRM-ben”
  → Megnyertük (változatlan RPC) → projekt Átadás fül
     1. Sales → PM átvétel (6. csomag)   2. Szerződés-előkészítés és szerződésfájlok (ÚJ, átfedés nélkül)   3. Műszaki átadás (TIG)
  ← Megnyert ügy kártyája: rövid szerződés-állapot + link az Átadás fülre
  ← Mai vezetői munka · Ajánlat és szerződés: figyelmeztetések ugyanabból a modellből (+ több elfogadott verzió)
```

- **Egy szabályforrás:** `src/lib/contract/contract-prep.ts` (tiszta, írás nélkül). A Pipeline régi `contractReadiness` listáját lecseréli; az Owner `contractPrepWarnings` mostantól ebből számol, a korábbi szövegekkel és sorrenddel.
- **12 tétel:** Ügy szakasza · Felelős Sales (Tulajdonos) · Megrendelő (cég/magánszemély) · Adószám ill. magánszemélyes adatok (NINCS ADAT) · Kapcsolattartó (e-mail / hibás cím) · Elfogadott ajánlatverzió · Igazolt kiküldés · Nettó összeg (tételes/megadott, eltérés) · Érvényesség (budapesti nap) · Helyszín (ajánlat vagy projekt) · Szerződési/fizetési feltételek (sablon `payment` vagy feltétel-fájl az elfogadott verzión) · Szerződésfájl a projektnél.
- **Állapotok:** Rendben / Hiányzik / Ellenőrizendő / NINCS ÖSSZEKÖTVE / NINCS ADAT. Be nem tölthető vagy RLS által rejtett forrás és elfogadott verzió nélküli függő tétel = NINCS ADAT, sosem rendben.
- **Fázis:** Tulajdonosi döntésre vár → Sales-pótlásra vár → Projektvezetői pótlásra vár → Nem ellenőrizhető → Ellenőrizendő → „Előkészítve a források szerint (nem jóváhagyás)”. Nincs „jóváhagyva” vagy „aláírva” állapot.
- **Tulajdonosi döntés-előkészítés** (`ownerDecisionPrep`): felelős Sales hiánya, több elfogadott aktuális verzió („melyik a szerződés alapja — a CRM nem dönt”), PM hiánya (átadási listából) — témánként egyszer. Csak előkészítés: nem rögzít döntést.
- **Duplikációmentesség:** az Átadás fülön a Sales→PM listában már szereplő kapcsolattartó, elfogadott verzió és szerződésfájl a szerződés-szakaszban nem ismétlődik (`contractItemsBesideHandoff`); a Mai vezetői munka egy ügyet továbbra is egyszer mutat.
- **Szerződésdokumentum elérése:** a valóban feltöltött `Szerződés` (projekt) és `Szerződési / fizetési feltételek` (ajánlat) fájlok listázva, Megnyitás a meglévő `r2PresignDownload` úton (szerveroldali RLS-ellenőrzés). Törlés innen nem érhető el.
- **Navigáció jogosultság szerint** (`contractTargetLink` + meglévő `canAccessRoute`): PM nem kap Pipeline-/Leadek-linket, Marketing nem kap ajánlat-/projektlinket; a következő lépés szerepkör szerint (saját hiány → saját döntés → más hiánya „nem a te szerepköröd” / Tulajdonosnál „Felelős: …”).
- **Mobil:** egyoszlopos tételek, ikon a címsorban, 390 px-en nincs vízszintes túlcsordulás; „Nincs a CRM-ben” összecsukva.

## 3. Módosított / új fájlok

Új: `src/lib/contract/contract-prep.ts`, `contract-prep-loader.ts`, `contract-prep.test.ts` (30 teszt), `AGENTS.md`; `src/hooks/use-contract-prep.ts`; `src/components/contract/contract-prep-panel.tsx`; `scripts/qa/check_contract_prep.py`; ez a jelentés.
Módosított: `src/components/pipeline/pipeline-detail-sheet.tsx` (régi lista + feltétel-dokumentum lekérdezés helyett közös panel), `src/routes/_authenticated/quotes.$id.tsx` (elfogadott ajánlat rövid állapota), `src/components/handoff/lead-handoff-card.tsx` (megnyert ügy kártya), `src/routes/_authenticated/projects.$id.tsx` (Átadás fül 2. szakasz, TIG → 3.), `src/lib/owner/owner-day-flow.ts` (figyelmeztetések a közös modellből, pontosított sorszöveg), `src/lib/help-guide.ts`, `roadmap.md`.

## 4. Tesztek — parancsok és tényleges eredmény

- `bunx vitest run` → **97 fájl, 1050/1050 PASS** (1020 korábbi + 30 új).
- `bun run ai:acceptance` → **AI OS Acceptance — OK, agents=5, scenarios=21, errors=0**.
- `tsgo -b --noEmit` → **PASS** (0 hiba). `bunx vite build --outDir /tmp/build-check` → **PASS** (kimenet a verziókezelésen kívül).
- Új tesztek: teljes / megnyerés előtti / hiányzó ügyfél / RLS-rejtett lead / be nem tölthető ajánlat / nincs elfogadott verzió / nem aktuális elfogadott / magánszemély-adószám-típus / kapcsolattartó e-mail / összeg-eltérés / érvényesség budapesti nap / feltételek (sablon, fájl, másik ajánlat fájlja, NINCS ADAT) / projekt NINCS ADAT / Sales-ügy nélküli projekt / nem releváns szakasz; tulajdonosi döntés (felelős, több verzió), témánkénti deduplikáció és determinizmus, Átadás fülön nincs kétszer szereplő tétel, Owner-figyelmeztetés a közös modellből; **negatív jogosultság** (PM Pipeline/Leadek, Marketing ajánlat/projekt link nincs), szerepkörös következő lépés; betöltő hamis klienssel (csak select, nincs insert/update/delete/upsert/rpc; hiba → NINCS ADAT); forrásszintű határ (nincs írás/admin kliens, csak `r2PresignDownload`, nincs „Jóváhagyva/Aláírom” felirat, a megnyerés változatlanul a `CreateProjectDialog`).
- **Izolált böngészőpróba** (`python3 scripts/qa/check_contract_prep.py sales|owner|project_manager`; kitalált TESZT-sorok, minden REST-írás és RPC 403, szerverfüggvények 503 — nem valódi RLS):
  - Projekt Átadás fül 1280 és 390 px, mindhárom szerepkör: 2. és 3. szakasz megvan; 8 szerződés-tétel (adószám Hiányzik, lejárt érvényesség és helyszín Ellenőrizendő), **0 átfedő kulcs** az átadási listával; 1 szerződésfájl; nincs „Jóváhagyva/Aláírva” szöveg; 0 túlcsordulás.
  - Fájl Megnyitás: a meglévő `r2PresignDownload` hívódott (izoláltan 503). A hibaértesítés az izolált keretben nem látszott (az értesítő-keret nincs betöltve) — NEM TESZTELT.
  - Pipeline adatlap (Sales, Owner × 1280/390): 12 tétel, „Sales-pótlásra vár”, linkek: Ügyfél adatlap, Kapcsolattartó; 0 túlcsordulás.
  - Megnyert ügy kártya (Sales, Owner) és elfogadott ajánlat 4. lépése (Sales, Owner, PM): rövid állapot; PM-nél **nincs** Pipeline-link, Owner-nél „Felelős: Sales”, PM-nél „nem a te szerepköröd”.
  - Írási kísérlet: **0** mindhárom szerepkörben; oldalhiba: 0.
- **NEM TESZTELT:** bejelentkezett Sales/Owner/PM végigpróba éles adattal és valódi RLS-sel; valódi fájlmegnyitás R2-ből; a Megnyertük végigvitele.

## 5. Commit, diff, rollback

Commit: `f97312f` (15 fájl, +1271 / −45). Diff: `git show --stat f97312f`. Visszavonás: `git revert f97312f` — csak kód változott, adat-visszaállítás nem kell.

## 6. Megmaradt hiányok

1. Szerződés-nyilvántartás, tulajdonosi jóváhagyás, döntésnapló, e-aláírás — nincs; terv lent (7. pont), NEM élesítve.
2. Megrendelő székhely/számlázási cím és magánszemélyes szerződéses adatok — nincs mező (NINCS ADAT).
3. „Melyik elfogadott verzió a szerződés alapja” jelölés — nincs adat; most tulajdonosi döntésként jelezzük.
4. Ajánlat munkaterület (4. Utánkövetés) nem linkelhető közvetlenül; a link az ajánlat adatlapjára visz.
5. Owner Mai vezetői munka cég-/kapcsolattartó-rekordot nem tölt be, ezért ott csak a hiányzó ID számít hiánynak; a teljes lista a Pipeline adatlapon.
6. A 6. csomag nyitott pontjai (TIG, anyagigény, cím/határidő a megnyeréskor) változatlanul nyitottak.

## 7. Döntési terv — szerződés- és jóváhagyási adatmodell (NEM ÉLESÍTVE, jóváhagyásra vár)

**Cél:** valós szerződés-rekord és bizonyítható tulajdonosi döntés, gombnyomásos „jóváhagyás” nélkül: a döntés csak akkor érvényes, ha konkrét, rögzített forrásverzióra (elfogadott ajánlatverzió + feltöltött szerződésfájl SHA-256) vonatkozik.

**Táblák (tervezet):**
- `contracts`: id, lead_id (NOT NULL), project_id (NULL megnyerés előtt), quote_id (elfogadott verzió, NOT NULL), company_id, contract_number (egyedi), status (`draft` | `ready_for_owner` | `owner_approved` | `owner_rejected` | `sent_for_signature` | `signed` | `cancelled`), net_amount_snapshot, terms_snapshot jsonb, document_id (project/quote document), document_sha256, created_by, created_at, updated_at, revision uuid.
- `contract_events` (csak hozzáfűzhető napló): id, contract_id, event (`created` | `submitted` | `approved` | `rejected` | `signature_requested` | `signed_uploaded` | `cancelled`), actor_auth_id, actor_role, from_status, to_status, evidence jsonb (quote verzió, dokumentum hash, megjegyzés), idempotency_key (egyedi), created_at. UPDATE/DELETE tiltva triggerrel.
- E-aláírás külön, később: `contract_signatures` (provider, envelope_id, signer, signed_at, evidence_hash) — csak választott szolgáltató és titok után.

**Jogosultság:** olvasás — Owner minden; Sales csak saját felelősségű lead (`assigned_to`), PM csak saját projekt; Marketing semmi. Létrehozás/beküldés — Owner vagy a lead felelős Salese, csak `contract` szakaszú vagy megnyert ügyre. Döntés (`approved`/`rejected`) — **kizárólag Owner**, SECURITY INVOKER RPC-n, `has_role` + revision + idempotency kulccsal; Sales nem hagyhat jóvá, PM nem írhat alá. `signed` csak feltöltött aláírt fájl hash-ével.

**Biztonság / visszaellenőrzés:** minden állapotváltás egy RPC-n (`contract_transition`), előző revision-nel (versenyhelyzet ellen); a döntés a beküldéskori quote verzió + dokumentum hash-re vonatkozik — ha bármelyik változik, a döntés érvénytelen, új beküldés kell; readback a felületen az RPC visszatérési sorából; értesítés a meglévő `crm_notify`-on.

**Migráció-tervezet (csak dokumentáció, NEM futtatva):**
```sql
-- 1) CREATE TABLE public.contracts (...); public.contract_events (...);
-- 2) GRANT SELECT ON public.contracts, public.contract_events TO authenticated; GRANT ALL ... TO service_role;
-- 3) ALTER TABLE ... ENABLE ROW LEVEL SECURITY;
-- 4) CREATE POLICY contracts_select ... USING (is_owner_role(auth.uid()) OR lead assigned_to = auth.uid() OR project PM = auth.uid());
--    írási policy NINCS — írás csak contract_transition() RPC-n;
-- 5) contract_events: append-only guard trigger; unique(idempotency_key);
-- 6) contract_transition(p_contract, p_to, p_expected_revision, p_evidence, p_idempotency) RETURNS jsonb SECURITY INVOKER.
-- Rollback: DROP FUNCTION contract_transition; DROP TABLE contract_events, contracts (adat nélkül, első bevezetéskor).
```

**Elfogadási tesztek (élesítés előtt):** Sales `approved` kísérlet → elutasítva; PM `signed` kísérlet → elutasítva; Owner döntés elavult revision-nel → elutasítva; azonos idempotency kulcs → egy esemény; ajánlat új verziója után a korábbi döntés érvénytelen; esemény UPDATE/DELETE → elutasítva; Marketing SELECT → 0 sor; anon → 0 sor; felület: „jóváhagyva” csak sikeres RPC-readback után látszik.

**Engedélyköteles döntések:** (a) a fenti séma/RLS/RPC migráció; (b) „szerződés alapja” verziójelölés; (c) cégcím és magánszemélyes adatmezők felvétele (adatvédelmi hatásvizsgálat kell); (d) e-aláírás-szolgáltató és titok; (e) a cím/határidő bekérése a megnyeréskor (RPC-módosítás).
