# Marketing modul refaktor — végrehajtási terv

A korábbi körök elemzései (komponens-térkép, dedup audit, séma vizsgálat) alapján az alábbi fázisokra bontom a munkát. Minden fázis külön zárható, és **egyik sem érinti a Supabase sémát**.

## Előzetes megállapítás (kritikus)

A 6. pontban szereplő „Lead átadás" workflow esetén a `followups` insert **kötelezi a `company_id` mezőt** ahhoz, hogy az átadás megjelenjen a lead idővonalán (`LeadDetailColumn` `useListWhere("followups","company_id",…)`). **Cég nélküli lead nem adható át** ezzel a megoldással — ez UI-szintű validációval lesz kezelve („Átadás előtt cég szükséges").

Ha ez nem elfogadható, az egyetlen alternatíva séma-módosítás (`followups.lead_id` mező), amit a feladat tilt — ebben az esetben megállok és jelzem.

---

## Fázis A — Menü és jogosultság tisztítás (kis, alacsony kockázat)

**Pontok:** 1, 2

- `src/lib/permissions.ts` — `/dashboard` és `/activity` levétele a `marketing` role-ról a `ROUTE_ACCESS` listában.
- `src/components/app-sidebar.tsx` — a sidebar menüpontjai már a `canAccessRoute`-ot használják, így automatikusan eltűnnek; ellenőrzés.
- `src/components/quick-add-menu.tsx` — kiegészítés egy explicit `marketingAllowed` szűrővel: marketing role-nál csak `lead` jelenik meg.
- Marketing user manuális belépéssel se férjen a `/dashboard`/`/activity` route-okhoz — `canAccessRoute` fail-closed már most blokkolja.

## Fázis B — Lead Workspace marketing-tisztítás (kis–közepes)

**Pontok:** 3, 4, 5

- `LeadDetailColumn` és `LeadActionPanel` kap egy `mode: "marketing" | "sales"` prop-ot (a `LeadActionPanel`-nek már van). A `mode==="marketing"` ágban:
  - „Konvertált projektek" szekció elrejtve
  - „Ajánlat" blokk elrejtve (már most is `mode==='sales'` only — megerősítés)
  - Folyamat-szalag címkék: **Új lead → Kapcsolat → Minősítés → Átadás**
- Lead státusz dropdown (a `LEAD_STATUS_OPTIONS` és a `LeadDetailColumn` selectje) **marketing UI feliratokat** kap: `new=Új`, `contacted=Kapcsolatfelvétel alatt`, `qualified=Átadható`, `lost=Nem érdekes`. A `converted` érték marketing UI-ban nem választható (csak olvasáskor mutatjuk a meglévő értéket). DB értékek érintetlenek.

## Fázis C — Lead átadás értékesítőnek (közepes)

**Pontok:** 6, 7

- Új komponens: `src/components/lead-workspace/lead-handoff-panel.tsx`
  - Lekérdezés: `users_profile` + `roles` JOIN, `roles.name='sales'` szűréssel
  - Megjegyzés textarea + „Átadás" gomb
  - Akció: `followups` insert (`followup_type='handoff'`, `result='Átadva: <név> — <megjegyzés>'`, `company_id=lead.company_id`, `completed=true`, `due_date=now()`) + `leads.status='qualified'` update
  - Csak akkor jelenik meg, ha `lead.status === 'qualified'` ÉS `lead.company_id != null`
  - Toast: „Átadva: <név>"
- `LeadListColumn` szűrő-tabok: **Aktív** (status in `new`,`contacted`), **Átadható** (`qualified` ami még nincs handoff-olva), **Átadott** (`qualified` + van `handoff` típusú followup) — marketingnek az „Átadott" read-only.

## Fázis D — Cég adat-hiány jelző (új feature, közepes–nagy)

**Pont:** 8

- Új komponens: `src/components/customers/company-completeness-panel.tsx`
- Megjelenés: `/customers/$id` oldalon, a meglévő read-only kártyák mellett
- Hiány-detektálás a `companies` rekord mezői alapján: `name`, `website`, `email` (nincs ilyen oszlop a `companies`-on — **megállás-pont, lásd lent**), `phone` (szintén nincs), `address` (nincs), `tax_number`, `company_type`, kapcsolattartó léte
- Automatikus javaslat (csak meglévő adatokból):
  - email → a leg-aktívabb `contacts.email` ehhez a céghez, vagy `email_threads` from_email leggyakoribb értéke
  - telefon → `contacts.phone` leggyakoribb értéke
  - weboldal → `contacts.email` domain részéből
- „Elfogadás" gombbal az érintett mező a meglévő mezőkbe íródik

**⚠️ MEGÁLLÁS-PONT:** a `companies` séma a kód alapján csak `name, company_type, tax_number, website, notes, domain, city` mezőket használ — **nincs `email`, `phone`, `address` oszlop a `companies`-on**. Ezek a hiányadatok jelenleg a `contacts`-ban élnek. Ez azt jelenti:
- vagy „cég-szintű email/telefon/cím" megjelenítését az aggregált `contacts` adatokból csináljuk (séma-módosítás nélkül),
- vagy új mezők kellenek a `companies`-on (a feladat tilt).

**Javaslat:** csak a meglévő `companies` mezőkre (`website`, `tax_number`, `company_type`, `city`, `notes`) + „van-e legalább egy kapcsolattartó" jelzőre korlátozzuk a Fázis D-t. Az email/telefon „hiánya" mint cég-attribútum nem értelmezhető séma nélkül.

## Fázis E — Duplikáció riport (új feature, közepes)

**Pont:** 9

- Új route: `src/routes/_authenticated/settings.dedup-report.tsx` (vagy `/customers` aloldal)
- Három szekció:
  - **Cégek**: azonos `name` (lower+trim) csoportok; hasonló név (Levenshtein vagy `pg_trgm` nélkül — kliens-oldalon `JS` egyszerű hasonlóság)
  - **Kapcsolattartók**: azonos `email` (lower+trim), azonos `phone` (normalizált)
  - **Leadek**: azonos `company_id`-hez tartozó több nyitott lead
- Csak listázás, link a rekordra. **Nem töröl semmit.**

## Fázis F — Dokumentáció (csak markdown)

**Pont:** 10 — már elkészült a korábbi körökben. Lezárhatóként frissítem a `.lovable/plan.md`-t a fenti A-E fázisokkal és a kockázat-listával.

---

## Részletes érintettség (A-C fázisokra)

### Módosított fájlok
- `src/lib/permissions.ts` — `ROUTE_ACCESS` szűkítés
- `src/components/quick-add-menu.tsx` — marketing-specifikus szűrő
- `src/components/lead-workspace/lead-detail-column.tsx` — `mode` prop, projekt-szekció rejtés
- `src/components/lead-workspace/lead-action-panel.tsx` — folyamat-szalag címkék
- `src/components/lead-workspace/lead-list-column.tsx` — státusz feliratok + új tabok
- `src/components/lead-workspace/lead-workspace.tsx` — `mode` átadás
- `src/components/today/marketing-home.tsx` — handoff-panel hely megerősítése

### Új fájlok
- `src/components/lead-workspace/lead-handoff-panel.tsx`
- (Fázis D–E csak ha jóváhagyod)

### Nem érintett
- `src/integrations/supabase/*` — nincs auth/middleware/séma változás
- Bármely `*.functions.ts` / `*.server.ts` — nincs server fn módosítás
- `database/*.sql` — nincs új migráció

---

## Kockázatok

1. **Cég nélküli lead átadás** — UI-szintű blokk; a marketinges csak akkor lát „Átadás" gombot, ha van cég. (Korlát, nem hiba.)
2. **`converted` státusz** — marketing UI-ban nem választható, de ha másik szerepkör beállította, megjelenik (read-only badge-ként). Nem viszi vissza a marketinghez.
3. **„Átadott" tab szűrés** — jelenleg nincs strukturált jel arra, hogy egy `qualified` lead már át lett-e adva; a szűrés a `followups.followup_type='handoff'` léte alapján működik, ami csak akkor zárt, ha a `company_id` is van. Cég nélküli `qualified` lead-ek a klasszikus „Átadható" tabban ragadnak (egyik szerepkör sem tudja átvenni a jelenlegi modellel).
4. **Fázis D email/telefon/cím a `companies` szintjén** — nem létezik a sémában, csak `contacts`-ban. Vagy aggregálva mutatjuk, vagy később séma-módosítás kell.
5. **Permissions szűkítés** — ha más szerepkörök (PM, sales) ugyanazokat a tabokat használják, gondoskodni kell hogy ők ne sérüljenek.

---

## Helyek, ahol később séma-módosítás indokolt lehet (nem most)

- `leads.assigned_to uuid` → `users_profile.id` — strukturált lead-tulajdonos szűréshez, értesítéshez
- `followups.lead_id uuid` — cég nélküli leadek átadásához és pontos idővonalhoz
- `companies.email`, `companies.phone`, `companies.address` — cég-szintű elsődleges kapcsolat-adatokhoz
- `companies` unique index a `lower(name)`-re — adatbázis-szintű dedup
- `contacts` unique index a `lower(email)`-re

---

## Kérdés mielőtt nekiállok

Három döntést kérek:

1. **Fázis bontás:** csak A+B+C menjen most (kis-közepes scope, ~1-2 óra munka), vagy D+E is (jelentősen nagyobb, új feature komponensek)?
2. **Fázis D scope:** elfogadod, hogy email/telefon/cím nem a `companies`-on van, és csak a meglévő `companies` mezőkre + kapcsolattartó-jelenlétre szűkítjük?
3. **Cég nélküli lead átadás:** elfogadod a UI-szintű blokkot („Átadás előtt cég szükséges"), vagy ez megálljt jelent?

Jóváhagyás után csak a választott fázisokat valósítom meg, lépésről lépésre, és a végén egy rövid sprint-záró összefoglalót adok.
