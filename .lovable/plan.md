# Sales modul – Részletes technikai terv

A jelen dokumentum **csak terv**. Migráció, kód, séma változtatás nem történik addig, amíg jóvá nem hagyod. A meglévő `leads` táblát kiegészítjük (nem cseréljük), a Lead Workspace marad a felület alapja.

---

## 1) Üzleti folyamat (forrás-független)

```text
Lead (forrás bármi)
  -> Assigned To (értékesítő)
  -> Kapcsolat alatt
  -> Ajánlat előkészítés
  -> Ajánlat kiadva
  -> Utánkövetés
  -> Szerződés
  -> Megnyert  ----> Projekt átadás (PM)
        vagy
  -> Elveszett (ok kötelező)
```

Minden nyitott lead **kötelezően** rendelkezik: `assigned_to`, `next_step_type`, `next_step_due_at`. Kivétel csak `megnyert` és `elveszett`.

---

## 2) Adatmodell (terv, még nem migráció)

### 2.1 `leads` tábla — új mezők

| mező | típus | leírás |
|---|---|---|
| `assigned_to` | uuid FK `auth.users.id` | felelős értékesítő (kötelező, kivéve won/lost) |
| `assigned_at` | timestamptz | mikor lett kiosztva |
| `next_step_type` | text enum | lásd 2.3 |
| `next_step_due_at` | timestamptz | határidő |
| `next_step_note` | text | rövid leírás (opcionális) |
| `lost_reason` | text enum | csak `lost`-nál kötelező |
| `lost_note` | text | szabad szöveg |
| `last_activity_at` | timestamptz | trigger / view alapján számolt |
| `source` | text | meglévő — kiterjesztett enum (lásd lent) |
| `status` | text | szigorúbb enum (lásd 2.2) |

Új index: `(assigned_to, status)`, `(next_step_due_at)` ahol `status NOT IN ('won','lost')`.

### 2.2 Lead státusz enum (CHECK constraint a `status` mezőre)

```
new              -- forrás-független beérkezés, még nincs assigned_to
assigned         -- van assigned_to, nincs első kontakt
contacted        -- "Kapcsolat alatt"
quote_prep       -- "Ajánlat előkészítés"
quote_sent       -- "Ajánlat kiadva"
follow_up        -- "Utánkövetés"
contract         -- "Szerződés"
won              -- "Megnyert"  -> projekt átadás után is megmarad
lost             -- "Elveszett" -> lost_reason kötelező
```

Migrációs map a jelenlegi értékekről: `qualified -> quote_prep`, `converted -> won`. Backfill terv: létező sorokra `assigned_to = NULL` engedélyezett (legacy), új sorra trigger ellenőrzi.

### 2.3 `next_step_type` enum

```
phone, email, meeting, site_visit, doc_request,
quote_send, follow_up, other
```

### 2.4 `lost_reason` enum

```
price, chose_competitor, no_response, project_cancelled,
deadline_issue, bad_fit, other
```

### 2.5 `source` enum (forrás-független, de címkézve)

```
marketing_handoff, phone, web_form, email_inbound,
tender_invite, manual, referral, other
```

### 2.6 Új tábla — `lead_status_history`

| mező | típus |
|---|---|
| `id` | uuid PK |
| `lead_id` | uuid FK `leads.id` ON DELETE CASCADE |
| `from_status` | text |
| `to_status` | text |
| `changed_by` | uuid FK `auth.users.id` |
| `changed_at` | timestamptz default now() |
| `note` | text |

Triggerből töltjük (státuszváltáskor). Lehetővé teszi a folyamat-naplót, a "Megnyert / Elveszett" megerősítés audit-ját és az asszisztens visszaállíthatóságát.

### 2.7 Új tábla — `lead_quotes` (előkészítés a több ajánlatra)

Most **csak vázlat**, az ajánlatmodul külön körben épül. A `quotes` tábla már létezik — annyit teszünk hozzá, hogy a `leads.id` legyen a primer kapcsoló, és minden ajánlathoz tartozzon `version` (1, 2, 3…), `is_current` flag. Sales UI így természetesen tud V1/V2/V3-at listázni.

### 2.8 `projects` átadás

Új mezők a `projects`-en (vagy egy `project_handoff` JSON-blob): `lead_id`, `won_at`, `contract_url`, `start_date`, `handoff_notes`. `project` csak akkor jöhet létre, ha a forrás lead `status='won'`. DB szinten: ellenőrző trigger.

### 2.9 Aktivitás-források (`last_activity_at`)

Számolt mező — az alábbi események `MAX(created_at)`-jából:

- `emails` (lead_id alapján)
- `followups` (lead_id alapján, completed=true is)
- `lead_notes` / activity log bejegyzések
- `lead_status_history`

Megvalósítás: SQL `view` vagy `materialized` mező + trigger. Terv: **view** először (`v_lead_activity`), aggregálva — nem ront a write útvonalon.

---

## 3) Jogosultságok (RLS)

Szerepkörök: `admin`, `marketing`, `sales`, `pm` (a meglévő `user_roles` rendszerből, `has_role()` security definer).

| művelet | admin | marketing | sales | pm |
|---|---|---|---|---|
| `leads` SELECT | mind | mind | csak `assigned_to = auth.uid()` VAGY `status='new'` (kiosztatlan) | csak `status='won'` saját projekthez kötve |
| `leads` INSERT | igen | igen (handoff) | igen (manuális) | nem |
| `leads` UPDATE | igen | csak `status IN ('new','assigned')` és csak handoff mezők | csak saját (`assigned_to = auth.uid()`) | nem |
| `leads.assigned_to` átírás | igen | igen (átadáskor) | csak admin engedélyez újrakiosztást | nem |
| `status` → `won`/`lost` | igen | nem | igen | nem |
| `lead_status_history` | csak insert trigger | – | – | – |
| `projects` create from lead | igen | – | igen (csak `won` után) | – |

A `service_role` mindenhez kap GRANT-ot (szerver fn-ek).

---

## 4) Státusz-átmenet szabályok (alkalmazás + trigger)

Megengedett átmenetek:

```
new        -> assigned | lost
assigned   -> contacted | lost
contacted  -> quote_prep | follow_up | lost
quote_prep -> quote_sent | lost
quote_sent -> follow_up | contract | lost
follow_up  -> quote_sent | contract | lost
contract   -> won | lost
won        -> (terminal — csak projekt létrehozás)
lost       -> (terminal — admin újranyithatja)
```

Trigger ellenőrzi, ami nem engedélyezett, az hibát dob. Az asszisztens (AI) `won`/`lost`/`contract` átmenetnél **csak javaslatot** ad — a UI megerősítést kér.

---

## 5) UI oldalak

### 5.1 `/sales` dashboard (átszervezett `SalesHome`)

Egyszerű, "mi igényel ma figyelmet" elv. Sávok:

1. **Mai teendők** — saját nyitott lead-ek, ahol `next_step_due_at` ma
2. **Lejárt teendők** — `next_step_due_at < ma`
3. **Holnap esedékes**
4. Pipeline tile-ok (kattintható, szűr a Lead listán):
   - Nyitott (`new..follow_up`)
   - Ajánlat alatt (`quote_prep`, `quote_sent`)
   - Utánkövetés (`follow_up`)
   - Szerződés (`contract`)
   - Megnyert (utolsó 30 nap)
   - Elveszett (utolsó 30 nap)

Nem kerül rá: KPI, riport, vezetői grafikon.

### 5.2 Lead Workspace — marad a 3 oszlopos felület

- **Bal (lista):** szűrők — Assigned To (alap: én), státusz, lejárt teendő, forrás. Sor: cég, kapcsolat, státusz chip, `next_step` ikon + relatív határidő, `last_activity_at`.
- **Közép (detail):** lead fejléc + cég/kapcsolat + jegyzet + idővonal (status history, emailek, followup, hívás). Kötelező mezők (`assigned_to`, `next_step_type`, `next_step_due_at`) bannerként megjelennek, ha hiányoznak.
- **Jobb (akciók):** Email, Hívás, Followup, AI (Timothy), Ajánlat (több verzió listával), Státuszváltó. `won`/`lost` modális megerősítéssel.

### 5.3 Új modálisok / drawer-ek

- **"Átadás értékesítőnek" (marketing oldalon):** assigned_to picker — minden sales user + `active_lead_count` (lekérdezve `v_sales_user_load` view-ból), kötelező `next_step_type` + `next_step_due_at`. Csak ezekkel jön létre lead `status='assigned'`-del.
- **"Elveszett" dialog:** `lost_reason` enum + szabadszöveg.
- **"Megnyert / Projekt átadás" dialog:** kapcsolattartó, telefon, email, cím, projekt típus, dokumentumok, szerződés URL/feltöltés, kezdési dátum, megjegyzés → `projects` INSERT, `leads.status='won'`, redirect a projekt nézetre, értesítés PM-nek.
- **"Következő lépés" inline szerkesztő** a lead headerben.

### 5.4 AI asszisztens (Timothy) szerepe

Csak támogató. Dokumentum bekérés, email tervezet, jegyzet, következő lépés rögzítés. Üzleti lezárást (`won`/`lost`/`contract`) nem hajt végre saját kezűleg — kizárólag dialógusban kérheti a felhasználót a megerősítésre.

---

## 6) Átadási pontok

| honnan | hova | mit hoz létre | mi a megerősítés |
|---|---|---|---|
| Marketing Workspace | Sales lead | `leads` INSERT (`source='marketing_handoff'`, `status='assigned'`, `assigned_to`, `next_step_*` kötelező) | toast + értesítés az értékesítőnek |
| Manuális (sales) | Sales lead | `leads` INSERT (`source='manual'`) | – |
| Web form / email inbound | Sales lead | API endpoint → `leads` (`status='new'`, `assigned_to=NULL`) | admin/marketing osztja ki |
| Sales `won` | Projekt | `projects` INSERT + handoff payload, PM értesítés | kötelező handoff dialog |
| Sales `lost` | – | csak audit | `lost_reason` kötelező |

Értesítés: első körben `crm_notifications` táblába írunk (létezik); push/email későbbi kör.

---

## 7) Lekérdezések / view-k

- `v_sales_user_load` — minden sales user + aktív lead darab (`status NOT IN ('won','lost')`). A handoff dialog használja.
- `v_lead_activity` — lead_id, last_email_at, last_call_at, last_note_at, last_activity_at.
- `v_lead_overdue` — lejárt / mai / holnapi `next_step_due_at`-ek per `assigned_to`. A dashboard használja.

---

## 8) Regressziós határvonalak (mi NEM változik)

- Marketing modul (befagyasztva).
- Email modul (küldés, fogadás, csatolmány, thread).
- Cég / kapcsolat / dokumentum modulok.
- Lead Workspace 3-oszlopos váza — csak bővül.
- `quotes` tábla — csak előkészítjük a több verzió kezelést, magát az ajánlatmodult most nem nyúljuk.

---

## 9) Megvalósítás javasolt sorrendje (jóváhagyás után, külön körökben)

1. **DB**: enum CHECK constraintek, új mezők (`assigned_to`, `next_step_*`, `lost_reason`, `last_activity_at`), `lead_status_history` tábla + trigger, view-k, RLS finomítás, GRANT-ok. Backfill: meglévő státuszok map-elése.
2. **Handoff**: marketing oldal "Átadás értékesítőnek" dialog assigned_to + next_step kötelezővel, `v_sales_user_load` integrációval.
3. **Lead Workspace** kötelező mezők banner, next-step inline szerkesztő, status-átmenet engedélyek a UI-ban, `lost` dialog, `won` projekt-átadó dialog.
4. **Dashboard** átszervezése (mai/lejárt/holnap + pipeline tile-ok).
5. **AI asszisztens** megerősítés-flow (won/lost/contract).
6. **Regressziós ellenőrzés** a marketing → handoff → lead → projekt teljes láncon.

---

## 10) Nyitott kérdések jóváhagyás előtt

1. **Legacy lead-ek**: ha most van olyan `leads` sor, ahol `assigned_to=NULL` és nem `won`/`lost` — engedjük tovább élni "grandfathered" módon, vagy migrációkor adminnak kell kiosztani?
2. **Marketing átadás megfordítható-e?** Vagyis a sales visszadobhatja-e marketingnek a lead-et? (Most a tervben: nem; csak admin tudja `assigned_to`-t törölni / újrakiosztani.)
3. **Hívás-naplózás**: marad a jelenlegi `followups` `followup_type='call'` minta, vagy külön `calls` táblát szeretnél? (Most: marad.)
4. **Projekt létrejöttekor a lead státusza `won` marad, vagy átvált `project_started`-re?** Tervben: `won` marad, a kapcsolat a `projects.lead_id` mezőn keresztül látszik.

Jóváhagyás után 1) ponttal kezdem (DB), külön kérve megerősítést a backfill stratégiára.
