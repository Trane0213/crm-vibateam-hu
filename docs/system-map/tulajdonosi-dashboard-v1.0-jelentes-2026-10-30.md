# VIBA CRM – Tulajdonosi dashboard V1.0 jelentés (2026-10-30)

Hatókör: a meglévő „Ma” (`/today` → `OwnerHome`) és „Irányítópult” (`/dashboard`) egységesítése. Nincs új dashboard, séma, RLS vagy AI változás.

## 1. KPI audit – adatforrások (DB-ből ellenőrizve, 2026-10-30)

| Tény | Érték |
|---|---|
| quotes | 2 db, mind `draft`; `total_amount` mindkettőnél NULL; 1 tételes (TESZT, nettó 200 000 Ft) |
| dashboard_status_config | **üres** → `dashboard_revenue_monthly_v` mindig üres |
| projects | 2 db, **mindkettő TESZT** (`atadas`, `elokeszites`), mindkettőnek van PM-je; nincs érték-mező |
| leads | new 5, won 2 (**mind TESZT**), lost 1 (**TESZT**) |
| followups nyitott / tasks nyitott | 0 / 0 |
| companies / customer_kpi_v | 446 / 446 sor |

## 2. KPI definíciók (közös: `src/lib/owner-kpis.ts`, megjelenítés: `owner-kpi-strip.tsx`)

| KPI | Definíció | Mérhető? |
|---|---|---|
| Lejárt utókövetés | followups.completed=false, due_date < most | igen |
| Ma esedékes | completed=false, due_date a **budapesti** napon belül | igen |
| Lejárt feladat | tasks.status≠done, due_date < most | igen |
| Nyitott ajánlat db | quotes status ∉ (won,lost), is_current ≠ false | igen |
| Nyitott ajánlat érték | **nettó, quote_items-ből** (`quoteNet`, mint Pipeline/nyomtatás); tétel nélkül „nincs rögzítve” | részben (csak tételes ajánlat) |
| Sales-előkészítés / Pipeline | leads nem lezárt, pipeline_entered_at null / nem null | igen |
| Megnyert / elveszett lead | leads.status won / lost, TESZT külön | igen |
| Lead-konverzió | won / (won+lost) lead (korábban: quote won/lost — nem használt státusz) | igen (jelenleg 100% TESZT) |
| Átadásra vár / felelős nélküli projekt | projects.status=atadas / project_manager_user_id null | igen |
| Projekt pipeline | projektek darabszáma státuszonként | igen; **érték nem mérhető** (nincs mező) |
| Megnyert ajánlatok értéke | quote_won státuszú ajánlatok total_amount-ja | **nem mérhető** (config üres, total_amount NULL) |
| Árbevétel / cash flow / profit | — | **nem mérhető** (nincs számla/banki adat) |

TESZT-szabály: cégnév / ajánlat cím / lead összegzés / projekt cím tartalmazza: „TESZT”.

## 3. Ma vs. Irányítópult
- **Ma:** KPI-sáv (4+6 kártya) + AI briefing + link az Irányítópultra. A korábbi duplikált ügyfél- és vezetői grafikonok csak az Irányítópulton maradtak.
- **Irányítópult:** ugyanaz a KPI-sáv + kritikus, ajánlati, projekt, utókövetési, ügyfél és vezetői bontás.

## 4. Végrehajtott változtatások
- Új: `src/lib/owner-kpis.ts` (+ teszt, 6 eset), `src/components/dashboard/owner-kpi-strip.tsx`.
- `owner-home.tsx`: közös KPI-sáv, duplikált widgetek ki.
- `dashboard.tsx`: közös KPI-sáv; budapesti napi határok; „Bevétel · pipeline” → „Ajánlatok · pipeline (nem számlázott bevétel)”; nettó tételes érték; lead-alapú konverzió; betöltés/hiba ≠ 0; érdeklődő státuszok és utókövetések kattinthatók (lead deep-link); AI összefoglaló prompt: összeget nem becsülhet, nem nevezheti bevételnek.
- `exec-widgets.tsx`: „Megnyert bevétel” → „Megnyert ajánlatok értéke”, „nem számlázott és nem befolyt bevétel” felirat; projekt pipeline értékállítás törölve; betöltés/hiba állapot.
- `customer-kpi-widgets.tsx`: lapozott `customer_kpi_v`; cégnevek csak a megjelenített azonosítókra, 200-as csomagokban (laplimit nem vág).
- Súgó: `/help/owner` (= `docs/manuals/tulajdonosi-kezikonyv-v1.0-2026-10-30.md`), menü „Tulajdonosi súgó” csak tulajdonosnak.

## 5. Eredmények
| Ellenőrzés | Eredmény |
|---|---|
| Vitest (56, ebből új 6) | PASS |
| AI acceptance 12/12 | PASS |
| Típusellenőrzés / build | PASS |
| Tulajdonosi böngészős próba | **NOT TESTED** – nincs biztonságos tulajdonosi munkamenet |
| TESZT projekt (3c69f3f3…) PM=Viktor, átadás, lead/ajánlat kapcsolat | PASS (DB-olvasás) |

## 6. Maradó kockázatok
- Az AI napi briefing (AI OS, lock-olt) a nyers `quotes.total_amount`-ot kapja; nem módosítottam.
- `useList` alapú listák (feladatok, utókövetések, leadek, projektek az Irányítópulton) 1000 sor felett csonkolhatnak — jelenlegi adatmennyiség alatt.
- Minden megnyert/elveszett lead és projekt TESZT → a lead-konverzió jelenleg nem valós üzleti adat.

## 7. Visszaállítás / publikálás
Csak frontend: a fenti fájlok előző verziója a verziókezelőből visszaállítható; DB nem változott. Nem publikáltam.

## 8. Várólista – Projektvezetés V1.0 (most NEM kezdhető)
Projekt szerződéses érték mező; PM napi munkafolyamat; ütemterv; erőforrás-tervezés; jelenlét-kalkuláció; projektpénzügy / számla / befolyt bevétel; „quote_won” státusz-konfiguráció döntés.
