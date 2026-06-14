# Sales modul – Végleges backend terv

Jóváhagyott döntések beépítve:
- Legacy lead-ek grandfathered módon maradhatnak (`assigned_to NULL` engedélyezett a régieken, új sorra trigger kötelez)
- Marketing → sales átadás egyirányú
- Hívás-naplózás marad `followups.followup_type='call'`
- `won` terminal állapot, projekt létrejötte után is `won`
- **`assigned` mint külön státusz ELHAGYVA** — indoklás: az „kiosztva, még nem kontaktált" állapot pontosan kifejezhető `status='new' AND assigned_to IS NOT NULL`-lal. Egy állapottal kevesebb a state machine-ben, kevesebb a migrációs hibalehetőség, és a dashboard / lista szűrése továbbra is egyértelmű (lásd 4. szakasz). Eggyel kevesebb szabály, eggyel kevesebb átmenet.

---

## 1) Adatmodell – végleges

### 1.1 `leads` tábla — új oszlopok

| oszlop | típus | NULL | default | megkötés |
|---|---|---|---|---|
| `assigned_to` | uuid | igen (legacy) | – | FK `auth.users(id) ON DELETE SET NULL` |
| `assigned_at` | timestamptz | igen | – | trigger állítja, amikor `assigned_to` először nem-NULL lesz |
| `next_step_type` | text | igen | – | CHECK enum (lásd 1.4) |
| `next_step_due_at` | timestamptz | igen | – | – |
| `next_step_note` | text | igen | – | – |
| `lost_reason` | text | igen | – | CHECK enum (lásd 1.5); kötelező ha `status='lost'` |
| `lost_note` | text | igen | – | – |
| `last_activity_at` | timestamptz | igen | – | view-ban számolt (nem oszlop) — lásd 1.7 |
| `won_at` | timestamptz | igen | – | trigger állítja `status='won'`-ra váltáskor |
| `lost_at` | timestamptz | igen | – | trigger állítja `status='lost'`-ra váltáskor |

Megjegyzés: `last_activity_at` mégsem fizikai oszlop, hanem `v_lead_activity` view-ban számolt — kevesebb write-overhead.

### 1.2 `leads` — meglévő oszlopokra hozzáadott megkötések

```text
status CHECK IN (
  'new','contacted','quote_prep','quote_sent',
  'follow_up','contract','won','lost'
)

source CHECK IN (
  'marketing_handoff','phone','web_form','email_inbound',
  'tender_invite','manual','referral','other'
)
```

Új sorokra (trigger BEFORE INSERT OR UPDATE):
- ha `status NOT IN ('won','lost')` és új sor / `status` változott / `assigned_to` változott → `assigned_to IS NOT NULL` kötelező
- ha `status NOT IN ('won','lost')` → `next_step_type IS NOT NULL` és `next_step_due_at IS NOT NULL` kötelező
- ha `status='lost'` → `lost_reason IS NOT NULL` kötelező
- legacy kivétel: ha a sor `created_at < migration_cutoff_ts` és NEM most változott a státusz vagy assigned_to → nem dobunk hibát (grandfathering)

### 1.3 Indexek

```
idx_leads_assigned_status        ON leads(assigned_to, status)
idx_leads_open_next_due          ON leads(next_step_due_at)
                                  WHERE status NOT IN ('won','lost')
idx_leads_status_created         ON leads(status, created_at DESC)
idx_leads_company                ON leads(company_id)   -- ha még nincs
```

### 1.4 `next_step_type` enum értékek

```
phone, email, meeting, site_visit, doc_request,
quote_send, follow_up, other
```

### 1.5 `lost_reason` enum értékek

```
price, chose_competitor, no_response, project_cancelled,
deadline_issue, bad_fit, other
```

### 1.6 Új tábla — `lead_status_history`

```text
id           uuid PK default gen_random_uuid()
lead_id      uuid NOT NULL FK leads(id) ON DELETE CASCADE
from_status  text
to_status    text NOT NULL
changed_by   uuid FK auth.users(id) ON DELETE SET NULL
changed_at   timestamptz NOT NULL default now()
note         text

INDEX (lead_id, changed_at DESC)
```

Triggerrel töltjük `AFTER UPDATE OF status` / `AFTER INSERT` (új sornál `from_status=NULL`).

### 1.7 Új view — `v_lead_activity`

`lead_id, last_email_at, last_call_at, last_followup_at, last_note_at, last_status_change_at, last_activity_at` — LEFT JOIN-okból `emails`, `followups` (call vs egyéb), `activity_log` (vagy `crm_notes`, amelyik létezik), `lead_status_history`.

### 1.8 Új view — `v_sales_user_load`

```
user_id, full_name, email, active_lead_count
```

A `user_roles` táblából `role='sales'` user-ek + `LEFT JOIN leads ON assigned_to AND status NOT IN ('won','lost')` aggregálva.

### 1.9 Új view — `v_lead_due_buckets`

`lead_id, assigned_to, bucket ('overdue'|'today'|'tomorrow'|'later')` — a dashboard használja.

### 1.10 `quotes` előkészítés (csak `lead_id` + verziózás, az ajánlatmodul külön kör)

```
ALTER TABLE quotes
  ADD COLUMN lead_id    uuid FK leads(id) ON DELETE SET NULL,
  ADD COLUMN version    int NOT NULL default 1,
  ADD COLUMN is_current boolean NOT NULL default true;

INDEX (lead_id, version DESC)
PARTIAL UNIQUE (lead_id) WHERE is_current   -- max 1 current verzió leadenként
```

A `quotes` UI most nem változik — csak a séma kibővül, hogy a sales modul többverziós listázásra kész legyen.

### 1.11 `projects` átadás

```
ALTER TABLE projects
  ADD COLUMN lead_id        uuid FK leads(id) ON DELETE SET NULL,
  ADD COLUMN handoff_payload jsonb,     -- kapcsolat, tel, email, cím, doc, szerződés URL, start_date, megjegyzés
  ADD COLUMN handoff_at      timestamptz;

INDEX (lead_id)
```

Trigger: `INSERT INTO projects` csak akkor megy át, ha `lead_id IS NULL` (legacy) VAGY a hivatkozott lead `status='won'`.

---

## 2) Migrációs sorrend (egy migrációs file, fail-safe-ben sorrendezve)

`database/2026-06-23_sales_module_v1.sql`:

```text
1.  ENUM CHECK constraintek elejtés, ha létezik régi (DROP IF EXISTS)
2.  leads: új oszlopok hozzáadása (nullable, default nélkül)
3.  Backfill (data, nem szerkezet):
       UPDATE leads SET status='quote_prep' WHERE status='qualified';
       UPDATE leads SET status='won'        WHERE status='converted';
       UPDATE leads SET won_at = COALESCE(won_at, updated_at)  WHERE status='won';
       UPDATE leads SET lost_at = COALESCE(lost_at, updated_at) WHERE status='lost';
       UPDATE leads SET assigned_at = COALESCE(assigned_at, created_at)
         WHERE assigned_to IS NOT NULL;
4.  leads: CHECK constraintek hozzáadása (status, source) — NOT VALID, majd VALIDATE
5.  leads_business_rules trigger (BEFORE INSERT OR UPDATE)
       — legacy_cutoff_ts = most() értéke beégetve a fn body-ban
6.  leads_status_history trigger (AFTER INSERT / AFTER UPDATE OF status)
7.  lead_status_history tábla létrehozása (a 6. trigger ezt használja)
       — sorrend: a táblát a triggernél korábban kell létrehozni; sorrend a fájlban: 1->2->3->4->7->5->6
8.  quotes: új oszlopok + index
9.  projects: új oszlopok + index + handoff trigger
10. views: v_lead_activity, v_sales_user_load, v_lead_due_buckets
11. indexek (1.3 szerint)
12. RLS politikák módosítása (lásd 3.)
13. GRANT-ok (lásd 3.)
14. crm_notifications események: új típusok regisztrálása, ha enum létezik
```

**Backfill cutoff**: a migráció elején `SELECT now()` érték kerül a trigger fn-be konstansként (legacy határ). Ettől későbbi insert/update szigorú szabályokkal megy.

---

## 3) Jogosultsági modell (RLS)

Szerepkörök a meglévő `user_roles` táblából, `has_role(uuid, app_role)` security definer fn-nel. Új role nem szükséges — `sales`, `marketing`, `admin`, `pm` már létezik.

### 3.1 `leads` politikák (DROP + CREATE)

| policy | for | role | using / with check |
|---|---|---|---|
| `leads_select_admin`     | SELECT | authenticated | `has_role(auth.uid(),'admin')` |
| `leads_select_marketing` | SELECT | authenticated | `has_role(auth.uid(),'marketing')` |
| `leads_select_sales`     | SELECT | authenticated | `has_role(auth.uid(),'sales') AND (assigned_to = auth.uid() OR assigned_to IS NULL OR status = 'new')` |
| `leads_select_pm`        | SELECT | authenticated | `has_role(auth.uid(),'pm') AND EXISTS (SELECT 1 FROM projects p WHERE p.lead_id = leads.id)` |
| `leads_insert_mkt_sales` | INSERT | authenticated | `has_role('admin') OR has_role('marketing') OR has_role('sales')` |
| `leads_update_admin`     | UPDATE | authenticated | admin: bármi |
| `leads_update_mkt`       | UPDATE | authenticated | marketing: csak `status IN ('new')` rekordra, kizárólag handoff mezők (assigned_to, next_step_*, source, contact_id, company_id, summary, project_type) — alkalmazás szintű ellenőrzés trigger-ben is |
| `leads_update_sales`     | UPDATE | authenticated | sales: `assigned_to = auth.uid()`; `won`/`lost` átmenetet csak sales+admin tehet |

### 3.2 `lead_status_history`

```
RLS ON
SELECT: admin VAGY marketing VAGY sales (a lead látható rekordjaira)
INSERT/UPDATE/DELETE: tilos (csak trigger ír — SECURITY DEFINER fn)
GRANT SELECT ON public.lead_status_history TO authenticated;
GRANT ALL    ON public.lead_status_history TO service_role;
```

### 3.3 view-k

A view-k `security_invoker = true`-val készülnek, hogy a hívó RLS-e érvényesüljön. GRANT SELECT az `authenticated` és `service_role` szerepkörnek mindhárom view-ra.

### 3.4 `projects` handoff

`INSERT` jogosultság: admin + sales (eddig is létezett). A handoff trigger ellenőrzi a `lead_id` → `status='won'` szabályt; nem RLS-szintű.

### 3.5 `quotes`

Új oszlopok nem indokolnak új politikát; a meglévő `quotes` RLS marad. (Az ajánlatmodul külön körében felülvizsgáljuk.)

---

## 4) Státusz state machine

```
new        -> contacted | lost                     (kiosztás csak assigned_to-val)
contacted  -> quote_prep | follow_up | lost
quote_prep -> quote_sent | lost
quote_sent -> follow_up | contract | lost
follow_up  -> quote_sent | contract | lost
contract   -> won | lost
won        -> (terminal)
lost       -> (terminal; admin újranyithatja `new`-re)
```

A „kiosztva, még nem kontaktált" nézet a UI-ban:
```sql
WHERE status = 'new' AND assigned_to IS NOT NULL
```
A „beérkezett, kiosztatlan" nézet:
```sql
WHERE status = 'new' AND assigned_to IS NULL
```

Trigger ellenőrzi: ha `from='new'` és `to='contacted'`, csak akkor engedi, ha `assigned_to IS NOT NULL`.

---

## 5) Érintett képernyők (csak feltérképezés, nem fejlesztés)

| képernyő | fájl | változás |
|---|---|---|
| Sales dashboard | `src/components/today/sales-home.tsx` | mai/lejárt/holnap blokk + 6 pipeline tile (DB view alapján) |
| Lead Workspace lista | `src/components/lead-workspace/lead-list-column.tsx` | szűrők: assigned_to (alap: én), státusz, lejárt; sor kibővítés `next_step` ikonnal és `last_activity_at`-tel |
| Lead Workspace detail | `src/components/lead-workspace/lead-detail-column.tsx` | kötelező mezők banner, next_step inline szerkesztő, státusz dropdown a state machine alapján |
| Lead Workspace akciók | `src/components/lead-workspace/lead-action-panel.tsx` | `won`/`lost` modális megerősítés; quote-lista verziókkal (read-only most) |
| Lead handoff (marketing) | `src/components/lead-workspace/lead-handoff-panel.tsx` | assigned_to picker + load count, kötelező next_step mezők |
| Marketing workspace | `src/components/marketing/marketing-workspace.tsx` | a meglévő handoff onClick átirányítva az új dialogba |
| Projekt létrehozás | új komponens: `src/components/lead-workspace/project-handoff-dialog.tsx` | `won` váltás kiváltja |
| Új lead form | `src/components/today/quick-create.tsx` | sales mode-ban kötelező assigned_to + next_step |
| Followups oldal | `src/routes/_authenticated/followups.tsx` | szűrőhöz `assigned_to`; egyébként változatlan |

A meglévő AI sheet (`Timothy`) viselkedését nem írjuk át backendben, csak a 6. lépésben (frontend, megerősítés-flow).

---

## 6) Regressziós kockázatok

| terület | kockázat | mitigáció |
|---|---|---|
| Legacy lead-ek | szigorú trigger eldobja az old sorok update-jét | `created_at < migration_cutoff_ts` esetén kivétel; explicit teszt egy backfill-elt sor szerkesztésére |
| Marketing handoff | a meglévő `handoff` insert már nem érvényes (hiányzik `assigned_to`, `next_step_*`) | a marketing UI cseréje előtt a régi gomb tiltása csak az új dialóggal egyidejűleg |
| `qualified` és `converted` státusz | UI helyenként hard-coded értéket vár | grep és csere a migráció előtt: `lead-detail-column.tsx`, `lead-action-panel.tsx`, dashboard widget-ek, marketing pipeline mapper, `marketing-status.ts` |
| `quotes` séma | `version` + `is_current` default-ok régi sorokra | backfill: `UPDATE quotes SET version=1, is_current=true` ahol NULL |
| RLS sales SELECT | sales user most látja az összes lead-et, az új politika szűkíti | átállás előtt szerepkör-audit; admin user-ek nem érintettek |
| projekt létrehozás | meglévő `/projects` create flow most `lead_id` nélkül megy → a handoff trigger megengedi (`lead_id IS NULL`) | nincs törés |
| followups | nincs séma változás | – |
| email modul | nincs séma változás | – |
| dokumentum / csatolmány | nincs séma változás | – |
| `v_lead_activity` performancia | nagy `emails` tábla join | LATERAL JOIN limit 1 + meglévő indexek; mérés a migráció után |
| `auth.users` join view-kban | RLS-érzékeny | view `security_invoker=true`, a `v_sales_user_load` mezői: csak `id`, `email`, `raw_user_meta_data->>'full_name'` |

### Regressziós checklist (kötelező a fejlesztés végén)

```
[ ] Marketing átadás (új dialog)
[ ] Új lead manuálisan
[ ] Új lead web form (API)
[ ] Lead lista (sales saját + admin minden)
[ ] Lead megnyitás
[ ] Státuszváltás engedélyezett átmenetek
[ ] Státuszváltás tiltott átmenet (hibajelzés)
[ ] won → projekt átadó dialog → projects insert
[ ] lost dialog + lost_reason kötelező
[ ] Email küldés / fogadás / csatolmány (változatlan)
[ ] Followup létrehozás, hívás-log (változatlan)
[ ] Dashboard mai/lejárt/holnap
[ ] Legacy lead szerkesztése nem dob hibát
```

---

## 7) Miért nincs külön `assigned` státusz – döntés indoklása

- A „kiosztva, még nem kontaktált" csak két szempontból érdekes: lista-szűrés és dashboard tile. Mindkettő pontosan kifejezhető `status='new' AND assigned_to IS NOT NULL`-lal.
- Egy állapottal kevesebb → eggyel kevesebb engedélyezett átmenet, eggyel kevesebb migrációs map-elés, és a marketing→sales átadás után a sales első érdemi művelete (`contacted`-be váltás) tisztán látszik.
- Reporting szempontból a kiosztás tényét az `assigned_at` timestamp és a `lead_status_history` (insert sor) együtt fedi le; nem veszítünk auditálhatóságot.

---

## 8) Mit nem tartalmaz ez a kör

- Ajánlatmodul UI (`quotes` séma kibővül, de a UI érintetlen)
- KPI / riport / vezetői dashboard
- Push / email értesítés (csak `crm_notifications` insert)
- Automatikus lead-kiosztás (kézi marad)
- AI asszisztens önálló döntéshozatal

---

Várom a jóváhagyásodat erre a backend tervre. Jóváhagyás után az 1. lépés a 2. szakasz szerinti migrációs fájl elkészítése lesz, semmi más — és csak utána jön a frontend.
