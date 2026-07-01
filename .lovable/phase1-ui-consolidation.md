# Phase 1 – UI Konszolidáció (regressziós lista)

**Sprint dátuma:** 2026-07-01
**Scope:** Kizárólag frontend átrendezés. Nincs SQL, backend, RPC, jogosultság, új üzleti funkció, sem törlés.

## Cél
Minden szerepkör napi munkája 3–5 elsődleges "Munkafelület"-en történjen a sidebar tetején. A régi menüpontok és route-ok kompatibilitási okokból megmaradtak a másodlagos csoportokban.

## Módosított fájlok
| Fájl | Változás |
|---|---|
| `src/components/app-sidebar.tsx` | Sidebar átcsoportosítás szerepkör alapján. `workspacesByRole` bevezetve. `workflow`, `reports`, `sales` régi tömbök konszolidálva `contacts`/`comms`/`reports`/`sys` alá. |
| `.lovable/phase1-ui-consolidation.md` | Ez a dokumentum. |

**Egyéb fájl nem módosult.** A Sales Workspace (`/leads` — `LeadWorkspace`), Project Workspace (`/projects/$id`), Marketing Workspace (`/leads` marketing módban), Owner Workspace (`/dashboard`, `/today`) komponensei érintetlenek — már megfelelő tabbed/paneles felületek.

## Route változások
**Egy route sem változott.** Minden meglévő URL elérhető marad. A sidebar csak átcsoportosítja a linkeket.

## Komponens áthelyezések
Nincsenek. A workspace komponensek (`LeadWorkspace`, projekt tabs, `SalesHandoffCard`, `OwnerHome`, `SalesHome`, `MarketingHome`, `PmHome`) a helyükön maradtak.

## Sidebar szerkezet szerepkörönként

### Sales
- **Munkafelületek**: Sales Workspace (`/leads`), Pipeline (`/sales/leads`), Ajánlatok (`/quotes`), Projektek (`/projects`)
- **Ügyfelek**: Ügyfelek, Cégek, Kapcsolattartók, Kampánylista, Weboldali ajánlatkérések
- **Kommunikáció**: Emailek, Találkozók (Hívások rejtve — kérésre)
- **Nézetek**: Teendők riport, Ajánlatok riport, Elveszett
- **Rendszer**: Adatminőség, Dokumentumok, Beállítások

### Marketing
- **Munkafelületek**: Marketing Workspace (`/leads`), Weboldali igények, Kampánylista, Emailek
- **Ügyfelek**: Ügyfelek, Cégek, Kapcsolattartók (Kampánylista + Web igények rejtve — fenn vannak)
- **Kommunikáció**: Találkozók (Email fenn van, Hívások rejtve)
- **Nézetek**: — (Sales riportok rejtve)
- **Rendszer**: Adatminőség, Dokumentumok, Marketing súgó, Beállítások

### Projektvezető
- **Munkafelületek**: Projektek, Feladatok, Találkozók, Dokumentumok
- **Ügyfelek**: Ügyfelek, Cégek, Kapcsolattartók, Kampánylista, Weboldali ajánlatkérések
- **Kommunikáció**: Emailek, Hívások (Találkozók fenn van)
- **Nézetek**: Sales áttekintés, Teendők, Ajánlatok, Elveszett, Aktivitás
- **Rendszer**: Adatminőség, Marketing súgó, Beállítások (Dokumentumok fenn van)

### Owner
- **Munkafelületek**: Irányítópult, Pipeline, Projektek, Ajánlatok
- **Ügyfelek** / **Kommunikáció** / **Nézetek** / **Rendszer**: teljes hozzáférés minden korábbi menüponthoz

## Kompatibilitás miatt megmaradt régi képernyők
Ezek továbbra is elérhetőek, de már NEM elsődleges munkafelületek:
- `/sales` – Sales áttekintés (owner + PM riport)
- `/sales/todo` – Teendők riport (a napi teendők a `/today` és `/leads` workspace-en jelennek meg)
- `/sales/quotes` – Ajánlatok riport (elsődleges hely: `/quotes`)
- `/sales/handoff` – korábban is legacy, változatlan
- `/leads/lost` – archív lista
- `/followups` – (route változatlan, sidebar nem hivatkozza — meglévő deep linkek működnek)
- `/activity` – rendszer aktivitás log (owner/PM)
- `/dashboard` – owner primary; salesnek továbbra sem jelenik meg (változatlan)

## Mit NEM módosítottunk
- Semmilyen DB séma, RLS, RPC.
- Semmilyen komponens belső logikája vagy business rule.
- Semmilyen route file (`src/routes/_authenticated/*.tsx`).
- Semmilyen permission (`src/lib/permissions.ts` érintetlen).
- Semmilyen AI OS runtime / agent regisztráció.

## Regressziós ellenőrzés
- `bunx tsgo --noEmit` → 0 hiba.
- Minden korábbi `<Link to="...">` és deep link változatlan URL-t céloz.
- `canAccessRoute()` szabályok nem módosultak — jogosultsági viselkedés bit-pontos.

## Következő fázisokra halasztva (Phase 1 scope-on kívül)
- Új üzleti funkciók (Ajánlat szerkesztő, Hívás modul, PM helyszíni napló).
- Route törlések / redirect-re cserélések (csak akkor, ha később bizonyítottan a Workspace kiváltja őket).
- Backend / DB változtatások.