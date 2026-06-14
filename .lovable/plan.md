
# Sales UI v1 — váz (skeleton) terv

A végleges Sales Backend v1-re épülő, **csak struktúra** szintű UI. Cél: végigjárható
napi workflow oldalak, layoutok, státuszok, gombok, tabok, kártyák — komplex
automatizmusok, AI flow-k, valós mutációk és értesítések nélkül. A részletes
funkciók külön körökben jönnek (Sales UI v2, v3…).

## Szerepkörök és felelősségek

| Oldal / nézet           | Szerepkör a napi munkában          | Jelleg |
|------------------------ |----------------------------------- |--------|
| **Lead Workspace**      | **Operatív munkafelület**          | Aktív  |
| Dashboard               | Prioritás és KPI áttekintés        | Riport |
| Teendők                 | Napi belépési pont                 | Belépő |
| Lead lista              | Keresés és szűrés                  | Belépő |
| Ajánlatok               | Riport és verziókövetés            | Riport |
| Átadás                  | Riport és ellenőrzés               | Riport |

Minden tényleges művelet — státuszváltás, next-step szerkesztés, jegyzet,
ajánlatverzió létrehozása, projekt átadás — a **Lead Workspace-ben** történik.
A többi nézet csak navigációs, riport vagy ellenőrzési célt szolgál.

## Hatókör

Belekerül (váz szinten):
1. Sales Dashboard
2. Lead lista
3. Lead workspace (detail)
4. Teendők nézet (Today/Followups sales szemmel)
5. Ajánlatok nézet (váz)
6. Megnyert → Projekt átadás felület (váz)

NEM kerül bele ebben a körben:
- Valós státuszváltó mutációk és state machine guard-ok a UI-ban (csak gombok + diabled állapotok látszanak)
- `won` / `lost` confirm dialogok valódi írása
- AI asszisztens (`Timothy`) átalakítása
- Push / email értesítés
- Quote szerkesztő, PDF, küldés
- Auto-assign

## Útvonalstruktúra (TanStack Router, file-based)

Mind az `_authenticated` layout alá kerül. A meglévő `leads.index.tsx` és
`leads.$id.tsx` a Sales workspace alapja marad; mellé új sales-specifikus
oldalak.

```
src/routes/_authenticated/
  sales.index.tsx              -> /sales              Sales Dashboard
  sales.leads.tsx              -> /sales/leads        Lead lista (sales nézet)
  sales.todo.tsx               -> /sales/todo         Teendők (mai/lejárt/holnap)
  sales.quotes.tsx             -> /sales/quotes       Ajánlatok (váz)
  sales.handoff.tsx            -> /sales/handoff      Megnyert → Projekt átadás (váz)
  leads.$id.tsx                (meglévő, Lead workspace — sales tabokkal bővül)
```

A bal oldali navigációban új „Sales" csoport: Dashboard, Leadek, Teendők,
Ajánlatok, Átadás.

## Komponensfa (új fájlok, csak váz)

```
src/components/sales/
  sales-shell.tsx                  közös header (cím, szűrők, "Új lead" gomb)
  dashboard/
    pipeline-tiles.tsx             8 státusz tile (új…lost), darab + kattintható
    due-buckets-card.tsx           overdue / today / tomorrow / later
    my-load-card.tsx               saját aktív lead db + v_sales_user_load átlag
    recent-activity-card.tsx       v_lead_activity utolsó 10 esemény
  leads/
    lead-filters-bar.tsx           assigned_to (én/mind), státusz multi, source, bucket
    lead-row.tsx                   sor: cég, kontakt, státusz-chip, next_step ikon+due,
                                   last_activity_at, assigned_to avatar
    status-chip.tsx                8 státusz színkódolva (semantic tokens)
    next-step-cell.tsx             ikon (phone/email/meeting/…) + due badge
  workspace/
    lead-header.tsx                cég, kontakt, source, assigned_to picker (disabled)
    lead-status-stepper.tsx        state machine vizualizáció, aktuális kiemelve
    lead-tabs.tsx                  Áttekintés | Aktivitás | Ajánlatok | Átadás
    tab-overview.tsx               next_step blokk, lost_reason form (lost esetén)
    tab-activity.tsx               lead_status_history timeline + followups + emails lista
    tab-quotes.tsx                 quotes verziólista (read-only, version + is_current)
    tab-handoff.tsx                won állapot esetén "Projekt indítása" kártya
    action-bar.tsx                 Státuszváltás dropdown (engedélyezett átmenetek
                                   disabled-en megjelenítve), Won / Lost gomb (no-op)
  todo/
    todo-tabs.tsx                  Lejárt | Ma | Holnap | Később | Hiányzó next_step
    todo-row.tsx                   lead-link + next_step típus + due + cég
  quotes/
    quote-skeleton-list.tsx        leadenként csoportosított quote verziók
    quote-version-row.tsx          v1/v2…, is_current badge, státusz placeholder
  handoff/
    won-leads-list.tsx             won, még projekt nélkül
    handoff-skeleton-dialog.tsx    kötelező mezők preview (contact, tel, email, cím,
                                   doc URL, start_date, megjegyzés) — gombok no-op
```

Minden komponens csak **mock vagy egyszerű DB SELECT** adatból dolgozik
(`v_lead_activity`, `v_lead_due_buckets`, `v_sales_user_load`, `leads`,
`lead_status_history`, `quotes`). Mutációk nincsenek.

## Oldalak — tartalom váz

### 1) `/sales` — Sales Dashboard
- Felül: `pipeline-tiles` (8 státusz, click → `/sales/leads?status=…`)
- Bal: `due-buckets-card` (overdue piros, today amber, tomorrow, later)
- Jobb: `my-load-card` (saját aktív leadek, csapat-átlag a `v_sales_user_load`-ból)
- Alul: `recent-activity-card` (utolsó 10 státuszváltás / email / call)
- Header: „Új lead" gomb (jelenleg a meglévő `quick-create`-re mutat)

### 2) `/sales/leads` — Lead lista
- `lead-filters-bar`: alap szűrő = „assigned_to = én ÉS status NOT IN (won,lost)"
- Gyorsszűrők: „Kiosztatlan", „Kiosztva, nem kontaktált" (`status=new AND assigned_to IS NOT NULL`), „Lejárt next_step"
- Táblázat: `lead-row` komponensekkel. Kattintásra `/leads/$id`.
- Üres állapot kártya minden szűrőkombinációra.

### 3) `/leads/$id` — Lead workspace (bővítés)
- A meglévő layout marad (3 oszlop), a középső detail oszlopba új tab-rendszer:
  `Áttekintés | Aktivitás | Ajánlatok | Átadás`.
- `lead-status-stepper` a header alatt, a state machine sorrendben: new →
  contacted → quote_prep → quote_sent → follow_up → contract → won (lost külön).
- `action-bar`: státuszváltás dropdown a 4-es szekcióból (engedélyezett átmenetek
  enabled, többi disabled+tooltip). Won/Lost gombok megjelennek, kattintás nyit
  egy „hamarosan" toast-ot — nincs valós írás.
- `tab-overview`: next_step_type / next_step_due_at / next_step_note kártya
  (read-only most), figyelmeztető banner ha hiányzik. `lost` esetén lost_reason +
  lost_note kártya.
- `tab-activity`: `lead_status_history` timeline + meglévő followups/emails.
- `tab-quotes`: `quotes` lista `version DESC`, `is_current` badge.
- `tab-handoff`: `status='won'` esetén „Projekt indítása" CTA → `handoff-skeleton-dialog`.

### 4) `/sales/todo` — Teendők
- `todo-tabs` a `v_lead_due_buckets` alapján.
- Minden tab egy egyszerű listát ad: lead link, cég, next_step típus + due, állapot.
- 5. tab: „Hiányzó next_step" — open leadek `next_step_due_at IS NULL`-lal.

### 5) `/sales/quotes` — Ajánlatok (váz)
- Leadenként csoportosítva: `quote-skeleton-list`.
- Minden quote sor: verzió, is_current chip, létrehozás dátuma, összeg placeholder.
- Header: „Új ajánlat" gomb disabled + tooltip „Quote modul: hamarosan".

### 6) `/sales/handoff` — Megnyert → Projekt átadás (váz)
- `won-leads-list`: `status='won'` ÉS nincs hozzá `projects.lead_id`.
- Sor végén „Projekt indítása" → `handoff-skeleton-dialog`.
- A dialog megmutatja a kötelező handoff_payload mezőket (contact, tel, email,
  cím, doc URL, start_date, megjegyzés) — minden mező read-only placeholder,
  „Létrehozás" gomb disabled + tooltip „Hamarosan".

## Státuszok és színek (semantic tokens)

A 8 státusz egységes színkódolása a `status-chip.tsx`-ben, `src/styles.css`-ben
új tokenek (HSL alapú, nem hardcoded osztály):

```
--status-new, --status-contacted, --status-quote-prep, --status-quote-sent,
--status-follow-up, --status-contract, --status-won, --status-lost
```

Due bucket színek:
```
--due-overdue  (piros)
--due-today    (amber)
--due-tomorrow (kék)
--due-later    (muted)
```

Minden komponens ezeket használja, soha nem közvetlen hex / Tailwind szín.

## Navigáció és sidebar

`src/components/app-sidebar.tsx`: új „Sales" csoport, csak `sales` és `admin`
szerepkörnek látszik (`use-permissions` alapján). Items:
- Dashboard → `/sales`
- Leadek → `/sales/leads`
- Teendők → `/sales/todo`
- Ajánlatok → `/sales/quotes`
- Átadás → `/sales/handoff`

A meglévő „Leads" menüpont marad (az általános lead workspace-re), a Sales
csoport ennek a szerepkör-specifikus belépője.

## Adat-hozzáférés

- Csak SELECT-ek, közvetlenül a Supabase kliensből (`@/integrations/supabase/client`).
- Forrásnézetek: `v_lead_activity`, `v_lead_due_buckets`, `v_sales_user_load`,
  `leads`, `lead_status_history`, `quotes`, `projects` (won handoff listához).
- Nincs új createServerFn ebben a körben.
- Loading: skeleton komponensek minden kártyán / sorlistán.
- Üres állapot: minden listának saját üres-kártyája magyar copy-val.

## Mit NEM csinálunk most (kifejezetten)

- Nincs valódi UPDATE `leads.status`-on a UI-ból (csak a meglévő detail oszlop
  mutáció marad, sales action-bar gombjai no-op + toast).
- Nincs valódi INSERT `projects`-be a handoff dialogból.
- Nincs valódi quote create / edit.
- Nincs auto-assign, nincs SLA push, nincs AI ajánlás.
- Nincs reszponzív mobil finomhangolás (desktop-first váz; mobil később).
- Nincs i18n bővítés a magyar copy-n túl.

## Jóváhagyás után az implementáció lépései

1. Sidebar + 5 új útvonalfájl (üres shell + `sales-shell.tsx`).
2. Semantic tokenek (`src/styles.css`) + `status-chip`, `next-step-cell`,
   `due-bucket` komponensek.
3. Lead lista + filters bar (DB SELECT-tel, mutáció nélkül).
4. Sales dashboard 4 kártya.
5. Lead workspace tab-rendszer (4 tab) + status stepper + action-bar (no-op).
6. Todo oldal + Quotes váz + Handoff váz.
7. Manuális end-to-end végigjárás minden szerepkörrel (admin / sales /
   marketing / pm) — csak vizuális/navigációs check, mutáció nem fut.

A backend specifikációtól nem térünk el; a UI a 8 státuszt, a state machine
átmeneteket, a `next_step_*` / `lost_*` mezőket és a `won → projekt` szabályt
pontosan a backend szerint vizualizálja, akkor is, ha most még nem ír.
