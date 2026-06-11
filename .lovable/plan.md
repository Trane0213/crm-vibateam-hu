
# CRM V2 — ütemterv

A 9 pontot 4 sprintre bontom. Minden sprint külön kérésre indul. **Egyetlen Supabase migráció sem készül** — minden frontend-réteg módosítás.

## Alapdöntés: Customer = companies sor

A `companies` tábla már most tartalmaz `company_type='maganszemely'` értéket, és a `contacts` mindig `company_id`-hoz kötődik. Tehát:

- **Customer** = egy `companies` row.
- **Customer Type** = `companies.company_type` (`maganszemely` → magánszemély, minden más → cég).
- Magánszemélynél a fő `contacts` sor az "ügyfél maga" (név/telefon/email/cím).
- Új DB tábla nem kell. `/customers/:id` route a `companies` táblát olvassa, de **egységes UX**-szel rendereli.

---

## SPRINT 1 — Customer adatlap + Projekt központ + Idővonal  *(1, 2, 4)*

A leghosszabb sprint, ~60% a teljes munkából. Ez az új CRM gerince.

**1.1 `/customers/:id` egységes adatlap**
- Új route: `src/routes/_authenticated/customers.$id.tsx`
- Header: név + típus chip (Cég / Magánszemély) + fő kapcsolattartó
- Tabok egy oldalon (nem külön route): Áttekintés · Projektek · Ajánlatok · Follow-upok · Kommunikáció (email+hívás+találkozó) · Dokumentumok · Jegyzetek · **Idővonal**
- `/companies/:id` és `/contacts/:id` → redirect a megfelelő `/customers/:id`-re (contact esetén a `company_id`-ra)

**1.2 `/projects/:id` átstrukturálás**
- A jelenlegi adatlapot szekciókra rendezem a kért sorrendben: Áttekintés → Kapcsolatok → Értékesítés (lead+ajánlatok) → Kommunikáció → Operáció → Napló
- Sticky aloldali navigáció (in-page anchors), nem külön route
- `ProjectTimeline` komponens bekötése (most NEM bekötött) a Napló szekcióba

**1.3 Egységes `ActivityTimeline` komponens**
- A meglévő `project-timeline.tsx` általánosítása: `<ActivityTimeline scope="project"|"customer" id={...} />`
- Customer scope összegyűjti az összes projekt + standalone lead/email/call eseményt
- Eseménytípusok ikon + szín kódolással (már megvan a META map)

## SPRINT 2 — Egységes státusz + Menü egyszerűsítés + Magánszemély flow  *(3, 7, 9)*

Tisztító sprint, gyors UI munka.

**2.1 Lead státusz magyar workflow**
- `viba-constants.ts` kibővítése: `LEAD_STATUS` enum (`uj_erdeklodo`, `kapcsolatfelvetel`, `felmeres_egyeztetve`, `minositett`, `elutasitott`)
- Mapper a régi értékekre (`new`→`uj_erdeklodo`, `contacted`→`kapcsolatfelvetel`, stb.) **csak megjelenítéskor**
- `LeadStatusSelect` komponens (mint a `ProjectStatusSelect`)

**2.2 Project státusz bővítés**
- `PROJECT_STATUS` kiegészítés: `targyalas`, `atadas`, `garancia` értékekkel
- Régi `quoting`/`won`/`lost`/`new` UI-mapper a `PROJECT_STATUS_LABEL`-be (legacy fallback)

**2.3 Sidebar újrastruktúra**
```
Dashboard
Ügyfelek        ← /customers (új lista, csoportosítva Cég/Magánszemély)
  Cégek         (admin, megtartva)
  Kapcsolattartók (admin, megtartva)
Projektek
Kommunikáció    ← collapsible group
  Email · Hívások · Találkozók
Feladatok
Dokumentumok
Beállítások
```
- Értékesítés → beolvad: Leadek a Customer/Project alá, Ajánlatok és Follow-up megmaradnak listának de a Projektek alatti csoportban
- AI Asszisztensek külön blokk marad

**2.4 Magánszemély flow finomítás**
- "Új magánszemély" gomb a `/customers` lista oldalra is (a meglévő `PersonalContactDialog` újrahasználva)
- A létrehozás után rögtön `/customers/:id`-re navigál (nem `/contacts`-ra)
- A dialógus létrehoz: 1 `companies` row (`company_type='maganszemely'`, name=személy neve) + 1 `contacts` row (a 4 mező)

## SPRINT 3 — Dashboard + Dokumentumok  *(5, 6)*

**3.1 Dashboard újratervezés**
- 4 szekció: Mai teendők · Értékesítés · Projektek · Kommunikáció
- Mai/lejárt follow-upok lista (kattintható → projekt)
- Új leadek (7 nap) · ajánlatra váró projektek (`status='ajanlat_keszul'`) · nyitott ajánlatok
- Aktív projektek (státusz szerint) · közelgő határidők (next 7 days)
- Utolsó 5 email + utolsó 5 aktivitás

**3.2 Dokumentum-kapcsolások (UI réteg)**
- A `project_documents`-en már van `project_id`. Az `entity_type`/`entity_id` oszlopokat ellenőrzöm; ha nincs, csak `project_id`-vel dolgozunk és UI-ban szűrünk
- Customer adatlap Dokumentumok tabja: az ügyfél összes projektjéhez tartozó dokumentum listázása

## SPRINT 4 — Marvin AI valós műveletek  *(8)*

Legkockázatosabb sprint, külön tervezést igényel.

- AI SDK `tool()` definíciók a `src/lib/ai/tools.ts`-ben:
  `searchCustomers`, `createLead`, `createProject`, `createFollowup`, `createTask`, `searchQuotes`, `summarizeProject`
- `needsApproval: true` minden mutáló tool-on (megerősítő gomb a chatben)
- `stopWhen: stepCountIs(50)` az agent loopra
- Tool eredmények renderelése a chat UI-ban (kártya komponensek)

---

## Technikai jegyzetek

- **Nincs új tábla, oszlop, RLS policy, migráció.**
- A "Customer" tisztán frontend absztrakció a `companies` táblán.
- A régi `/companies` és `/contacts` route-ok megmaradnak (admin/lista), de elsődleges belépés a `/customers`.
- Status mapper minden helyen: legacy → magyar UI label (a DB érintetlen marad).
- A `ProjectTimeline` komponens már létezik, csak be kell kötni.

## Mit kérek tőled

Hagyd jóvá a tervet, és írd meg melyik sprintet kezdjem (javaslom **Sprint 1**-et). Minden sprint végén külön kiírom:

```
SUPABASE VÁLTOZÁSOK:
NINCS
```
