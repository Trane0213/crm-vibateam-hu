# VIBA CRM — 5. nagy csomag: George központi szervezeti agy, biztonságos 1. ütem (2026-11-14)

**Eredmény:** George élő, forrásalapú szervezeti jelzései elkészültek a meglévő AI-felülvizsgálati oldalon és a tulajdonosi kezdőlap George-kártyáján. **0 AI-hívás, 0 adatírás, admin kliens nélkül, csak Tulajdonos.** Bejelentkezett Owner végigpróba éles adattal: **NEM TESZTELT** (külső Supabase, `external_unmanaged` — nincs biztonságos böngészős session).

## 0. Forrásdokumentumok eltérése
A `VIBA_CRM_AI_UTANI_FEJLESZTESI_IGENYEK_2026-11-13.md` és a `VIBA_GEORGE_KOZPONTI_AGY_PONTOSITOTT_FEJLESZTESI_BRIEF_2026-11-13.md` **nincs a repóban** (keresés: 0 találat). A követelményeket a megbízás szövegéből és a meglévő `docs/system-map` jelentésekből (AI OS 2.0 0–10. szakasz, Sales/Marketing/PM/Owner csomag) valósítottam meg.

## 1. Read-only audit — mátrix
Adatpillanatkép read-only SQL-lel, 2026-11-14 ~02:10 UTC.

| Terület | Állapot | Bizonyíték |
|---|---|---|
| AI OS agentek (George, Scarlet, Timothy, Boss, Michael), `gpt-6-astra`/high | VALÓS | `agent_runs` 947 (george 19, timothy 140, sales_briefing 717, michael 55, scarlet 2, boss 1); 21/21 acceptance |
| AI-jóváhagyások (P0, `agent_run_steps`) | VALÓS (kód), éles függő jóváhagyás 0 | 1563 lépés, egyik sem `pending` |
| Hibaközpont `issue_reports` + beküldés | VALÓS | 1 TESZT-bejelentés (`/help`, bug, új, AI-vizsgálat nélkül) |
| George-vizsgálat (`issue_report_findings`) | CSAK KÓD-SZINTEN élesben | 0 sor — éles George-vizsgálat még nem tárolódott; fizetős |
| Óránkénti AI nélküli gyűjtő (`ai_review_collect`, cron `ai-review-hourly`) | CSAK KÓD-SZINTEN / ENGEDÉLYKÖTELES | cron óránként fut, de `enabled=false` → `disabled`; `ai_review_runs` 0, `ai_review_signals` 0 |
| Fizetős George célzott vizsgálat (`runReviewCycle`) | ENGEDÉLYKÖTELES | napi keret-jóváhagyás nélkül nem fut |
| Értesítési központ (`crm_notifications`) | VALÓS | 29 nyitott (28 dokumentum-info, 1 bejelentés-warning döntést igényel) |
| Tulajdonosi George-jelentés (`ai_owner_reports`) | VALÓS | 4 kész jelentés (3 napi, 1 heti) |
| Sales→PM átadás (`sales_mark_won_with_project`, `handoff_payload`) | VALÓS | 4 megnyert ügy → 4 projekt, mind PM-mel és átadási adattal |
| Átadás utáni adatminőség | VALÓS HIÁNYOK | 4/4 projektben 0 feladat (átadás >48 óra), 4/4 cím és határidő nélkül, 1 kapcsolattartó nélkül, 1 ajánlat nélkül, 1 nagyon rövid összefoglaló |
| Lejárt / hiányos Sales-ügyek | VALÓS | 2 lejárt következő lépés, 1 következő lépés nélkül, 0 felelős nélkül, 0 lejárt utánkövetés |
| Igazolt küldés nélküli „kiküldött” ajánlat | VALÓS szabály, 0 eset | `quotes.status=sent` bizonyíték nélkül: 0 |
| Dokumentumfeldolgozás | VALÓS | 2 hiba, 28 ellenőrzést igényel (OCR kikapcsolva) |
| Import-döntések | VALÓS | 14 bizonytalan cég, 39 vitatott szál, 21 hibás cím, 11 projektjelölt |
| AI-beszélgetések | VALÓS (böngésző-helyi) | `ai_threads` 56, `ai_messages` 0 — az üzenetek a böngészőben (localStorage) vannak, George nem olvassa |
| Jelenlét ↔ CRM-projekt | HIÁNYZIK (NINCS ADAT) | 3 jelenléti projekt, mentett kapcsolat nincs |
| TIG / teljesítésigazolás, anyagigény | HIÁNYZIK (NINCS ADAT) | nincs adatmodell |
| Szerződés-jóváhagyás / e-aláírás | HIÁNYZIK (NINCS ADAT) | nincs adatmodell |
| Számla / bank / Billingo | HIÁNYZIK (NINCS ADAT) | nincs kapcsolat — pénzügyi állítás nincs |
| Webes ajánlatkérések | VALÓS, de csak admin útvonalon | ez a nézet nem olvassa (nincs admin kliens); George-jelentés tényei mutatják |
| Bejelentkezett Owner/Sales/PM UI | NEM TESZTELT | `external_unmanaged` |

## 2. Megvalósított George-munkafolyamat
`src/lib/george/org-signals.ts` (tiszta logika) + `org-signals.server.ts` (olvasás) + `org-signals.functions.ts` (`georgeOrgSignals`, GET).

**Rekordonként egy tétel, determinisztikus kulccsal**:
- `handoff:<projekt>` — hiányos Sales→PM átadás / projekt-alapadat: nincs PM (→ Tulajdonos), 48 órán túl nincs feladat, nincs cím, határidő, kapcsolattartó, kötött ajánlat, rövid összefoglaló (<20 karakter). `handoff_missing:<ügy>` — megnyert ügy látható projekt nélkül (súlyos).
- `lead:<ügy>` — lejárt / hiányzó következő lépés, felelős nélküli ügy (→ Tulajdonos, mert csak ő ad felelőst), lejárt utánkövetés — egy tételben.
- `project_due:<projekt>` — lejárt feladatok + lejárt határidő + lejárt projekt-utánkövetés; `task:<id>` projekt nélküli feladat.
- `quote_unproven:<ajánlat>` — „kiküldött” ajánlat sikeres küldési napló nélkül (súlyos; a szöveg kimondja: nem bizonyítja, hogy nem ment ki).
- `complaint:<oldal azonosító nélkül>:<kategória>` — azonos képernyőre érkező bejelentések összevonva („Ismétlődő …”); `ai_issue:<id>` — automatikus AI-hibajegy külön.
- `notice:<id>` — döntést igénylő / súlyos értesítés, ha nem kapcsolható meglévő tételhez.
- `document:<id>`, `documents:needs_review` — dokumentumfeldolgozás; `import:<típus>` — import-döntések összesítve.
- `signal:<kulcs>` — automatikus jelzéstábla eleme, ha nincs élő párja.

**Deduplikáció:** lejárt utánkövetés, kapcsolódó értesítés és `ai_review_signals` sor a meglévő tételbe olvad (forrásként + észlelésszám). Leképezhető, de élőben már nem fennálló jelzés: „Ellenőrizendő — megszűnt”, nem duplikált.

**Bizonyíték-osztályok (külön címkével):** Tény (forrásrekord igazolja) · Automatikus észlelés — gyanú · Dolgozói jelzés — nem igazolt · Javítandó hiba (tulajdonosi besorolás: `awaiting_fix`/`checking` vagy bejelentői visszaigazolás) · AI-feltételezés — forrás nélkül. AI-vizsgálat csak megjegyzés, panaszt nem emel bizonyított hibává.

**Állapot:** Nyitott / Ellenőrizendő / Lezárt — kizárólag a forrásrekordok állapotából; nincs új státusztábla. Lezárt bejelentés 30, megszűnt jelzés 14 napig látszik.

**Minden tételnél:** felelős szerepkör (+ név, ha látható), következő konkrét teendő, ellenőrzési/tesztjavaslat, forráslista rekord-azonosítóval és valódi CRM-linkkel (projekt Átadás/Feladatok fül, ügy, ajánlat, `/help?issue=`, Adatellenőrzés, Knowledge Graph).

**Forráslefedettség:** forrásonként betöltve / részleges (levágás jelölve, max. 2000 sor) / hiba; gyűjtő állapota (most KIKAPCSOLVA); NINCS ADAT lista.

### Beépítés
- **Beállítások → AI-felülvizsgálat:** felső „George szervezeti jelzései — élő forrásellenőrzés” kártya (`#george-jelzesek`), állapot- és területszűrő, Frissítés. A régi jelzéslista címe pontosítva: „Jelzéstábla … (óránkénti, AI nélküli gyűjtő)”. Az oldal hiba esetén is mutatja a George-kártyát.
- **Mai vezetői munka → George-kártya:** „Szervezeti jelzések: X nyitott, Y ellenőrizendő, Z súlyos · ebből N hiányos Sales→PM átadás”; gomb: Szervezeti jelzések.
- **Hibaközpont mélylink:** `/help?issue=<uuid>` — a jegy nyitva, kiemelve, görgetve; ha nincs az oldalon, kiírja.
- **Tulajdonosi súgó:** új lépés „George szervezeti jelzései”.

### Várható éles kép (read-only SQL alapján, NEM bejelentkezett mérés)
15 tétel: 9 nyitott (4 hiányos átadás, 3 Sales-ügy, 2 dokumentumhiba), 6 ellenőrizendő (1 TESZT-bejelentés a hozzá tartozó értesítéssel összevonva, 4 import-típus, 1 dokumentum-összesítő), 0 súlyos.

## 3. Biztonság, jogosultság, idempotencia — bizonyítás
- Tulajdonos-only: `is_owner_role` a hívó kliensével; nem Tulajdonos → elutasítás **egyetlen táblaolvasás előtt** (teszt).
- Csak SELECT, a hívó RLS-kliensével; teszt ellenőrzi: nincs insert/update/upsert/delete, egyetlen RPC az `is_owner_role`; a modulok forrásában nincs `client.server`/`supabaseAdmin`/AI-hívás (teszt).
- Idempotencia: determinisztikus kulcsok; azonos bemenet → azonos kimenet; megfordított bemeneti sorrend → azonos kimenet; kulcsok egyediek (tesztek). A GET-hívásnak nincs mellékhatása, ismételt betöltés azonos (teszt).
- Részleges forrás és hibás forrás jelölve, a többi forrás betöltődik (teszt).
- Nem változott: DB-séma, RLS, trigger, cron, jogosultság, titok, költségkeret, AI-eszközök, Sales/Marketing/PM üzleti logika, küldés, publikálás.

## 4. Tesztek és ellenőrzés
- Új: `src/lib/george/org-signals.test.ts` (30), `org-signals.server.test.ts` (6) = **36 új teszt**.
- Teljes Vitest: **990/990** (954 korábbi + 36). AI acceptance: **21/21**, 0 hiba. `tsgo -b --noEmit`: PASS. `bun run build`: PASS.
- Izolált böngészőpróba (`scripts/qa/check_george_signals.py` + `george-fixture.ts`): kitalált TESZT-sorokból a **valódi** `buildOrgSignals` kimenete, minden írás 403-mal blokkolva, nem éles munkamenet, nem valódi RLS. 1280 px és 390 px: 9/9 tétel helyes sorrendben, összesítő, címkék, nevek, 9 „Következő teendő”, szűrő, összevont tétel 3 forrással (3×), linkek (Átadás fül, ajánlat, `/help?issue=`, Adatellenőrzés), NINCS ADAT + gyűjtő KIKAPCSOLVA, `/help?issue=` nyitott jegy, George-kártya sor; 0 vízszintes túlcsordulás, 0 oldalhiba, **0 írási kísérlet**, csak 4 olvasó szerverfüggvény.
- **NEM TESZTELT:** bejelentkezett Owner (és Sales/PM) végigpróba éles adattal.

## 5. Módosított fájlok
Új: `src/lib/george/org-signals.ts`, `org-signals.server.ts`, `org-signals.functions.ts`, `org-signals.test.ts`, `org-signals.server.test.ts`, `AGENTS.md`; `src/components/george/org-signals-panel.tsx`; `scripts/qa/check_george_signals.py`, `scripts/qa/george-fixture.ts`; ez a jelentés.
Módosított: `src/routes/_authenticated/settings.ai-review.tsx`, `src/components/today/owner-home.tsx`, `src/components/help/issue-center.tsx`, `src/routes/_authenticated/help.index.tsx`, `src/lib/help-guide.ts`, `roadmap.md`.

## 6. Commit és rollback
Commit: lásd a git naplóban az „5. csomag: George szervezeti jelzések” üzenetet (a hash a csomag utáni dokumentációs commitban). Visszavonás: `git revert <hash>` — csak kódot érint, adat- vagy sémaváltozás nincs, így adat-visszaállítás nem szükséges.

## 7. Blokkolók (külön emberi jóváhagyás kell)
1. Óránkénti AI nélküli gyűjtő bekapcsolása (napi keret-jóváhagyás) — enélkül a jelzéstábla üres marad; az élő nézet ezt pótolja megtekintéskor.
2. Fizetős George célzott vizsgálat / OCR — költségdöntés.
3. Tétel-szintű „elfogadva / elvetve / felelősre bízva” tárolás és szerepkörös (Sales/PM) George-nézet — új adatmodell + RLS.
4. Jelenlét↔projekt kapcsolat, TIG, anyagigény, szerződés-jóváhagyás, pénzügyi kapcsolat — adatmodell-döntés.
5. Bejelentkezett végigpróba — a tulajdonos saját belépése szükséges.
Megjegyzés: a meglévő hibaközpont beküldéskor automatikusan George-vizsgálatot indít (fizetős) — korábbi, változatlan működés; módosításához tulajdonosi döntés kell.

## 8. Következő legnagyobb üzleti értékű csomag
**Sales→PM átadás minőségének lezárása a forrásnál:** a 4 éles projekt hiányainak (cím, határidő, feladatok, kapcsolattartó) pótlását segítő meglévő-útvonalas PM/Sales felület (Átadás fül kötelező-elem jelzés, Pipeline „Megnyert” lépésben a hiányzó mezők előzetes ellenőrzése) — séma nélkül; utána a tétel-szintű döntésnapló adatmodelljének jóváhagyásos terve.
