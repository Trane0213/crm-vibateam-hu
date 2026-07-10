# AI Ügynökök — Teljes Szerepkör Áttekintés

Ez nem fejlesztési terv, hanem **állapotfelmérés**. Az egész AI OS (`src/lib/ai-os/`) egyetlen közös runtime-ra épül; agentek csak system prompt-ban, tool-hozzáférésben és modellben különböznek.

---

## 1) Közös alap (minden agent örökli)

- **Runtime:** `runtime.server.ts` — AI SDK + tool loop, approval kapu, `pendingApprovals` per-request izolált.
- **Provider:** OpenAI `gpt-4o-mini` (mind a 8 agent). Nincs fallback, provider váltás csak explicit kérésre.
- **Memória:** `ai_memory` tábla (`memory_read` / `memory_write` core toolok). Subject_type / subject_id / key séma. Minden agent lát ugyanabból (közös memória).
- **Handoff:** `core.handoff` domain — csak George orchestrator hívja. A specialisták nem hívják közvetlenül egymást.
- **Nyelv:** magyarul, tömören. Adat csak toolon át, találgatás tilos.
- **Audit:** `audit.server.ts` minden tool-hívást naplóz.

**Közös tool domainek:** `core.handoff`, `core.memory`, `crm.*` (14 tool), `ads.google` (18 tool). Összesen kb. **35 tool** a rendszerben.

---

## 2) Az agentek — mit tudnak, miből dolgoznak

### A) Interaktív specialisták (chat UI-n)

#### 🎼 George — Orchestrator
- **Feladat:** karmester. Eldönti, ki válaszoljon, összegez.
- **Tool-ok:** `core.handoff`, `core.memory`, teljes CRM (`crm.search/companies/contacts/projects/leads/quotes/emails`).
- **Miből dolgozik:** CRM adatbázis (Supabase, RLS-sel a user nevében), memória.
- **Handoff célok:** Marketing → Scarlet, Sales → Timothy, Projekt → Boss. Michael (Ads) NEM szerepel a handoff listában — közvetlenül a UI-ban érhető el.
- **Erősség:** egyszerű CRM keresés/összegzés önmagában is.

#### 💌 Scarlet — Marketing
- **Feladat:** lead-minősítés, kampány, csatorna, email aktivitás.
- **Tool-ok:** `core.memory`, `crm.search/companies/contacts/leads/emails`, `marketing.workflow` (deklarált, de üres — nincs implementált tool).
- **Miből dolgozik:** CRM lead/email tábla.
- **Korlát:** nem foglalkozik sales lezárással, projekttel.

#### 💼 Timothy — Sales
- **Feladat:** pipeline, ajánlatok, utókövetés, megnyerés.
- **Tool-ok:** teljes sales CRM + `sales_mark_won_with_project` (egyetlen valódi write tool a CRM oldalon).
- **Miből dolgozik:** `crm_leads`, `crm_quotes`, `crm_followups`, `crm_emails`.
- **Erősség:** megnyerést projekt-létrehozó folyamaton át javasol.

#### 📋 Boss — Projektvezető
- **Feladat:** aktív projektek, határidők, kockázatok.
- **Tool-ok:** `crm.projects/tasks/followups/meetings`, `pm.workflow` (deklarált, üres).
- **Miből dolgozik:** projektek, feladatok, meetings.

#### 📊 Michael — Google Ads specialista (Owner-only)
- **Feladat:** Google Ads elemzés + write, üzleti cél alapján.
- **Tool-ok (18):**
  - **READ (13):** `list_ads_accounts`, `get_account_snapshot`, `list_campaigns`, `get_campaign_performance`, `list_ad_groups`, `list_keywords`, `list_search_terms`, `list_ads`, `get_budget_status`, `get_conversion_setup`, `get_google_recommendations`, `get_baseline_comparison`, `get_change_history`.
  - **WRITE (5):** `pause_campaign`, `enable_campaign`, `update_campaign_budget`, `add_campaign_negative_keyword` (CONFIRM), `remove_campaign` (DANGEROUS). Mind támogatja `mode='dry_run' | 'execute'`.
- **Miből dolgozik:** Google Ads API + `google_ads_snapshots` + `google_ads_change_log` + `google_ads_constitution` (dinamikusan `augmentSystemPrompt`-ban betöltve).
- **Egyedi:** M4.5 Business Decision Layer (üzleti cél → alkotmány → baseline → change history → metrika → javaslat) + 9-mezős kötelező javaslati sablon + Recommendation Score.
- **Handoffban nem szerepel** — külön UI belépéssel.

### B) Non-interaktív (tool nélküli) generátorok

#### 📈 sales_briefing — Napi értékesítési riport
- Tool nélkül fut. Snapshotot **user message-ben** kapja a frontendtől. Kötelező sablon: nyitott ajánlatok / lejárt utókövetés / ma hívandók / elakadt ajánlatok / javaslat.

#### 🗂️ pm_briefing — Napi projektvezetői riport
- Snapshot-alapú. Sablon: aktív projektek / mai feladatok / közelgő határidők / hiányzó dokumentáció / kockázatok (🟢🟡🔴).

#### 🧾 crm_summary — Snapshot összefoglaló
- `AiSummaryDialog` használja. Frontend adja a CRM kontextust, ő rövid magyar szöveget ad.

#### 🔎 research_companies — B2B cégkutató
- Timothy felügyelete alatt. Strukturált JSON, valós magyar cégek. `/sales/research` oldal.

---

## 3) Közös pontok / átfedések

| Terület | Ki használja |
|---|---|
| `ai_memory` (közös memória) | George, Scarlet, Timothy, Boss, Michael |
| `crm_search`, `crm_list_companies`, `crm_list_leads` | George, Scarlet, Timothy (Boss nem lát leadet) |
| `crm_emails` | George, Scarlet, Timothy |
| `google_ads_*` | **kizárólag Michael** — teljesen izolált domain |
| Provider/model (`gpt-4o-mini`) | mind |
| Runtime + approval | mind az interaktív, briefing-ek nem — nincs tool |
| Constitution / alkotmány | **csak Michael** (`google_ads_constitution`) |
| Snapshot + baseline + change history | **csak Michael** (Google Ads domain) |

**Fő szeparáció:** két elszigetelt világ.
1. **CRM világ** (George + 3 specialista) — pipeline, projektek, emailek.
2. **Google Ads világ** (Michael egyedül) — teljes külön adatréteg, alkotmány, döntési sablon.

A kettő között ma **nincs hídszerű összeköttetés**. Michael nem lát CRM leadeket, Scarlet nem lát Ads adatot.

---

## 4) Ügynökönkénti hiánylista + fejlesztési ötletek

### George (Orchestrator)
- **Hiány:** nem tudja átirányítani Michaelhez — Ads kérdésekre saját maga vagy Scarlet válaszolna, Michael nincs a handoff listán.
- **Hiány:** nincs "route to best agent" heurisztika naplózás — nehéz utólag látni, miért adott át.
- **Ötlet:** Michael felvétele handoff célként (Owner-only szűréssel). Handoff-döntések logolása egy `agent_route_log` táblába.

### Scarlet (Marketing)
- **Hiány:** `marketing.workflow` domain deklarálva, **nincs egyetlen tool sem** benne. Ma csak CRM lead-adatot lát, marketing-specifikus adata (GA4, GSC, Clarity, kampány) nincs.
- **Hiány:** nem lát Google Ads adatot, pedig marketing specialista.
- **Hiány:** nincs email kampány / hírlevél tool.
- **Ötlet:** READ-only jogot kaphat Michael Google Ads snapshot-jaihoz (nem az API-hoz — a `google_ads_snapshots` táblához), hogy top-level marketing kép egyben álljon. Lead-forrás elemző tool (`analyze_lead_sources`).

### Timothy (Sales)
- **Hiány:** kizárólag CRM belső adatból dolgozik — nem lát külső jelet (weboldalról érkező érdeklődő, email-válaszidő stb.).
- **Hiány:** `sales_mark_won_with_project` az egyetlen write tool — nincs pl. quote létrehozó, follow-up ütemező, sablon-email küldő.
- **Hiány:** nincs "hot lead detector" — nincs scoring tool.
- **Ötlet:** `create_quote_draft`, `schedule_followup`, `send_templated_email` (CONFIRM), lead-scoring tool.

### Boss (Projektvezető)
- **Hiány:** nem lát pénzügyi vetületet (projekt-jövedelmezőség, számlázás).
- **Hiány:** nincs dokumentum-tartalom olvasás (csak létezés-ellenőrzés).
- **Hiány:** nincs Gantt/timeline számítás — csak nyers határidő-listát ad.
- **Ötlet:** dokumentum-parse tool (project meetings jegyzőkönyv → task lista), kockázat-score számító tool, kapacitás-tervező tool.

### Michael (Google Ads)
- **Hiány:** csak Google Ads adat — nem lát mi történik a kattintás után (GA4 / Clarity / weboldal).
- **Hiány:** nem ismeri a `vibateam.hu`-t (landing oldalak üzleti célja, CTA-k, konverziós út).
- **Hiány:** nem lát Search Console-t (organikus jelenlét), így nem tudja értékelni, hogy egy kulcsszóra érdemes-e Ads-t költeni.
- **Hiány:** nem lát CRM lead adatot — így nem tudja validálni, hogy egy Ads-ből érkező lead minőségi-e.
- **Hiány:** nincs A/B teszt-értékelő tool, nincs ad copy generátor / értékelő.
- **Ötlet (az elhalasztott M7):** site knowledge (`vibateam_pages`, landing↔kampány mapping) + GA4 + GSC + Clarity + Web Audit READ toolok.

### sales_briefing / pm_briefing
- **Hiány:** teljesen frontend-vezéreltek — ha nő a CRM méret, a snapshot user-message-ben nem fér el.
- **Hiány:** nincs "változás előző napi briefinghez képest" — nem lát trendet.
- **Ötlet:** briefing-eredmény tárolása egy `daily_briefings` táblában, hogy másnap "delta" is generálható legyen.

### crm_summary
- **Hiány:** csak frontend-adott kontextusból dolgozik, nem hív toolt — nem tud pontosítani.
- **Ötlet:** "deep mode" — engedjük a `crm.search` toolt hívnia, ha a kontextus hiányos.

### research_companies
- **Hiány:** hallucináció-kockázat — nincs valós adatforrás bekötve (nincs cégkereső API), csak a modell tudásából dolgozik.
- **Hiány:** eredmény nem kerül a CRM-be automatikusan.
- **Ötlet:** OPTEN/CÉGADAT API vagy Google Places bekötése; közvetlen "import as lead" gomb az eredmény mellé.

---

## 5) Architektúra-szintű megfigyelések (fejlesztési irány)

1. **Két izolált világ** — CRM és Google Ads közt nincs adatáramlás. Az első valódi híd: Michael lássa a lead-eredményt (`crm_leads` READ), a CRM oldal (Timothy/Scarlet) lássa az Ads snapshot-okat READ-only.
2. **`marketing.workflow` és `pm.workflow` deklarált, de üres domainek** — Scarlet és Boss szerepe így nem teljes; toolok nélkül csak CRM-olvasók.
3. **Csak Michaelnek van "alkotmánya" (Constitution) és "döntési sablonja" (M4.5)**. Timothy sales-döntéseit, Scarlet minősítéseit sem szabályozza semmilyen `*_constitution`. Egy általánosított `agent_constitution` tábla (agent_id-hez kötött szabályokkal) minden specialistát üzleti korlátok közé tehet.
4. **Csak Michaelnek van snapshot + baseline + change history** — Sales/PM oldalon nincs baseline-eltérés-számítás, pedig "elakadt ajánlat", "pipeline egészség", "projekt-csúszás" tipikus baseline-alapú fogalmak. `sales_snapshots`, `pm_snapshots` + generikus `get_baseline_comparison(source, ...)` tool megnyitná az utat.
5. **Csak Michaelnek van Dry Run + Approval** — Timothy jövőbeli write toolok (email küldés, quote létrehozás) ugyanezt a mintát kellene kövessék. A `runtime.server.ts` már támogatja, nem kell új infrastruktúra.
6. **Nincs "cross-agent" memória-scope** — a `ai_memory` közös, de nincs formális "melyik agent írta / kinek szól" mező, ami eltérő szereplőknél zaj-forrás.
7. **Nincs agent-telemetria** — mennyi tokent égetett melyik agent, melyik tool a leglassabb, melyik hívás bukott approval-ra. Egy `agent_run_metrics` view megnyitná az optimalizálási lehetőségeket.
8. **Provider-diverzitás nulla** — mind `gpt-4o-mini`. Michael döntési szerepére (10-15 lépéses tool loop, komplex sablon) egy erősebb model (pl. `gpt-4o` vagy `o3-mini`) kifejezetten indokolt lenne.

---

## 6) Prioritási javaslat (nem sprint-terv, hanem ötlet-rangsor)

| # | Fejlesztés | Miért fontos | Kit érint |
|---|---|---|---|
| 1 | George → Michael handoff | Ma Ads kérdésre a rossz agent válaszol | George, Michael |
| 2 | Michael lássa a `crm_leads` READ-et | Ads lead-minőség validáció | Michael |
| 3 | `marketing.workflow` toolok Scarletnek | Ma üres domain, Scarlet féllábú | Scarlet |
| 4 | Timothy write toolok (`create_quote_draft`, `schedule_followup`) | CRM ma szinte csak olvasható AI-nak | Timothy |
| 5 | Boss dokumentum-parse tool | Meeting-jegyzőkönyvekből task-generálás | Boss |
| 6 | Generikus `snapshot + baseline` Sales/PM oldalra | Baseline-tudás ne csak Michael privilégiuma legyen | Timothy, Boss |
| 7 | Agent telemetria (`agent_run_metrics`) | Cost/latency láthatóság | mind |
| 8 | Michael erősebb model (pl. `gpt-4o`) | Komplex döntési sablon minőség-javulás | Michael |
| 9 | vibateam.hu site knowledge (eredeti M7-terv szűkített verzió) | Michael post-click kontextus | Michael |
| 10 | GA4 / GSC / Clarity READ | Post-click / organikus / frustration jelek | Michael |

---

Fejlesztés csak **egy** kiválasztott irányban indul, jóváhagyás után. Egyszerre EGY funkció — a project szabály változatlan.
