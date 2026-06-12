# Sprint 3 — Customer 360, Timeline, Dashboard, Jogosultságok

## Cél
Négy egymásra épülő modul kiszállítása. Minden adatbázis változtatás SQL-blokként kerül átadásra a felhasználónak (manuálisan futtatja). Frontend a Lovable buildben.

## Hatásvizsgálat (DB)

### Új objektumok
| Típus | Név | Cél |
|---|---|---|
| VIEW | `customer_360_v` | Customer fejléchez összesített adatok (cégadat + KPI + főbb kontakt) egy lekérésre |
| VIEW | `dashboard_pipeline_v` | Projekt státusz pipeline összesítés (státusz, darabszám, összérték) |
| VIEW | `dashboard_user_workload_v` | Felelős → nyitott taskok / followupok / projektek |
| VIEW | `dashboard_revenue_monthly_v` | Hónap × elfogadott ajánlat érték (utolsó 12 hónap) |
| VIEW | `activity_timeline_v` | Globális idővonal (a `customer_activity_v` mintájára, de minden modul, customer szűkítés nélkül, `user_id` annotálva) |
| TABLE | `route_permissions` | Per-route × role engedélyek dinamikus szerkesztéshez (Settings → Permissions) |
| FUNCTION | `public.has_route_access(_user uuid, _path text)` | SECURITY DEFINER, role + route_permissions alapján |

### Meglévő táblák érintve
- `companies`, `projects`, `quotes`, `leads`, `followups`, `tasks`, `phone_calls`, `meetings`, `email_threads`, `project_notes`, `project_documents`, `contacts` — **csak olvasás** (view-kon keresztül). Nincs séma változás rajtuk.
- `roles`, `user_roles` (ha van) / `users_profile` — olvasás a `has_route_access` függvényben.

### Új oszlopok
Nincs — a Sprint 3 view-alapú, nem ír meglévő táblákba.

### RLS / policy
- Új view-k mind `security_invoker = on` → meglévő RLS érvényesül.
- `route_permissions`: RLS engedélyezve, `SELECT` minden `authenticated`-nek (mindenkinek tudnia kell a saját menüjét), `INSERT/UPDATE/DELETE` csak `owner` role-nak (via `has_role`).
- `has_route_access` SECURITY DEFINER, `search_path=public` rögzítve.

A teljes futtatható SQL blokkot a következő üzenetben adom át, lépésenként (1. view-k, 2. route_permissions + function), hogy ne legyen monstre.

## Frontend változások

### 1. Customer 360 (`/customers/$id`)
- Jelenlegi `customers.$id.tsx` bővítése: header KPI sáv (`customer_360_v`), tabok: **Áttekintés / Projektek / Ajánlatok / Aktivitás / Kapcsolat / Dokumentumok**.
- Új komponens: `src/components/customers/customer-360-header.tsx`.
- Aktivitás tab a meglévő `customer_activity_v`-t használja, csoportosítva nap szerint.

### 2. Activity Timeline (új route)
- `src/routes/_authenticated/activity.tsx` — globális idővonal `activity_timeline_v`-ből, szűrőkkel (esemény típus, felhasználó, dátum, customer).
- Sidebar menüpont (Pulse mellé): „Aktivitás".

### 3. Vezetői Dashboard
- `src/routes/_authenticated/dashboard.tsx` bővítése (nem új route):
  - Pipeline blokk: `dashboard_pipeline_v` → bar chart státuszonként.
  - Bevétel blokk: `dashboard_revenue_monthly_v` → line chart 12 hónap.
  - Workload tábla: `dashboard_user_workload_v`.
  - Meglévő `CustomerKpiWidgets` megmarad alul.
- Új komponens: `src/components/dashboard/exec-widgets.tsx` (3 kártya + recharts).

### 4. Jogosultság audit & finomhangolás
- `src/lib/permissions.ts` — `canAccessRoute` átállítása async lookup-ra ELLENI: marad sync default, DE új hook: `useRoutePermissions()` → `route_permissions` táblát olvas, fallback a kódban lévő `ROUTE_ACCESS`-re. Így DB nélkül is működik.
- `src/routes/_authenticated/route.tsx` — child-route gate hozzáadása (jelenleg csak auth, role check nincs).
- `src/routes/_authenticated/settings.permissions-audit.tsx` — már létezik; bővítés szerkeszthető mátrix-szá (role × route checkbox), írás a `route_permissions` táblába (owner only).

## Sorrend
1. **DB SQL #1** — view-k (`customer_360_v`, `dashboard_*`, `activity_timeline_v`) — átadás → user futtatja.
2. **DB SQL #2** — `route_permissions` tábla + `has_route_access` function + RLS + GRANT-ok.
3. **Frontend** — fenti 4 modul, parallel fájl írással.
4. **Sanity build** — verify, majd rövid teszt útmutató.

## Technikai részletek
- Charts: `recharts` (már a projektben szerepel a `src/components/ui/chart.tsx` miatt).
- Query keys: `["customer_360", id]`, `["dashboard","pipeline"]`, `["activity","timeline", filters]`, `["route_permissions"]`.
- Minden lekérdezés `useQuery`-vel, staleTime 30s a dashboard kártyákon.
- Nincs új npm dependency.

## Kockázatok
- Ha a `tasks.assigned_user` nem `users_profile.id`-re mutat (Sprint 2-ben tisztáztuk: `auth.users.id`), a workload view-ban `JOIN users_profile ON up.auth_user_id = t.assigned_user` használat — ezt a SQL-ben kezelem.
- `route_permissions` séma változás esetén a frontend fallback marad (`ROUTE_ACCESS` const), tehát nem törik el a UI ha a tábla még nincs migrálva.

---

**Jóváhagyás után küldöm sorrendben:** SQL #1 → SQL #2 → frontend kód.
