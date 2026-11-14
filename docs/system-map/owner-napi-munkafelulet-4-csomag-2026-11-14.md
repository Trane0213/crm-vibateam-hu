# Tulajdonosi (Owner) napi munkafelület — 4. nagy csomag

Dátum: 2026-11-14 (UTC). Előzmény: PM 3. csomag `057a034` (935 unit, 21 AI acceptance). Állapot: **KÓD KÉSZ, RÉSZBEN KÉSZ** (commit `0b0e80d`) — bejelentkezett Owner/Sales/PM végigpróba **NEM TESZTELT** (`external_unmanaged`: a sandbox nem tud valódi munkamenetet létrehozni).

## 1. Felmérés (read-only, a módosítás előtt)

| Terület | Tény |
|---|---|
| Útvonalak | `/today` → `OwnerHome` (owner; a `default` ág elérhetetlen, mert szerepkör nélkül `marketing` jár); `/dashboard` (csak owner, `OwnerWorkspace detail`); `/owner-report` (George napi/heti, `ownerReportOverview` = AI nélküli tények + `ownerReportGenerate` = fizetős, megerősítéssel); `/notifications`; `/settings/ai-review`; `/help`, `/help/owner` |
| Régi Owner kezdőlap | KPI-sáv + `OwnerWorkspace` (Sales-állomány %-sávok, ügyfélkör-kördiagram, „Döntést igénylő ügyek” max 3 projekt + 3 lejárt feladat, folyamatsorok, csapat-prioritás) + összecsukott AI-briefing. Hiányok: nem volt prioritásos napi lista; a lejárt feladat az általános `/tasks` listára vitt; értesítés, hibajegy, AI-jelzés, Szerződés szakasz, elfogadott ajánlat, saját AI-jóváhagyás nem látszott; nem volt jelezve, hogy számla/bank adat nincs; az összecsukott AI-briefing **a `<details>` bezárt állapotában is betöltődött**, így minden napi első látogatás AI-hívást indított |
| Valós adatforrások | `buildOwnerFacts` (crm_notifications, issue_reports, leads/followups/tasks lejárt, quote_sends, quote_requests csak azonosító/típus/dátum, knowledge_documents, ai_review_signals, agent_runs); projects, tasks, leads, quotes (+quote_items count), `agent_run_steps.approval_status` (RLS: csak saját futás), `users_profile_lookup` |
| RLS (változatlan) | quotes/quote_sends: `can_access_quote`; issue_reports: saját vagy owner; ai_review_signals, ai_owner_reports: owner; crm_notifications: címzett + forrásrekord láthatóság; agent_run_steps: saját futás |
| Éles darabszám (csak olvasva, 2026-11-14 00:58 UTC) | Szerződés szakaszú lead 0; quote_sent/follow_up 2; lejárt következő lépés 2; ready ajánlat 0; sent/negotiation 3; accepted 0; nyitott hibajegy 1; nyitott AI-jelzés 0; azonnali értesítés 1; függő AI-jóváhagyás 0; projekt 4; nyitott feladat 0; George-koordinátor megállapítás 0; owner-jelentés 4 |
| Nincs adatmodell | számla, befizetés, bank, Billingo; szerződés-jóváhagyás, e-aláírás (Sales `ESIGN_AVAILABLE=false`) |

## 2. Mi készült (képernyőnként)

| Képernyő | Változás |
|---|---|
| **Mai vezetői munka** (`/today`, Owner) | **Most ezzel kezdj** kártya (a lista első tétele, forrás, felelős, figyelmeztetések, egy gomb a rekordhoz, „+N további”); **George — jelentés és vizsgálatok** kártya (legutóbbi napi jelentés ideje, „nem mai”, „a tények azóta változtak/nem változtak” a meglévő hash alapján; saját függő AI-műveletek száma; George jelentése / AI-felülvizsgálat / Kérdés George-nak; kimondja: George csak olvas, nem hajt végre, új jelentés/vizsgálat fizetős és megerősítéses); **hat sávos munkafolyamat** (Döntés → Ajánlat, szerződés → Projektek → Elmaradt → Dolgozók → AI-jelzések), a sáv a listát szűri, mélylink `?lane=`; **Mai teendők prioritás szerint** szűrőgombokkal, soronként forrás, felelős, idő, figyelmeztetés, rekordgomb; csonkolt tényszakasznál „Részleges: x/y” + link a teljes Tényekhez; **Ma történt** (megnyert, elveszett, igazoltan kiküldött ajánlat, új webes kérés); **Követelések és pénzügy — Nincs adatkapcsolat**; **Adatforrások** (betöltve / hiba / nincs adatkapcsolat); Gyors műveletek; **Összesített számok** (változatlan `OwnerKpiStrip`) + Vezetői részletek; Napi AI-briefing **csak kinyitáskor** indul |
| Prioritás (egyszer, átfedés nélkül) | kritikus/döntést igénylő értesítés → saját, le nem járt AI-jóváhagyás → Szerződés szakaszú ügy (figyelmeztetés: nincs ügyfél, elfogadott ajánlat, kapcsolattartó, nettó összeg, felelős) → elfogadott ajánlat, de nincs Szerződés szakaszban → kritikus projekt (lejárt/akadályozott feladat, lejárt határidő Budapest-nap szerint, nincs PM, Műszaki átadás) → lejárt lead-lépés / utánkövetés / feladat / 24 óránál régebbi webes kérés → küldésre előkészített ajánlat → dolgozói hibajegy → AI-jelzés és dokumentumhiba. Kritikus projekt lejárt feladata és Szerződés-ügy lejárt lépése/utánkövetése nem ismétlődik |
| Navigáció | Pipeline-ügy → `/sales/leads?lead=`, előkészítés → `/leads?lead=` (ugyanaz, mint Sales); projekt → `/projects/<id>?tab=tasks|handover|overview`; ajánlat → `/quotes/<id>`; webes kérés → `/web-quote-requests`; hibajegy → `/help`; AI-jelzés → `/settings/ai-review`; dokumentumhiba → `/settings/knowledge-graph`; értesítés → saját belső linkje (külső/protokoll-relatív link tiltva) |
| Vezetői részletek (`/dashboard`) | lejárt feladat és közelgő határidő a projekt **Feladatok** fülére; átadási projekt az **Átadás** fülre; vissza-link „Mai vezetői munka” |
| George jelentése (`/owner-report`) | „Vissza: Mai vezetői munka” gomb; a tény-linkek lekérdezés-részét a router helyesen kapja meg |
| Menü | Owner kezdőpont neve „Mai vezetői munka” (nem új menüpont) |
| Súgó (`/help/owner`) | három új/átírt lépés: Mai vezetői munka, Szerződés-előkészítés és követelések (nincs adatkapcsolat), Vezetői részletek; George-jelentés helye frissítve |
| Szerepkörös védelem | a felület csak Owner-nek renderel tartalmat (egyébként üzenet); a tényeket a meglévő szerverfüggvény `is_owner_role` ellenőrzéssel adja; minden más olvasás a Tulajdonos RLS-ével; `users_profile select("*")` nincs |

## 3. Módosított / új fájlok

Új: `src/lib/owner/owner-day-flow.ts` (tisztán megjelenítési modell), `src/lib/owner/owner-day-flow.test.ts` (19 teszt), `src/lib/owner/AGENTS.md`, `scripts/qa/check_owner_day.py` (izolált TESZT-böngészőpróba), ez a jelentés.
Módosított: `src/components/today/owner-home.tsx` (átírva), `src/routes/_authenticated/today.tsx` (opcionális `lane` keresési paraméter), `src/components/dashboard/owner-workspace.tsx` (csak linkcélok), `src/routes/_authenticated/dashboard.tsx` (felirat), `src/routes/_authenticated/owner-report.tsx` (vissza-link, linkbontás), `src/lib/nav-config.ts` (Owner kezdőpont felirata), `src/lib/help-guide.ts` (csak Owner rész), `roadmap.md`.

Nem változott: adatbázis-séma, migráció, RLS, jogosultság, szerverfüggvények, AI-eszközök/agentek/modell, értesítés- és jelentésképzés, Sales/Marketing/PM üzleti logika, titkok, költségkeret. Nem küldtem e-mailt, nem publikáltam, éles adatot nem írtam. A Tulajdonosi kezdőlap egyáltalán nem ír adatot.

## 4. Ellenőrzés

- Vitest: **954/954** (93 fájl; a 935 korábbi + 19 új Owner-teszt: teljes prioritási sorrend, lejárt AI-jóváhagyás kizárása, átfedés-összevonás feladat/lead/utánkövetés, hibajegy egyszer + AI_REVIEW George-sávba, Pipeline/előkészítés link, projekt-fül link, külső link tiltása és search-bontás, `lane` validálás, kritikus projekt okok Budapest-nappal, régi PM átadási adatból, szerződés-figyelmeztetések, pénzügy/szerződés-jóváhagyás nincs bekötve, megnyert ügy nem teendő, fókusz loading/error/calm/partial, sávok betöltés alatt nem 0, Ma történt/csonkolás, projekt-határidő dátumként, Owner-súgó útvonalai).
- AI acceptance: **21/21** OK (5 agent, 0 hiba). `tsgo -b --noEmit`: PASS. Build: OK.
- Böngésző, valódi útvonal kijelentkezve (1280 és 390 px): `/today`, `/today?lane=projects`, `/today?lane=bogus`, `/dashboard`, `/owner-report`, `/help/owner` → `/auth`, 0 oldalhiba.
- Izolált TESZT-próba (`scripts/qa/check_owner_day.py`; kitalált TESZT-sorok, a tényfüggvény TESZT-válasza, minden írás 403-mal blokkolva, nem éles munkamenet, nem valódi RLS), 1280 és 390 px: fókusz = kritikus értesítés; mind a 9 tételtípus helyes sorrendben; a kritikus projekt lejárt feladata és a Szerződés-ügy lejárt lépése nem ismétlődik; hibajegy egyszer; „Nincs adatkapcsolat”, „e-aláírás a CRM-ben nincs”, „Nincs kapcsolattartó”, „a tények azóta változtak”, „Részleges” jelzés, PM és Sales név látszik; nincs vízszintes túlfutás; Kritikus projektek szűrő → `?lane=projects`, csak projektek; linkek: `/sales/leads?lead=…`, `/quotes/q-rdy`, `/projects/…?tab=tasks|handover`; `/dashboard` projekt-fül linkek és vissza-link; `/owner-report` vissza-link; `/help/owner` új lépés; egyetlen szerverhívás az `ownerReportOverview`; **0 írási kísérlet**, 0 oldalhiba. Ez **nem** bizonyít valódi RLS-t vagy éles adatot.
- **NEM TESZTELT:** bejelentkezett Owner végigpróba éles adattal; Sales/PM bejelentkezett regresszió (a kódjuk nem változott, csak a közös `today` útvonal opcionális paramétert kapott); a George-jelentés és AI-briefing tényleges futása ebben a körben (nem indítottam fizetős hívást).

## 5. Mi valós és mi nem

Valós, meglévő adatból (kódszinten igazolva): értesítések, hibajegyek, lejárt teendők, AI-jelzések, dokumentumhibák (George AI nélküli tényei), projektek/feladatok kockázata, Szerződés/elfogadott/kész ajánlatok, saját függő AI-jóváhagyás, Ma történt események, George-jelentés frissessége.
Nincs adatkapcsolat, ezért csak kiírva: kintlévőség, pénz beérkezése, számla, bank, Billingo; szerződés jóváhagyása és e-aláírás; George autonóm végrehajtása (nincs ilyen képesség — csak olvas és javasol). Az AI-jóváhagyás csak abban a beszélgetésben dönthető el, ahol indult; a kezdőlap csak jelzi és az AI-asszisztenshez visz.

## 6. Döntést igénylő hiányok (nem csináltam meg)

1. **Szerződés-jóváhagyás adatmodell**: állapot (előkészítés / tulajdonosi jóváhagyásra vár / jóváhagyva / aláírva), aláírt fájl, jóváhagyó és idő; a `sales_mark_won_with_project` előfeltétele legyen-e. Séma, RLS és triggerhatás-elemzés kell.
2. **Pénzügyi kapcsolat**: Billingo/bank import (számla, esedékesség, befizetés) — külső kulcs, adatvédelmi és költségdöntés.
3. **Függő AI-jóváhagyás közvetlen megnyitása** a kezdőlapról (ma a szál helyi tárolású) — külön AI OS/P0 felülvizsgálat.
4. **Hibajegy mélylink** (`/help?issue=`) — a hibaközpont jelenleg listát mutat.
5. **Webes ajánlatkérés „feldolgozva” jelölés** a Marketing csomagból továbbra is nyitott.

## 7. Commit és rollback

Munkacsomag-commit: `0b0e80d`; a jelentés commit-hivatkozásának frissítése külön dokumentációs commit. Visszavonás: `git revert 0b0e80d`. Adatot, sémát, jogosultságot nem érint, ezért a visszavonás adatmentést nem igényel.

## 8. Következő nagy csomag

**A hiányzó szerződés-jóváhagyás és adatkapcsolatok (pénzügy, AI-jóváhagyás mélylink), valamint George proaktív munkafolyamatainak auditja** — nem kezdtem el.
