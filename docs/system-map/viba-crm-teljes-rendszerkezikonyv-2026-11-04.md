# VIBA-TEAM CRM – Teljes rendszerkézikönyv

**Verzió:** 1.0 · **Készült:** 2026-11-04 · **Jelleg:** read-only feltérképezés, semmi nem módosult

**Módszer:** 4 párhuzamos kódfeltérképezés (oldalak/gombok, adatbázis/folyamatok, AI-rendszer, automatizmusok/integrációk) + éles Supabase-lekérdezések. A "NEM TESZTELT" jelölés azt jelenti, hogy hitelesített böngészős próba nem történt.

---

## 0. Vezetői összefoglaló

| Terület | Azonosítva | Igazoltan működő | Részleges / kockázatos | Nem tesztelt |
|---|---|---|---|---|
| Oldalak (route) | 77 (72 belső + 5 nyilvános/auth) | többség kódból igazolt | lásd 10. fejezet | többszerepkörös böngészős próba |
| API-végpontok | 14 | Gmail, weboldal-szinkron, R2 élőben igazolt | Google Ads OAuth-szerepkör | – |
| Szerverfüggvények | ~55 | korábbi tesztkörökben | – | – |
| Adatbázis | 91 tábla, 12 nézet, 166 RLS-szabály, 42 trigger, 5 egyéb függvény | éles lekérdezéssel | RLS-teljesség nem bizonyítható migrációkból | – |
| AI-eszközök | 60+ regisztrált tool, 9 agent | Timothy 15/15 chatpróba PASS (gpt-6-astra) | George/Scarlet/Boss/Michael csak technikai próba | éles többszerepkörös AI-próba |
| Automatizmusok | 1 éles cron (perces Gmail-szinkron, ÉLESBEN AKTÍV) | pg_cron `gmail-incremental-sync` active=true | weboldal-crawl és Ads: nincs ütemezés | – |

**Éles adatállomás (2026-11-03):** 446 cég, 439 kontakt, 8 lead, 7 ajánlat, 2 projekt, 18 webes ajánlatkérés, 7066 email szál, 911 AI-futás (ebből 20 gpt-6-astra). Szerepkörök: 1 owner, 1 marketing, 2 sales, 0 PM, 0 agent.

**Legsúlyosabb kockázatok (rangsorolva):**
1. **Gmail cron-titok a kódtárolóban** (`database/2026-06-18_gmail_cron_secret_vault.sql`) – rotáció javasolt.
2. **Google Ads OAuth végpontokon nincs owner-ellenőrzés** – csak a beállítási UI owner-only, maga a callback nem.
3. **Weboldali ajánlatkérés → lead híd hiányzik** – a 18 rekord read-only, nincs implementált konverzió.
4. **Menü-láthatóság ≠ tényleges jogosultság** – a menü hard-kódolt, a hozzáférés DB-felülbírálható; eltérhetnek.
5. **AI-válaszok nem nyers modellkimenetek** – a kód helyenként kicseréli/kiegészíti őket (9. fejezet).

---

## 1. Teljes menü- és oldaltérkép

### 1.1 Hitelesítés és hozzáférés alapjai

- Bejelentkezés: `/auth`, jelszó-visszaállítás: `/forgot-password`, `/reset-password`. `/` → átirányít `/today`.
- Minden belső oldal a `_authenticated` keret alatt fut: `getSession()` nélkül redirect `/auth` (`src/routes/_authenticated/route.tsx:20-27`).
- Szerepkör-kényszer **komponens-szintű**, nem `beforeLoad`: betöltés alatt `allowed=true`, utána tiltott oldal helyett tiltóüzenet.
- Tényleges jogosultság: owner mindent kap → DB `route_permissions` leghosszabb prefix → hard-kódolt alap (`src/hooks/use-route-permissions.ts:33-55`).
- A **menü** viszont hard-kódolt `canAccessRoute` + `hideForRoles` (`src/lib/nav-config.ts:116-133`) → DB-felülbírálás és menü eltérhet.
- Hiányzó/ismeretlen szerepkör → marketingnek számít (`src/lib/permissions.ts:13-24`).

### 1.2 Alapértelmezett útvonal-jogosultsági mátrix

(O=owner, P=projektvezető, S=sales, M=marketing, A=mind)

| Útvonal-prefix | Hozzáférés |
|---|---|
| `/today` | A |
| `/dashboard` | O |
| `/activity`, `/projects`, `/quotes`, `/followups`, `/tasks`, `/meetings` | O P S |
| `/leads/lost` | O S |
| `/leads` | O S M |
| `/companies`, `/contacts`, `/customers`, `/web-quote-requests`, `/emails`, `/calls` | A |
| `/campaign-list`, `/data-quality` | O P M |
| `/documents`, `/attendance` | O P |
| `/ai-assistant`, `/ai-assistants`, `/sales/research`, `/help` | A |
| Egyéb `/sales/*` | O S |
| `/settings/gmail`, `/settings/profile` | A |
| Egyéb `/settings/*`, `/import-review` | O |

Forrás: `src/lib/permissions.ts:47-79`. Ezek alapok, nem éles DB-felülbírálások.

### 1.3 Szerepkörönkénti főnavigáció

| Szerepkör | Főmenü (sorrendben) |
|---|---|
| Owner | Ma, Irányítópult, Sales pipeline, Projektek, Ajánlatok, Jelenlét |
| Sales | Ma, Lead munkafelület, Pipeline, Ajánlatok, Projektek |
| Marketing | Ma, Lead munkafelület, Weboldali ajánlatkérések, Kampánylista, E-mailek |
| PM | Ma, Projektek, Feladatok, Találkozók, Dokumentumok, Jelenlét |

**Menüben rejtett, de útvonalon elérhető:** Salesnél weboldali kérések, hívások, találkozók, sales áttekintő, ajánlatriport, aktivitás, feladatok; `/followups` és `/sales/handoff` sehol nincs a főnavigációban; `/settings/openai` útvonal létezik, de nincs a beállítási oldalsávban.

### 1.4 Mobilnézet

- Alsó sáv: csak az első 4 főmenüpont; többi "Továbbiak" bottom-sheetben (`src/components/mobile-bottom-nav.tsx:17-24`).
- Mobilon nincs oldalsáv; fejlécben: Ma-logó, kereső, Gyors hozzáadás, AI-panel, értesítések, felhasználói menü.

### 1.5 Oldaljegyzék (72 belső útvonal)

**Ma / vezetői:** `/today` (szerepkör szerint OwnerHome/SalesHome/MarketingHome/PmHome), `/dashboard` (owner KPI, napi briefing, AI-összefoglaló).

**Sales:** `/sales` (áttekintő), `/sales/leads` (pipeline tábla), `/sales/todo` (esedékességi bucketek), `/sales/quotes` (ajánlatriport), `/sales/handoff` (átadás), `/sales/research` (Scarlet cégkutatás).

**Leadek:** `/leads` (munkafelület/lista; owner marketing-módot kap!), `/leads/:id` (redirect `/leads?lead=:id`), `/leads/lost` (veszett leadek, reaktiválás megerősítéssel).

**Ügyfelek:** `/companies` (lista+export), `/companies/:id` → redirect `/customers/:id`, `/customers` (egységes ügyféllista, szegmensek), `/customers/:id` (szerepkör-specifikus cégadatlap, fülek: áttekintő/kontaktok/projektek/ajánlatok/utánkövetések), `/contacts`, `/contacts/:id`.

**Ajánlatok:** `/quotes` (lista, aktuális-szűrő, lapozás), `/quotes/:id` (4 fül: alapok+fájlok, árazás, PDF/küldés, utánkövetés; zároltnál Mentés tiltva), `/quotes/:id/print` (nyomtatási nézet).

**Projektek:** `/projects` (lista, "csak saját" kapcsoló), `/projects/:id` (11 fül: áttekintő, kontaktok, ajánlatok, utánkövetések, emailek, hívások, találkozók, feladatok, dokumentumok, jegyzetek, idővonal).

**Kommunikáció:** `/emails` (postafiók-váltó, mappák, 50/lap), `/emails/:threadId` (szál, mellékletek, válasz csak saját postafiókból), `/followups`, `/tasks`, `/meetings`, `/calls`, `/activity`.

**Jelenlét (O/P):** `/attendance` (napló), `/attendance/quick` (Ctrl+Enter mentés), `/attendance/new` (tömeges), `/attendance/summary` (időszaki összesítő+korrekció), `/attendance/workers` (dolgozók/projektek), `/attendance/payouts` (csak owner, read-only+CSV), `/attendance/guide`.

**Marketing/minőség:** `/web-quote-requests`, `/web-quote-requests/:id` (read-only!), `/campaign-list` (kampány, elutasítás megerősítéssel), `/data-quality` (5 fül: hiányos cégek, duplikátumok, kontakt-konfliktusok, linketlen leadek/emailek), `/import-review` (owner).

**AI/súgó:** `/ai-assistants` (könyvtár), `/ai-assistant` (chat, szálak, törlés, gyorskérdések), `/help/marketing`, `/help/sales`, `/help/owner` (menüben owner-only, útvonalon mindenkinek nyitott).

**Beállítások:** `/settings` (áttekintő), `/settings/profile`, `/settings/gmail`, `/settings/storage`, `/settings/users`, `/settings/roles` (read-only mátrix), `/settings/audit`, `/settings/permissions-audit` (route-felülbírálások), `/settings/dashboard-status`, `/settings/agent-visibility`, `/settings/agent-audit`, `/settings/google-ads`, `/settings/knowledge-graph`, `/settings/website-knowledge`, `/settings/openai`.

---

## 2. Gomb- és művelettérkép (főbb láncok)

### 2.1 Megosztott mechanizmusok

- **ResourcePage CRUD** (`src/components/resource/resource-page.tsx`): Új/Szerkesztés dialógus, törlés megerősítéssel (owner-only ahol `OWNER_ONLY_DELETE`), `?new=1` automatikus létrehozó-dialógus. DB-hooked: `src/lib/db-hooks.ts`.
- **Gyors hozzáadás** (fejléc): navigál a lista `?new=1`-re; marketingnél minden pont rejtett (`src/components/quick-add-menu.tsx:19-52`).
- **Email-szerkesztő** (`email-composer.tsx`): Küldés → `/api/gmail/send`; melléklet → `/api/r2-upload`; Küldés tiltva saját postafiók nélkül.
- **Dokumentumkezelő** (`document-manager.tsx`): feltöltés → `/api/r2-upload` + `project_documents.insert`; letöltés → `r2PresignDownload`; törlés → `r2DeleteDocument` (megerősítéssel).

### 2.2 Lead-munkafelület műveletei

| Művelet | Handler | Backend | DB |
|---|---|---|---|
| Státusz/felelős/következő lépés/jegyzet | `useUpdateLead` | `updateLeadOrThrow` (RLS, pontosan 1 sor) | `leads` + `activities` |
| Gyors utánkövetés | `useCreateLeadFollowup` | `followups.insert` | `followups` (trigger tölti a felelőst) |
| Email/sablon | `openComposer` | `/api/gmail/send` | `emails`, `email_threads` |
| Hívásnapló | `logCallNow` | insert | `phone_calls` |
| Ajánlat-verzió | `createQuoteVersion` | `quote_new_version` RPC | `quotes`, `quote_items` |
| Megnyerés | create-project dialog | `sales_mark_won_with_project` RPC | `leads`+`projects` tranzakció |
| Közvetlen `status:"won"` | – | **tiltva** | UI-oldali elutasítás |

### 2.3 Ajánlat-műveletek

| Művelet | Backend | Szabály |
|---|---|---|
| Új piszkozat | `quote_create_draft` RPC | lead-zárolás, A alternatíva, köv. verzió |
| Új verzió | `quote_new_version` RPC | tételeket is másol |
| Új alternatíva | `quote_new_alternative` RPC | A–Z, tételek nélkül |
| Küldés CRM-ből | `/api/gmail/send` + `quote_sends` | idempotencia-kulcs, Gmail-bizonyíték |
| Már kiment levél kapcsolása | `quoteLinkSentEmail` | élő Gmail SENT-ellenőrzés |
| Státuszmentés | `quotes.update` | `quotes_status_guard` trigger |
| Utánkövetés | `quote_schedule_followup` RPC | csak sent/negotiation, 1 nyitott/ajánlat |
| Tétel CRUD | `quote_items` | `quote_items_calc` trigger, zároltnál tiltva |
| Felelős átadás | `quotes.update` | **csak owner** (`quotes_responsible_guard`) |

### 2.4 Adatminőség-műveletek (`/data-quality`)

Cég-autokitolítés (`enrichCompanyFromExistingData`), lead-autokitolítés (`enrichLeadLinks`), lead↔cég kapcsolás (`linkLeadToCompany`), szál↔cég kapcsolás (`linkThreadToCompany`).

### 2.5 Kimaradt vezérlők (lefedettségi hiány)

Today-komponensek gombszintű leképezése, marketing cégmunkalap, globális kereső/értesítések/felhasználói menü, projekt státusz/kontakt panelek, jelenlét-szűrők – ezek gombonkénti visszakövetése **NEM TESZTELT** (forrásszinten azonosítva, kattintás nem ellenőrzött).

---

## 3. Adatbázis- és kapcsolattérkép

### 3.1 Üzleti mag

```text
quote_requests (webes érdeklődés, 18 sor, read-only)
      │ (NINCS automatikus konverzió)
      ▼
companies (446) ──< contacts (439, company_id)
      │                    │
leads (8) ── company_id, contact_id, assigned_to
      │
      ├──< quotes (7) ──< quote_items, quote_documents, quote_sends
      │         │ group_id + alternative_key + version + is_current
      │
      └──< projects (2) ──< project_contacts, project_documents,
                            project_notes, project_status_history
followups (7): lead_id / project_id / company_id / quote_id
```

- Megnyert lead → projekt: **rekordok átkapcsolódnak, nem másolódnak** (`projects_link_lead_records` trigger).
- `customer_kpi_v` nézet `security_invoker=on`; a többi 11 nézet biztonsági jellege nem igazolt.

### 3.2 Táblacsoportok (91 tábla)

Üzleti: companies, contacts, leads, lead_status_history, quotes, quote_items, quote_documents, quote_sends, quote_requests, projects, project_*, tasks, meetings, phone_calls, followups, followup_events, activities.
Email: emails, email_threads, email_thread_access, email_attachments, email_messages, email_drafts, email_campaigns, gmail_accounts, gmail_sync_runs.
AI: agents, agent_runs, agent_run_steps, agent_tasks, agent_activity, agent_memories, agent_permissions, agent_role_access, ai_memory, ai_messages, ai_threads, ai_action_log.
Jelenlét: attendance_entries, attendance_period_adjustments, attendance_projects, attendance_workers.
Google Ads: google_ads_connections, google_ads_snapshots, google_ads_change_log, google_ads_constitution, google_ads_keywords, google_ads_recommendations.
Weboldal-tudás: website_pages, website_page_versions, website_page_summaries, website_entities, website_page_entities, website_crawl_runs, website_ai_jobs, website_media, website_page_blocks_* (5), website_page_changes, website_sources.
Tudásgráf: kg_nodes, kg_edges, kg_node_kinds, kg_relations, kg_publishers, kg_edge_history, knowledge_documents, knowledge_chunks.
Jogosultság: roles, permissions, role_permissions, route_permissions, user_roles, users_profile.
Egyéb: import_log, import_review_items, project_candidates, contact_messages, dashboard_status_config, reminders, references, settings, sales_module_meta.
Backup (nem public): `backup_pipeline_20261029`, `private_backup`.

### 3.3 RLS (166 szabály az éles DB-ben)

- **Ajánlatok:** `can_access_quote` – owner; kapcsolat nélküli: létrehozó; sales: hozzárendelt lead; PM: saját projekt. Legszűkebb halmaz.
- **Projektek/feladatok/utánkövetések:** szélesebb, szerepkör-alapú (O/P/S/M olvas, O/P/S ír) – **nem** hozzárendelés-alapú.
- **Leadek:** sales csak `assigned_to` szerint (`leads_select_sales`).
- **quote_requests:** 0 kliens-policy, csak szerveroldali hozzáférés.
- **users_profile:** mindenki olvashatja, Gmail-token oszlopok column-revoked.

⚠️ A migrációk nem teljes baseline-t adnak: táblánkénti teljes RLS-állás csak az éles `pg_policies`-ból bizonyítható (166 szabály él).

### 3.4 Kulcs-triggerek (42 összesen)

`followups_assign_owner`, `leads_won_is_terminal`, `projects_link_lead_records`, `users_profile_guard`, `quote_items_calc`, `quote_items_after`, `quotes_discount_after`, `quotes_lock_guard`, `quotes_lock_delete_guard`, `quote_items_lock_guard`, `quotes_responsible_guard`, `quotes_status_guard`, `quotes_send_evidence_guard`, `ai_os_approval_immutable`.

### 3.5 Kulcs-RPC-k

Üzleti: `sales_mark_won_with_project` (tranzakcionális, contract-státusz + owner/sales-felelős + PM), `quote_create_draft`, `quote_new_version`, `quote_new_alternative`, `quote_lock_sent`, `quote_schedule_followup`, `quote_recalc_total`, `crm_record_search`, `crm_mailboxes`, `crm_mailbox_page`.
AI-jóváhagyás: `ai_os_approval_create/decide/finish`, `ai_os_daily_sales_read/claim/finish`, `ai_os_email_dispatch_claim`, `sales_*_approved_*` (6 db).

---

## 4. Üzleti folyamattérkép

```text
Webes űrlap ──HMAC──▶ quote_requests (read-only, NINCS lead-konverzió)
Marketing kézi lead ──▶ leads(new) ──▶ felelős-kiosztás ──▶ pipeline_entered_at
new → contacted → quote_prep → quote_sent → contract → won ──▶ projects(atadas)
  ↘ lost (bármikor, terminál)                    ↘ lost
Ajánlat: draft → ready → sent(Gmail-bizonyíték!) → negotiation → accepted/rejected/withdrawn
Projekt: atadas → felmeres → elokeszites → kivitelezes → muszaki_atadas → lezart (felfuggesztve)
```

| Átmenet | Indító | Feltétel | Blokkoló | Napló |
|---|---|---|---|---|
| Web→CRM | automatikus | HMAC+idempotencia | titok/payload | `quote_requests` |
| Lead→pipeline | emberi | `pipeline_entered_at` | – | `activities` |
| Lead→ajánlat | emberi | RLS+lead-zárolás | konkurens verzió | verzió-flags |
| Ajánlat→sent | emberi | Gmail-bizonyíték (`quote_sends`) | `quotes_send_evidence_guard` | `quote_sends` |
| Ajánlat→terminál | emberi | vissza draftba tiltva | – | utánkövetés auto-lezárul |
| Lead→won | emberi | contract+PM+nincs projekt | RPC validáció | `handoff_payload` |
| Won→projekt | automatikus | – | – | rekord-átkapcsolás |

**Kivételek:** hiányzó cég/kontakt → utánkövetés-insert trigger elutasít; sikertelen Gmail-küldés → `quote_sends` failed; bizonytalan küldés → nem jelöl sikert; duplikált webes beküldés → 200 duplicate.

---

## 5. AI-rendszer térkép

### 5.1 Központi modellkonfiguráció

`src/lib/ai-os/model-config.ts`: **mind a 9 agent** `gpt-6-astra`, OpenAI Responses API, reasoning `high`. Kivétel: Website Knowledge összefoglaló `gpt-4o-mini` (Chat Completions). Éles igazolás: `agent_runs` táblában 20 gpt-6-astra futás (2026-11-03).

### 5.2 Agentek

| Agent | Szerep | Eszköz-tartomány | Szerepkör |
|---|---|---|---|
| George | orchestrátor (deklaratív handoff, NEM futtat specialistát) | handoff, memória, keresés, cég/kontakt/projekt/lead, email-meta, KG, web | mind |
| Scarlet | marketing | olvasás: CRM+KG+web; nincs marketing-író eszköz | marketing+ |
| Timothy | sales | teljes CRM-olvasás + 7 jóváhagyásos írás + email-küldés | sales/owner |
| Boss | projekt/vezetői | olvasás: projekt/feladat/találkozó; nincs PM-író | owner |
| Michael | Google Ads | 15 olvasó + 5 író Ads-eszköz (owner-only) | owner |
| sales_briefing | napi sales riport | eszköz nélküli, cache-elt | sales/owner |
| pm_briefing | PM riport | eszköz nélküli, fix szekciók | PM/owner |
| crm_summary | szöveg-összefoglaló | eszköz nélküli | mind |
| research_companies | cégkutatás | eszköz nélküli, NINCS webes verifikáció | mind |

### 5.3 Eszköz-jegyzék (60+)

- **CRM-olvasás (15):** crm_search, crm_list_companies, crm_company_overview, crm_get_company, crm_list_company_contacts, crm_get_lead, crm_list_leads, crm_lead_history, crm_get_project, crm_list_projects, crm_list_company_email_threads, crm_list_followups, crm_list_tasks, crm_list_meetings, crm_sales_assignees.
- **Sales-írás (7, mind P0-jóváhagyásos):** sales_change_pipeline_status, sales_reassign_lead (owner), sales_set_lead_contact, sales_create_followup, sales_update_next_step, sales_record_prep_activity, sales_mark_won_with_project.
- **Ajánlat/intelligencia (5):** crm_list_quotes, crm_quote_context, crm_compare_quotes, crm_sales_case_review, crm_historical_unit_prices.
- **Gmail/dokumentum (6):** crm_sales_daily_priorities, crm_sales_watch, crm_email_mailboxes, crm_read_email_thread, crm_list_documents, crm_read_document; **sales_send_email** (P0, "MEGERŐSÍTEM").
- **KG (3):** kg_get_node, kg_find_related, kg_stats. **Weboldal (11):** website_* olvasók. **Ads (20):** 15 olvasó + pause/enable/budget/negative_keyword (confirm) + remove_campaign (dangerous).
- **Core (3):** handoff_to (deklaratív), memory_read, memory_write (csak George/Boss/Michael).

### 5.4 A modellválasz kódoldali beavatkozásai (fontos!)

| Beavatkozás | Viselkedés |
|---|---|
| Argumentum-elutasítás | Timothy olvasó ID-k kötelezően UUID; "me" elutasítva |
| Argumentum-javítás | lead-ID → cég-ID csere, ha a futásban megfigyelt (auditálva) |
| Dátum-lokalizálás | `*_at` mezők Budapest-időre a modell felé |
| Válaszcsere | ellentmondó Gmail/TESZT/kész-utánkövetés szöveg → teljes csere fenntartásra |
| Hibaüzenet-csere | blokkolt művelet → "nem ellenőrzött" szöveg |
| Ajánlatlink-szűrés | nem megfigyelt link → `[nem ellenőrzött ajánlathivatkozás]` |
| Eszközeredmény-tisztítás | technikai hibadetalok elrejtve a modell elől |
| Újrapróba | 1×, csak olvasó/dry-run hívásokra |

Ezek **heurisztikus védőkorlátok, nem általános tényellenőrzés**.

### 5.5 P0 jóváhagyási rendszer

`agent_run_steps`-ben: fagyasztott paraméterek + szerződés-hash + 30 perces lejárat + egyirányú állapotgép (`pending → executing/rejected/expired → succeeded/failed/unknown`). Veszélyes művelet: szerveroldali `MEGERŐSÍTEM`. Claim/finish RPC-k service-only. Ismeretlen kimenetel soha nem lesz siker.

---

## 6. Automatizmusok és időzítések

| Feladat | Indítás | Gyakoriság | Állapot |
|---|---|---|---|
| Gmail inkrementális szinkron | pg_cron → `POST /api/public/gmail/cron-sync` (x-cron-secret) | percenként | **ÉLESBEN AKTÍV** (cron.job active=true, igazolva) |
| Gmail teljes szinkron | kézi `/api/gmail/sync` vagy bootstrap | igény szerint | működik |
| Weboldal→CRM | webhook HMAC | eseményvezérelt | élesben igazolt (2 mp) |
| Weboldal-crawl | kézi / Netlify webhook | nincs ütemezés | **nincs automatikus futás** |
| Google Ads snapshot | kézi/eszközhívás | nincs ütemezés | **nincs automatikus futás** |
| Realtime UI-frissítés | Supabase postgres_changes | esemény | 8 tábla: leads, quotes, followups, projects, tasks, emails, email_threads, quote_sends |
| Napi sales briefing | első napi megnyitáskor claim | naponta 1×/user | működik (cache-elt) |

**Gmail cron részletek:** 3 párhuzamos worker, 50 mp admission-határ, csak `messageAdded` események; hibás üzenetnél a checkpoint akkor is előrelép (újrapróba nem garantált); auth-hiba → 24 óra retry. Inkrementális úton melléklet-letöltés NEM fut (csak bootstrapnál).

---

## 7. Jogosultsági térkép

### 7.1 Mátrix (alapértelmezett, DB-felülbírálás nélkül)

| Funkció | Owner | Sales | Marketing | PM |
|---|---|---|---|---|
| Irányítópult | ✓ | – | – | – |
| Lead írás | ✓ | csak saját (`assigned_to`) | létrehozás/átadás | – |
| Lead törlés | ✓ | – | – | – |
| Ajánlat olvasás | ✓ | saját lead | – | saját projekt |
| Ajánlat felelős-átadás | ✓ | – | – | – |
| Ajánlat küldés | ✓ | ✓ (saját) | – | – |
| Projektek | ✓ | olvas | olvas | ✓ |
| Jelenlét/kifizetés | ✓ (+payouts) | – | – | ✓ (payouts nélkül) |
| Weboldali kérések | ✓ | – | ✓ | – |
| Import-review, jogosultság-audit | ✓ | – | – | – |
| Beállítások (users, roles, ads, KG) | ✓ | – | – | – |
| Saját Gmail/profil | ✓ | ✓ | ✓ | ✓ |
| Michael (Ads AI) | ✓ | – | – | – |

### 7.2 Frontend vs backend eltérések

- Menü hard-kódolt; `route_permissions` DB-felülbírálás csak az oldalhozzáférésre hat, a menüre nem.
- `/help/owner` menüben owner-only, útvonalon mindenkinek nyitott.
- Google Ads OAuth start/callback: UI owner-only, de a végpontokon **nincs explicit owner-ellenőrzés** (kockázat!).
- RLS és UI szinkronban: sales lead-láthatóság (`leads_select_sales` = `assigned_to`), ajánlat-hozzáférés (`can_access_quote`).

---

## 8. Integrációs térkép

| Integráció | Irány | Hitelesítés | Feldolgozó | Napló |
|---|---|---|---|---|
| Supabase | kétirányú | RLS + service role | db-hooks, serverFn, RPC | activities, ai_action_log |
| Gmail sync | Google→CRM | OAuth refresh token + cron-secret | `sync.server.ts`, `sync-incremental.server.ts` | gmail_sync_runs |
| Gmail send | CRM→Google | bearer + saját postafiók-ellenőrzés | `send.server.ts` | emails, quote_sends |
| Weboldal | web→CRM | HMAC-SHA256, ±300 mp | `website-lead-sync.ts` | quote_requests |
| OpenAI | CRM→OpenAI | OPENAI_API_KEY (szerver) | `providers.server.ts` | agent_runs, website_ai_jobs |
| R2 (Cloudflare) | kétirányú | szerveroldali presign, RLS-ellenőrzés | `r2-upload.ts`, `r2.functions.ts` | dokumentum-táblák |
| Google Ads | kétirányú | OAuth + titkosított refresh token | `client.server.ts` | google_ads_change_log |
| Netlify | web→CRM | aláírás-ellenőrzés | `netlify-webhook.ts` | website_crawl_runs |

Titkok kezelése: Gmail-tokenek column-revoked (csak szerver), Ads refresh token titkosítva, HMAC/cron titkok Lovable Secrets-ben – **kivétel: a cron-secret literál a `database/` SQL-ben** (rotálandó).

---

## 9. Kód ↔ felület összevetés

Böngészős ellenőrzés ebben a körben nem történt (read-only kódaudit + korábbi körök böngészős eredményei). Korábban hitelesítve igazolt: Timothy chat (15/15 PASS gpt-6-astra), weboldal→CRM szinkron élőben, TESZT ajánlatküldés Gmail-lel, jóváhagyási kártyák desktop+mobil. Nem igazolt: Owner/Ramon teljes körű próba, minden gomb kattintása, mobil-only vezérlők.

---

## 10. Lefedettség-ellenőrzés, ismert hibák, kockázatok

### 10.1 Lefedettség

- 77 route fájl mindegyike leltározva ✓; 14 API-végpont ✓; ~55 szerverfüggvény ✓; 91 tábla/12 nézet/166 RLS élesben számolva ✓; 60+ AI-eszköz ✓; 6 automatizmus-család ✓.
- **Lefedettségi hiányok:** gombszintű visszakövetés a Today-komponensekben, marketing cégmunkalapon, globális keresőben/értesítésekben; per-metódus auth-audit minden Gmail-végpontra; éles `route_permissions` felülbírálások tartalma; nézetek security-invoker jellege (customer_kpi_v kivételével).

### 10.2 Ismert hibák / félkész funkciók

1. **Weboldali kérés → lead konverzió hiányzik** (18 rekord read-only).
2. **Gmail cron-secret a repóban** → rotáció.
3. **Google Ads OAuth-végpontok owner-ellenőrzés nélkül.**
4. **Inkrementális Gmail-szinkron nem tölti le a mellékleteket** (csak bootstrap).
5. **Hibás Gmail-üzenet checkpointje előrelép** → elveszhet újrapróba nélkül.
6. **George handoff csak deklaratív** – nem futtat specialistát.
7. **PM Briefing olvasási hibái csendben üres listát adnak** – a modell nem tudja megkülönböztetni a hibát az üres adattól.
8. **Sales Research nincs webes verifikáció** – a cégjavaslatok modell-állítások.
9. **Website Knowledge gpt-4o-mini-n maradt** (tudatos kivétel a 9 agentből).
10. **Michael promptja elavult** ("M4 nem hajt végre") – az adapter már végrehajt.

### 10.3 Használaton kívüli / duplikált elemek

- `/settings/openai` útvonal menüpont nélkül; `/followups`, `/sales/handoff` navigáció nélkül.
- `backup_pipeline_20261029`, `private_backup` archív táblák.
- `email_messages` vs `emails`, `agent_memories` vs `ai_memory` – történeti párhuzamosságok.

---

*Készült: 4 párhuzamos kódfeltérképező ágens + éles Supabase read-only lekérdezések. Adatmódosítás, email-küldés, publikálás nem történt.*
