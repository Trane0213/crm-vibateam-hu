## Lead Workspace V2 — gap analízis és terv

A jóváhagyott szerepkör-elosztás szerint a **Lead Workspace** az egyetlen helye minden értékesítési műveletnek. A jelenlegi `/leads/$id` oldal a backend v1 struktúrából csak részben olvas, és gyakorlatilag **semmit nem ír**. Ez az iteráció ezt zárja le — új oldalak nélkül, kizárólag a workspace-en belül.

---

### 1. Gap analízis — backend v1 mezők támogatása

Jelzések: ✅ használva (olvasás + írás), 🟡 csak olvasva, 🔵 csak UI placeholder, ❌ hiányzik.

| Mező / entitás | Állapot | Részletek |
|---|---|---|
| `assigned_to` | 🟡 | Header `KeyFact` UUID-rövidítést mutat, nincs név, nincs assign picker, nincs „magamhoz veszem" gomb |
| `assigned_at` | 🟡 | Adatok kártyán formázva, írás nincs (auto a backend trigger felelőssége) |
| `next_step_type` | 🟡 | Header + Áttekintés kártya read-only, nincs szerkesztő |
| `next_step_due_at` | 🟡 | Read-only kijelzés, nincs date/time picker, nincs „kész / halaszt" akció |
| `next_step_note` | 🟡 | Read-only szöveg, nincs inline szerkesztés |
| `lost_reason` | 🟡 | Csak `status='lost'` esetén jelenik meg, nincs választó a Lost flow-ban |
| `lost_note` | 🟡 | Olvasva, nem írható |
| `won_at` | ❌ | Sehol nincs megjelenítve, nincs Won confirm |
| `lost_at` | ❌ | Sehol nincs megjelenítve |
| `lead_status_history` | 🟡 | Aktivitás tab listázza (from→to, changed_at), `changed_by` nincs feloldva névre |
| `quotes` (`version`, `is_current`) | 🟡 | Ajánlatok tab listáz, link megnyitásra; nincs „új verzió", nincs `set current` |
| `projects` handoff (`handoff_at`, `handoff_payload`) | 🔵 | Tab csak `/sales/handoff` oldalra dob; sem `handoff_at`, sem `handoff_payload` nem jelenik meg, és a workspace nem tud projektet indítani |
| Státuszváltás (state machine) | 🔵 | `LeadActionBar` mutatja az engedélyezett átmeneteket, de minden gomb `toast.info("hamarosan")` — **nincs valós UPDATE** |
| `STATUS_TRANSITIONS` guard | ✅ | Konstans és UI-tiltás kész |
| `assigned_to` lookup (név) | ❌ | Nincs `useLookup("profiles","display_name")` használat |
| `v_lead_activity` view | ❌ | Workspace-en nem használjuk (Dashboard használja) |

**Összegzés:** a workspace ma egy szépen strukturált *olvasó* nézet. Az operatív munkához három dolog hiányzik: (a) **next-step szerkesztés**, (b) **valódi státuszváltás** confirm dialogokkal (Won / Lost / általános), (c) **handoff indítás helyben**.

---

### 2. Lead Workspace V2 — cél

Minden napi értékesítési művelet itt történjen meg, mutációkkal együtt, a backend v1 állapotgépét és mező-szabályait pontosan betartva. Más oldalak (Dashboard, Todo, Leads, Quotes, Handoff) változatlanul csak belépési pont / riport maradnak — kódot rajtuk nem módosítunk.

---

### 3. Hatókör (mit építünk meg ebben az iterációban)

**A) Header és státuszsáv**
- `assigned_to` feloldása névre (`profiles.display_name`); ha nincs név, fallback rövid UUID.
- `won_at` / `lost_at` megjelenítése a `KeyFact` sávban, ha a státusz `won` / `lost`.
- `LeadStatusStepper` változatlan, csak a `lost` ágat jelölje meg vizuálisan, ha aktív.

**B) Action Bar — valós mutációk**
- Általános **státuszváltás** dropdown: a `STATUS_TRANSITIONS`-ben engedélyezett célok élesek, többi disabled tooltip-pel.
- **Megnyerés** gomb → `WonConfirmDialog` (csak akkor enabled, ha `contract → won` engedélyezett). Megerősítésre: `status='won'`, `won_at=now()`. A `lead_status_history` rekordot a meglévő backend trigger írja.
- **Elveszett** gomb → `LostConfirmDialog`: kötelező `lost_reason` (select a `LOST_REASONS`-ből), opcionális `lost_note`. Mentésre: `status='lost'`, `lost_at=now()`, `lost_reason`, `lost_note`.
- Minden mutáció `useMutation` + `queryClient.invalidateQueries(['leads','detail',id])` + `['lead-status-history',id]`. Optimista frissítés nincs (állapotgép biztonság).

**C) Next-step inline szerkesztő**
- Az Áttekintés tab „Következő lépés" kártyája szerkeszthetővé válik:
  - `next_step_type` select (`NEXT_STEP_LABEL`),
  - `next_step_due_at` datetime input,
  - `next_step_note` textarea.
- Két gomb: **Mentés** (`UPDATE leads SET next_step_*`), **Töröl** (mindhárom mező `NULL`).
- Quick-actions: „Ma délután 16:00", „Holnap 9:00", „+3 nap" — csak `due_at`-ot állítják.
- A „nincs következő lépés" amber banner megmarad, amíg üres.

**D) Aktivitás tab**
- `changed_by` feloldása `profiles.display_name`-re.
- Sor mellé esemény ikon (státusz-bázisú szín).
- Megmarad limit 50.

**E) Ajánlatok tab**
- Új gomb: **„Új verzió"** — `INSERT INTO quotes (lead_id, version = max+1, is_current=true)`, korábbi `is_current=false` (egy tranzakció: `createServerFn` `mutateQuoteCurrent`).
- Sor végén **„Aktuálissá tesz"** gomb (nem-aktuálison) — ugyanaz a serverFn `set_current` módban.
- Mindkét akció csak akkor enabled, ha a lead `status` ∈ {quote_prep, quote_sent, follow_up, contract}.

**F) Átadás tab**
- Csak `status='won'` esetén aktív.
- Ha **van** kapcsolódó `projects` rekord: olvasott projekt-kártya `handoff_at` és a `handoff_payload` strukturált megjelenítésével (contact, tel, email, cím, doc URL, start_date, megjegyzés). Link a projektre.
- Ha **nincs**: helyben nyíló `HandoffDialog` (a `handoff-skeleton-dialog`-ból teljes form), kötelező mezők validációval. Mentés: `INSERT projects (lead_id, title, status='planned', handoff_at=now(), handoff_payload=jsonb)` — `createServerFn` `createProjectFromLead`.
- A `/sales/handoff` oldalra mutató link megmarad listanézetnek, de a tényleges átadás itt történik.

**G) Vizuális egységesítés**
- Semantic tokenek (`--status-*`, `--due-*`) bevezetése `src/styles.css`-ben (eddig direkt Tailwind színek a `LEAD_STATUS_TONE`-ban). Az új tokeneket a `StatusChip` és a stepper használja. Más oldalakon a meglévő utility-osztályok érintetlenül maradnak.

---

### 4. Hatókörön kívül (nem most)

- Auto-assign, SLA push, email/Slack értesítés.
- Quote PDF, küldés, AI generálás.
- Lead lista / Dashboard / Todo / Quotes / Handoff oldalak átalakítása — kódot nem nyitunk meg rajtuk.
- Mobil reszponzív finomhangolás.
- `lead_status_history` manuális szerkesztés (csak trigger írja).

---

### 5. Technikai részletek

- Új `createServerFn` modulok (`requireSupabaseAuth` middleware-rel):
  - `src/lib/sales/lead-mutations.functions.ts` — `updateLeadStatus`, `updateNextStep`, `clearNextStep`, `markLeadWon`, `markLeadLost`.
  - `src/lib/sales/quote-mutations.functions.ts` — `createQuoteVersion`, `setCurrentQuote`.
  - `src/lib/sales/handoff.functions.ts` — `createProjectFromLead` (validálja a `handoff_payload` kötelező mezőit Zoddal, ellenőrzi `lead.status='won'`-t és hogy nincs még projekt).
- Kliens-side `useMutation` minden gomb mögött; közös `invalidateLeadCaches(id)` helper.
- Új komponensek: `WonConfirmDialog`, `LostConfirmDialog`, `NextStepEditor`, `HandoffDialog` (a meglévő skeleton kibővítve), `AssigneeName` (profilnév lookup).
- Engedélyezés: minden mutáció ellenőrzi a `STATUS_TRANSITIONS`-t szerver oldalon is (UI guard + backend guard).
- `quotes.is_current` egyértelműsége: a `createQuoteVersion` és `setCurrentQuote` egyetlen tranzakcióban frissít (RPC vagy két UPDATE `auth` user kontextusban).
- A `handoff_payload` JSON sémája Zod-ban definiált, és a `HandoffDialog` form ugyanazt használja.

---

### 6. Akceptancia kritériumok

- Egy `new` leadből a workspace-ből végig lehet menni `contacted → quote_prep → quote_sent → contract → won` útvonalon, **nem nyitva meg másik oldalt**.
- A Won confirm után a workspace-ben azonnal látszik a `won_at` és az Átadás tab aktívvá válik.
- A HandoffDialog mentése után a `projects` rekord létrejön, a tab read-only riport módra vált.
- A Lost confirm után a `lost_reason` + `lost_note` kártya megjelenik, a státusz dropdown bezárul.
- A next-step szerkesztő mentés után frissíti a header `KeyFact`-eket és az Áttekintés kártyát egy lekérdezésen belül.
- Új ajánlat verzió létrehozása után az előző `is_current=false`, az új `true`.
- Tiltott állapotátmenetnél a UI gomb disabled, a serverFn 4xx-szel utasít vissza.

---

## Lead Workspace V2 — implementáció státusza

Megvalósítva ebben az iterációban:

- **Header**: `assigned_to` névfeloldás `users_profile`-ból (`useAssigneeLookup`), `won_at` / `lost_at` `KeyFact` megjelenés.
- **Action bar (`lead-action-bar.tsx`)**: valós `UPDATE leads` mutáció a státuszváltáshoz, a `STATUS_TRANSITIONS` szerint disabled/enabled. Won/Lost külön gombok dialogokat nyitnak.
- **WonDialog**: `status='won'` megerősítés (trigger állítja a `won_at`-ot).
- **LostDialog**: kötelező `lost_reason` + opcionális `lost_note`, `status='lost'` mentés (trigger állítja a `lost_at`-ot).
- **NextStepEditor**: inline szerkesztő (`next_step_type` / `next_step_due_at` / `next_step_note`), quick-actions („Ma 16:00", „Holnap 9:00", „+3 nap"), Mentés és Lépés törlése.
- **Aktivitás tab**: `changed_by` névre feloldva.
- **Ajánlatok tab**: „Új verzió" (`max(version)+1`, `is_current=true`, többi `false`) és „Aktuálissá tesz" gombok. Csak `quote_prep` / `quote_sent` / `follow_up` / `contract` státuszban aktívak.
- **Átadás tab**: `won` és nincs projekt → `HandoffDialog` (kötelező mezők: cím, kapcsolattartó, telefon, helyszín, kezdés). Mentés `projects` insert-tel, `handoff_at` triggerből. Ha van projekt: strukturált `handoff_payload` riport.

Mutációk a Supabase böngészőkliensen keresztül, a meglévő RLS és üzleti-trigger szabályok mellett (`leads_business_rules`, `leads_status_history_write`, `projects_lead_handoff_guard`). Cache invalidáció: `leads/detail/$id`, `lead-status-history/$id`, `projects`, `quotes`.

Nem épült be (szándékosan): auto-assign, SLA push, AI ajánlás, quote PDF/küldés, mobil reszponzív finomhangolás, semantic CSS tokenek (`--status-*`) — ez utóbbiak a következő körben jönnek.

### Lead Workspace V2 — `assigned_to` írási oldal (kiegészítés)

- **Séma-ellenőrzés**: a `database/2026-06-23_sales_module_v1.sql` migráció alapján minden hivatkozott mező (`leads.assigned_to/assigned_at/next_step_*/lost_*/won_at/lost_at`, `lead_status_history`, `quotes.version/is_current`, `projects.lead_id/handoff_payload/handoff_at`, `users_profile`, `v_sales_user_load`) létezik. Spekuláció nélkül építkezünk.
- **AssigneePicker** (`src/components/sales/assignee-picker.tsx`): header inline picker.
  - Sales szerepkör: csak **„Magamhoz veszem"** vagy **„Lemondom"** gomb (RLS `leads_update_sales` WITH CHECK: csak saját magához rendelhet).
  - Owner: dropdown a `v_sales_user_load`-ból (név + aktív lead darab), „Magamhoz veszem" és „Kiosztás törlése".
- Mentés: meglévő `updateLead` mutáció `{ assigned_to: <uuid|null> }` patchcel. Az `assigned_at` mezőt a `leads_business_rules` trigger állítja.

Ezzel a Lead Workspace V2 a backend v1 minden tervezett mezőjére írási joggal rendelkezik (a tiltott trigger-szabályok mellett), és a többi Sales oldal érintetlen maradt.
