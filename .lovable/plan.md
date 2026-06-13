
# Scarlet Kampány → CRM workflow terv

Cél: a "Kampány" gomb valódi CRM-rekordokat hozzon létre (cég + opcionális kontakt), **de ne** generáljon leadet vagy sales-pipeline elemet. A jelenlegi localStorage shortlist megszűnik, helyette egy valós nézet jön létre.

Megkötés: **nincs új tábla, nincs új oszlop, nincs új view, nincs migration**. Sales gombhoz nem nyúlunk.

---

## 1. Hogyan jelöljük a "kampány" cégeket — meglévő struktúrán belül

A `companies` táblának van egy `company_type` szöveges mezője, CHECK-listával:

```
generalkivitelezo, tarsashaz, kozos_kepviselo,
beruhazo, alvallalkozo, maganszemely,
potencialis   -- legacy, „kézzel átsorolásra vár"
```

A `potencialis` érték már létezik, jelenleg legacy célra használt ("kézzel átsorolásra vár") — szemantikailag pontosan ezt jelenti: marketing által felvett, még nem minősített cég. **Ezt használjuk fel** a kampánycégek jelölésére.

Előny:
- nincs schema-változás
- a CHECK constraint már megengedi
- létezik index: `idx_companies_company_type` → szűrés gyors
- a meglévő /companies, /customers, kvalitás-számítók már kezelik

Mellékhatás:
- a legacy 2 sor `potencialis` cég innentől "kampánylistába" kerül vizuálisan — ezt elfogadjuk, hisz a legacy komment is azt mondja, kézi átsorolásra vár.

Nincs szükség `source` mezőre — a marketing eredet rögzítésére a `notes` szabad-szöveg mezőbe írunk egy első sort: `Forrás: Scarlet kampány (YYYY-MM-DD)`. Ezt a sort már most is használja a Sales-flow (lásd `sales.research.tsx:195`).

---

## 2. Kampány gomb új viselkedése (`sales.research.tsx` → új `addToCampaign` fn)

A jelenlegi `addToShortlist` localStorage-író helyére:

1. **Duplikáció-ellenőrzés** ugyanaz, mint Sales-ben:
   - `companies.name ILIKE` egyezés → ha van, csak toast: "Már szerepel a CRM-ben" (kampánylistára nem duplikáljuk)
   - `contacts.email` egyezés → cég megvan, csak toast
2. **Ha nincs egyezés:**
   - `INSERT INTO companies` — `name`, `website`, `company_type = 'potencialis'`, `notes` (Forrás + város + AI indok)
   - Ha van `email` vagy `phone`: `INSERT INTO contacts` — `name='Iroda'`, `company_id`, `email`, `phone`
   - **NEM** hoz létre `leads` rekordot → automatikusan nem jelenik meg a /today, /leads, lead pipeline-ban, és a sales nem látja
3. `ai_action_log` bejegyzés: `agent_type='marketing'`, `action_type='add_to_campaign'`, `executed=true`, `result={company_id, contact_id}`
4. Sor megjelölése `_matched`-ként, toast "Megnyitás" akció a `/campaign-list` (vagy ha a cég oldal nyitható, `/customers/$id`) felé

A régi shortlist State, `loadShortlist/saveShortlist/clearShortlist`, `SHORTLIST_KEY` és a fejléc "Kampánylista: N" Badge teljesen törölhető — helyettük a valós DB-számláló.

---

## 3. Kampánylista nézet — új route vagy szűrt /companies?

Két opció, javaslat a **B**:

**A) Csak szűrés a /companies-en** (`?filter=campaign`)
- ✓ nem új route
- ✗ a marketing user nem találja meg könnyen, a sidebar nem mutathat link-paramétert
- ✗ keveredik a /companies normál ügyfél-nézettel

**B) Új route: `/campaign-list`** (frontend-only, semmilyen új tábla)  *— javasolt*
- A komponens egy szűrt `companies` query: `WHERE company_type = 'potencialis'`
- Oszlopok: cégnév, kapcsolattartó név + email + telefon, létrehozás dátuma, "Forrás" (notes első sora), művelet-gombok: Megnyitás (`/customers/$id`), **Promóció Sales-re** (megnyitja a Scarlet sort vagy direkt `/sales/research` linket ad — nem hozunk létre leadet automatikusan, a Sales-promóciót a meglévő Sales gombbal kell megtenni a research lapon)
- Permission map (`src/lib/permissions.ts`) bővítése: `/campaign-list` → `owner, project_manager, marketing`
- Sidebar bővítés: a marketing szekcióban (`app-sidebar.tsx`) új menüpont "Kampánylista" — Scarlet alá

A user kifejezetten új menüpontot kért ("Marketing → Scarlet → Kampánylista"), ezért **B opciót** javaslom.

---

## 4. Mellék-takarítások

- A /companies és /customers fő nézetében a `company_type='potencialis'` cégeket **kiszűrjük alapból** (vagy badge-eljük), hogy a kampányba tett cégek ne keveredjenek a tényleges ügyfelekkel. Ezt kapcsolható szűrőként valósítjuk meg, default = ne mutassa.
  - Vagy egyszerűbben: csak jelöljük badge-dzsel ("Kampány" pill) és hagyjuk a listában. Döntés a megvalósítás előtt.
- A Scarlet (`sales.research.tsx`) megőrzi a Sales gombot változatlanul.

---

## 5. Érintett fájlok (kódszinten)

| Fájl | Változás | Típus |
|---|---|---|
| `src/routes/_authenticated/sales.research.tsx` | `addToShortlist` → `addToCampaign` mutation: companies+contacts insert, log; shortlist state, localStorage, Badge eltávolítása | UI + DB-insert |
| `src/routes/_authenticated/campaign-list.tsx` | **új route file** — szűrt companies lista | UI-only |
| `src/lib/permissions.ts` | ROUTE_ACCESS bővítés `/campaign-list` | config |
| `src/components/app-sidebar.tsx` | "Kampánylista" menüpont a marketing szekcióhoz | UI |
| (opcionális) `src/routes/_authenticated/companies.index.tsx` és `customers.index.tsx` | "Kampány" badge vagy default-filter `company_type != 'potencialis'` | UI-only |

Nincs migration, nincs SQL, nincs új tábla, nincs új oszlop, nincs új view, nincs új edge function, nincs RLS-változtatás.

---

## 6. Workflow a javítás után

```
Scarlet (AI találat)
   │
   ├── Kampány ──► dedupe-check
   │                 ├── van ──► toast "Már szerepel"
   │                 └── nincs ──► INSERT companies (company_type=potencialis)
   │                                └─► INSERT contacts (ha van email/telefon)
   │                                      └─► ai_action_log (add_to_campaign)
   │                                            └─► látható: /campaign-list
   │                                            └─► NEM látható: /today, /leads, lead pipeline
   │
   └── Sales ──► (változatlan, létrehoz leadet is)
```

A "promóció kampányból → leadbe" felhasználói művelet marad: a marketinges a `/campaign-list`-en megtalálja a céget, és a Scarlet research oldalon a `Sales` gombbal készít belőle leadet (vagy később egy "Promóció leadre" gombot adunk a kampánylista soraira — ez azonban már új művelet, **nem része ennek a sprintnek**).

---

## Jóváhagyás kérdései

1. **Új route `/campaign-list`** vagy csak szűrt `/companies?filter=campaign`? (Javaslat: új route — sidebar-menüpont egyértelműsége miatt.)
2. **`/companies` és `/customers` fő nézetében** a kampánycégeket alapból szűrjük ki, vagy csak jelöljük badge-dzsel? (Javaslat: badge — semmi sem tűnik el a meglévő nézetekből, csak címkézve van.)
3. **`company_type='potencialis'` jelölés** elfogadható? (Egyetlen alternatíva új oszlop nélkül: csak `notes` szöveg — de az nem indexelhető és nem szűrhető megbízhatóan.)

Implementáció csak a fenti három kérdés megválaszolása után indul.
