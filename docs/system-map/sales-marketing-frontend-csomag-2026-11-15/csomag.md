# Sales és Marketing új frontend – teljes tervcsomag (2026-11-15)

Állapot: TERV. Élő rendszer, adatbázis, jogosultság nem változott; nem publikált. Prototípus: `/mnt/documents/sales-marketing-frontend-csomag/prototipus-v2.html` (önálló, TESZT-adat, nincs hálózati hívás).

## 1. Frontend–backend függőségi audit

Jelmagyarázat: **V** = változatlanul használható háttér; **Á** = átalakítandó (frontendben lévő logika kiemelése / új nézetadapter); **H** = hiányzik.

| Funkció | Jelenlegi útvonal / komponens | Háttér (tábla, RPC, szerverfüggvény) | AI / külső | Frontendben lévő logika | Jogosultság | Osztály |
|---|---|---|---|---|---|---|
| Sales Ma | `routes/_authenticated/today.tsx`, `sales.index.tsx`, `sales.todo.tsx` | `useDailyWork`/`dailyWork`, `salesOverview`, `salesFocusSections` | Timothy `briefing.functions.ts`, `sales-watch.functions.ts` | bucketek a `lib/sales` tiszta függvényeiben | `leads_select_sales` (assigned_to) | V |
| Pipeline | `sales.leads.tsx`, `leads.index.tsx`, `leads.$id.tsx`, `components/sales/lead-status-stepper.tsx`, `lead-action-bar.tsx` | `leads`, `activities`; `useUpdateLead`; `STATUS_TRANSITIONS` (`lib/sales/constants.ts`) | `pipeline-status-action.ts` (P0) | lépésszabály a frontendben is (`sales-flow.ts`) | RLS + trigger | V (húzás: Á) |
| Elveszett | `leads.lost.tsx` | közvetlen `from("leads")`, `from("activities")` | – | írás az oldalban | RLS | Á (át kell vinni `useUpdateLead`-re) |
| Ügyfél / cég / kontakt | `companies.*`, `contacts.*`, `customers.*` | `companies.functions.ts`, `customer_kpi_v`, `contact-provenance.functions.ts` | `crm_get_company`, `crm_company_overview` | kontakt szerkesztés közvetlen `from("contacts")` a `contacts.$id.tsx`-ben | RLS | Á (egy ügyféllap) |
| Ajánlat lista | `quotes.index.tsx`, `use-quote-list.ts` | `quotes`, `can_access_quote` | `crm_list_quotes` | – | `can_access_quote` | V |
| Ajánlat munkaterület | `quotes.$id.tsx`, `quote-simple-workspace.tsx`, `quote-items-panel.tsx`, `quote-template-panel.tsx` | `quote_create_draft`, `quote_items` triggerek, `template-defaults.functions.ts` | Timothy | `quotes.$id.tsx` közvetlen `from("quotes"/"leads"/"projects"/"contacts")` olvasás | `can_access_quote` | Á (adatbetöltés hookba) |
| Kapott Excel árazás | `quote-package-panel.tsx` | `pricing.functions.ts`, `package.functions.ts`, `packages.functions.ts`, `/api/package-upload-part`, `/api/r2-upload` | `crm_price_received_budget`, `crm_quote_package_preview` | `packageStaleness` (tiszta, tesztelt) | Timothy only; R2-szabály | V kód / H tartós mentés + ártörzs |
| Saját VIBA-ajánlat | `lib/viba-offer/*` | P6 kalkulátor (tiszta) | `crm_viba_offer_calculate` | számítás tiszta modulban | Timothy only | V kód / H mentés, valós díjak |
| Tervellenőrzés / BOM | `plans/plan-review.functions.ts` | – | `crm_quote_plan_review`, `crm_vbf_defects_extract`, `crm_document_ocr` | – | Timothy | V |
| Kiküldés | `quote-send-panel.tsx` | `/api/gmail/send` + `quote_sends`, `quoteLinkSentEmail` | `email-send-action.ts` (P0) | jóváhagyott-csomag címke | saját Gmail-fiók | V (belső jóváhagyás kötelezővé tétele: döntés) |
| Utánkövetés | `followups.tsx`, `next-step-editor.tsx` | `followups`, `recordPrepActivity` | `followup-action.ts`, `next-step-action.ts` (P0) | – | RLS | V |
| Szerződés-előkészítés | `lib/contract/contract-prep.ts` | – (csak számított lista) | – | ellenőrzőlista | – | V lista / H adatmodell, e-aláírás |
| Nyertté tétel + PM-átadás | `sales.handoff.tsx`, `components/pipeline/create-project-dialog.tsx`, `components/handoff/lead-handoff-card.tsx`, `lib/handoff/sales-pm-handoff.ts` | `sales_mark_won_with_project`, `projects_link_lead_records` | – | – | owner vagy assigned sales | V |
| Weboldali érdeklődők | `web-quote-requests.*` | `quote-requests.functions.ts`, `web-request-intake.functions.ts`, `/api/public/website-lead-sync` (HMAC) | – | – | szerveroldali szerepkör-ellenőrzés, 0 kliens policy | V |
| Marketing Ma | `components/marketing/marketing-workspace.tsx`, `next-best-action.tsx` | `marketing-daily.functions.ts` | Scarlet | – | Marketing scope | V |
| Kampány | `campaign-list.tsx`, `campaign-*-control.tsx` | `campaign-drafts`, `campaign-safety`, `campaign-delivery`, `gmail-drafts.functions.ts`, `company-block` | Scarlet (olvas) | – | napi 40/fiók, TESZT-címek | V |
| Postafiók / levelek | `emails.*` | `crm_mailbox_page`, `crm_mailboxes`, `mailbox.functions.ts`, `thread-link.functions.ts` | `scarlet_read_email_thread`, `crm_read_email_thread` | – | pontos mailbox-hozzáférés | V |
| Tartalomnaptár, kreatívtár, tartalom-jóváhagyás | – | – | – | – | – | H (új tábla + RLS) |
| Közösségi publikálás, Meta-mérés | – | – | – | – | – | H (integráció) |
| Kampányeredmény (megnyitás/kattintás) | – | – | – | – | – | H |
| Google Ads | `settings.google-ads.tsx` | `google-ads/*.functions.ts` | Michael | – | Owner-only | V (Marketing-láthatóság: döntés) |
| Beérkező levélből ügyfelismerés + dokumentumgyűjtés | – | knowledge-ingest részben | – | – | – | H |
| AI jóváhagyások mindkét chatben | `ai-panel.tsx`, `chat-shared.tsx` | `agent_run_steps`, `approval.server.ts`, `useAiApprovals` | mind | – | service-only claim | V |

Összegzés: a háttér nagy része változtatás nélkül használható. Átalakítandó: 3 oldal közvetlen táblaírása/olvasása (`leads.lost.tsx`, `contacts.$id.tsx`, `quotes.$id.tsx`) közös hookokba. Hiányzik: marketing-tartalom adatmodell, közösségi integráció, szerződés-adatmodell, ártörzs és kalkulációmentés (a P7 migrációs terv része), levélből automatikus ügyfelismerés.

## 2. Új frontend architektúra

- **Navigáció szerepkör szerint**: Sales – Ma, Ügyek, Ajánlatok (Kapott Excel / Saját VIBA külön), Kiküldés és utánkövetés, Szerződés és átadás. Marketing – Ma, Érdeklődők, Tartalom, Kampány és eredmény. Tulajdonos mindkettőt látja. A másik szerepkör menüje rejtett.
- **Munkaterület-váz** (minden ügytípusra azonos): lépéssáv → „Következő teendő” → fő munkaanyag (pl. árazott költségvetés) → AI-eredmény kártya a munkaterületen → jóváhagyó gomb, amely csak érvényes állapotban aktív.
- **Öt állapotjel + egy**: Automatikusan kész · Ellenőrizendő · Hiányzó/bizonytalan · Jóváhagyásra vár · Befejezett, dokumentált · Fejlesztendő háttér.
- **Közös komponensek**: `WorkspaceShell`, `StepBar`, `NextActionCard`, `StatusBadge`, `AiResultCard` (a meglévő AI OS futás eredményét és `RunStatusStrip`-et jeleníti meg), `ApprovalGate` (a meglévő `useAiApprovals`-ra épül), `RecordCombobox` (meglévő).
- **Adatréteg**: csak meglévő hookok és szerverfüggvények; új nézetadapterek tiszta függvényként (`lib/workspace/*`), tesztelve. Nincs új írási útvonal, nincs új AI-chat.
- **Bevezetés kapcsolóval**: új felület `/munka/...` útvonalon a régi mellett, felhasználónkénti kapcsoló; a régi oldalak érintetlenek.

## 3. Képernyőterv (két munkakör)

Sales folyamat: Érdeklődő → Ügyfél → Ajánlat (Kapott Excel: eredeti költségvetés árazott táblája tételállapottal; Saját VIBA: m²-paraméterek → kalkuláció) → Belső jóváhagyás → Gmail-kiküldés → Utánkövetés (Timothy-javaslat jóváhagyással) → Szerződés-előkészítés (hiányzó adatok kitöltése) → Tulajdonosi jóváhagyás → Nyert + projektvezető → PM-átadás.

Marketing folyamat: Kampányterv → Scarlet tartalomtervezet → Jóváhagyás (Marketing/Owner) → Ütemezés → Publikálás (most kézi) → Eredmény (Gmail-bizonyíték, válaszok kézi ellenőrzéssel) → Érdeklődő minősítése → átadás Sales-nek (felelőst a tulajdonos adja).

Képernyőképek gépen és mobilon: `/mnt/documents/sales-marketing-frontend-csomag/kepek/`.

## 4. Működő vs. fejlesztendő

| Működő háttér (élesben, de bejelentkezve nem igazolt) | Kód kész, csak mock/izolált teszt | Hiányzik |
|---|---|---|
| Pipeline-szabályok, Ma-bucketek, ajánlatjogosultság, Gmail-küldés bizonyítékkal, P0 AI-jóváhagyások, kampányküldés-keret, weboldali szinkron, nyertté tétel + projekt | Kapott Excel árazás, saját VIBA-kalkuláció, csomag-elavulás, terv/BOM-ellenőrzés, szerződés-ellenőrzőlista | Tartós kalkuláció/jóváhagyás mentés (migráció kész terv), ártörzs, tartalomnaptár, kreatívtár, közösségi publikálás, Meta-mérés, szerződés-adatmodell, e-aláírás, levélből automatikus ügyfelismerés, nagyfájl-feldolgozó |

## 5. Szakaszos, visszaállítható lecserélési terv

| Szakasz | Tartalom | Visszaállítás | Átvételi feltétel |
|---|---|---|---|
| A | Közös komponensek + nézetadapterek, tesztek; nincs látható változás | kód visszavonás | tesztek zöldek |
| B | Sales Ma + Ügyek új nézet kapcsolóval (húzás a meglévő `useUpdateLead` + `STATUS_TRANSITIONS` úton) | kapcsoló ki | bejelentkezett TESZT Ramonnal |
| C | Ajánlat-munkaterület (Excel / Saját), egyszerűsített nézet alapértelmezett | kapcsoló ki | 3 forgatókönyv bejelentkezve |
| D | Kiküldés–utánkövetés–szerződés–átadás | kapcsoló ki | tulajdonosi jóváhagyás próbája |
| E | Marketing Ma, Érdeklődők, Kampány | kapcsoló ki | Marketing-próba |
| F | Tartalom-modul (új tábla+RLS – külön migrációs jóváhagyás) | migráció rollback | döntés D3 után |
| G | Régi oldalak elrejtése, majd 2 hét után törlése | menü visszaállítás | nincs visszaállítási igény |
Minden szakasz után STOP és tulajdonosi engedély.

## 6. Önellenőrzési jelentés

Playwright, prototípus, gépi (1280) és mobil (390) nézet: **44/44 ellenőrzés sikeres**, 0 JS-hiba, 0 vízszintes túlcsordulás. Végigjárt: kapott Excel (hiányzó/hibás ár blokkol), saját VIBA (érvénytelen m²), kiküldés (jóváhagyás nélkül tiltott) + utánkövetés, Pipeline tiltott lépés, szerződés (hiányzó cégjegyzékszám és nem-tulajdonos blokkol; nyert csak Szerződés szakaszból), weboldali érdeklődő (minősítés nélkül nem adható át), tartalom (publikálás fejlesztendőként jelölve), kampány (teszt-küldés nélkül nem indítható), szerepkör szerinti menü.

Saját tesztelés közben talált és javított ellentmondások:
1. A tulajdonosi szerződés-jóváhagyás hiányzó ügyféladat mellett is engedélyezett volt → most csak kitöltött, formailag helyes cégjegyzékszámmal.
2. Az értékesítő látta a Marketing menüt és fordítva → szerepkör szerinti menü.

Fennmaradó kockázatok: a prototípus nem igazolja az éles működést (nincs bejelentkezés, RLS, Gmail, Timothy/Scarlet modellhívás); a kapott Excel jóváhagyható „Ellenőrizendő” tételekkel – szándékos (az értékesítő dönt), de vitatható; az időmegtakarítás nem mért; a húzható Pipeline éles ütközéskezelése (egyidejű szerkesztés) még tervezendő.

## 7. Összesített üzleti döntések
1. Bejelentkezett TESZT-végigpróba Ramonnal és a tulajdonossal (B szakasz előfeltétele).
2. Kötelező belső jóváhagyás minden ajánlatküldés előtt?
3. Tartalom-modul (naptár, kreatív, jóváhagyás) új adattárolással – indulhat-e (F szakasz).
4. Google Ads adatok láthatósága a Marketing számára.
5. Hiteles VIBA ártörzs, óradíjak, normák; a P7 összevont migráció engedélyezése.
6. Szerződés-adatmodell és e-aláírás szolgáltató (fizetős lehet).
7. Közösségi publikálás / Meta-mérés integráció (fizetős/külső fiók).
