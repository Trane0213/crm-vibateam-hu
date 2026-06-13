
# Backend-first refaktor terv

## Cél
Minden frontend-oldali Supabase lekérdezés és üzleti számítás átkerül a backendre. UI csak megjelenítés és események. Séma: **csak bővítés**, semmi DROP.

## Jelenlegi állapot (audit)
- **39 frontend fájl** hívja közvetlenül `supabase.from(...)`-t (route-ok, komponensek, hookok).
- **13 server fájl** már létezik (`*.functions.ts`, `*.server.ts`) — Gmail sync, AI, R2, enrichment részben.
- Üzleti motorok már kész: enrichment, dedupe, company health, data quality, lead quality, handoff, marketing KPI, identity, backfill, lead workspace — ezek **nem íródnak újra**, csak server-fn wrapperbe kerülnek.

## Hatókör — mit jelent „teljes frontend logika a backendre"

| Réteg | Most | Cél |
|---|---|---|
| Lista lekérdezések (companies, contacts, leads, emails, …) | `supabase.from()` komponensben | `createServerFn` + `useSuspenseQuery` |
| Szűrés / rendezés / lapozás | kliens-oldal | server fn paraméter |
| Számítások (lead score, company health, KPI) | komponensben / kliens hook | Postgres view vagy server fn |
| Aggregátumok (dashboard, marketing KPI) | több query + JS reduce | egy RPC / view |
| Mutációk (insert/update/delete) | `supabase.from().insert()` | `createServerFn` + Zod validáció |
| Engedély-ellenőrzés (`has_role`, route access) | kliens guard | server fn middleware + RLS |

## Séma bővítések (csak ADD, semmi DROP)

Új objektumok migrációként, meglévő adat érintetlen:

1. **Views** (read-only, aggregátumok):
   - `v_company_overview` — company + linked contacts count + linked leads count + last email date + health score
   - `v_lead_pipeline` — lead + company + owner + score + next_action
   - `v_email_thread_enriched` — thread + matched company + matched contact + project link
   - `v_marketing_kpi_daily` — napi import/contact/lead/email aggregátum
   - `v_data_quality_summary` — táblánként hiányzó mezők, orphan rekordok
2. **RPC-k** (security definer, RLS-szel kompatibilis):
   - `rpc_dashboard_today(user_id)` — today oldal teljes payloadja egy hívásban
   - `rpc_company_full(company_id)` — company detail oldal (company + contacts + leads + emails + tasks + projects)
   - `rpc_search_global(query, limit)` — global search egy hívásban minden entitásra
   - `rpc_marketing_overview(date_from, date_to)` — marketing dashboard
   - `rpc_recompute_lead_score(lead_id)` — lead quality számítás szerveroldalt
3. **Nincs új tábla** az első körben. Ha kiderül hogy egy meglévő számítást érdemes anyagolni (materialized view / cache tábla), külön döntésként, S2-ben.

## Server function réteg (új fájlok)

`src/lib/<domain>/<domain>.functions.ts` minta, mind `createServerFn` + `requireSupabaseAuth` middleware:

```
src/lib/companies/companies.functions.ts     — list, get, create, update, archive, mergeDuplicates
src/lib/contacts/contacts.functions.ts       — list, get, create, update, linkToCompany
src/lib/leads/leads.functions.ts             — list, get, create, update, qualify, handoff, recomputeScore
src/lib/emails/emails.functions.ts           — listThreads, getThread, linkThreadToCompany, linkThreadToProject
src/lib/customers/customers.functions.ts     — list, get, create, update, healthRefresh
src/lib/projects/projects.functions.ts       — list, get, create, update, attachEmail, attachQuote
src/lib/quotes/quotes.functions.ts           — list, get, create, update, send
src/lib/tasks/tasks.functions.ts             — list, get, create, update, complete
src/lib/followups/followups.functions.ts     — list, snooze, complete
src/lib/dashboard/dashboard.functions.ts     — today, kpis (RPC wrapperek)
src/lib/data-quality/dq.functions.ts         — summary, fix actions
src/lib/marketing/marketing.functions.ts     — kpi, lead-pipeline, import-batches
src/lib/search/search.functions.ts           — global search
src/lib/admin/admin.functions.ts             — users, roles, agent-visibility, audit
```

A meglévő motorok (`enrichment/`, `dedupe/`, `lead-workspace/`, `crm/crm-surface.ts`) **kompozícióban** kerülnek be — wrapper hívja, nem újraírás.

## Migrációs fázisok

### S0 (Stabilizáció — előfeltétel)
A korábbi audit nyitott pontjai. **Nem indul el az S1, amíg ez nincs lezárva.**
- Email backfill futtatás (0% → cél: >80% thread linkelt).
- `email_threads.participants` populálás javítása a Gmail incremental syncben.
- 1 orphan lead rendezése.
- Döntés: Scarlet import → auto-lead generáljon-e.

### S1 — Read path (kockázat: alacsony)
Új views + read-only `createServerFn`-ek. Frontend lista/detail oldalak átállítása `useSuspenseQuery`-re. Mutációk maradnak régiben.
Output: 39 fájl helyett ~15 hívás-pont a server fn rétegen át.

### S2 — Write path (kockázat: közepes)
Mutációs server fn-ek Zod validációval. Frontend `supabase.from().insert/update/delete` hívások cseréje. Activity log szervert-oldali trigger.

### S3 — Aggregátumok & RPC-k
Dashboard, marketing KPI, global search egy-egy RPC-re. Frontend reduce/map logika törlése.

### S4 — Computed / cache (opcionális)
Materialized view vagy cache tábla a drága számításokra (health score, dedupe match), `pg_cron` refresh. Csak akkor, ha S3 után mérhető lassú.

## Mit NEM csinálunk
- Új UI modul / route refaktor (D9 fagyasztva).
- Edge Function új logikára (a stack TanStack server fn, edge function csak webhook).
- RLS lazítás. Minden új server fn `requireSupabaseAuth` middleware-rel + user-scope RLS.
- Tábla DROP, oszlop átnevezés, FK módosítás. Csak ADD.

## Technikai szabályok
- `client.server.ts` (service role) csak `.handler()` body-ban `await import(...)` — soha module-scope.
- Public read view-okra `GRANT SELECT` az `authenticated`-re, soha `anon`-ra.
- Minden új view `WITH (security_invoker=on)`, hogy az RLS a hívó user nevében fusson.
- Lista server fn-ek paraméter-shape: `{ filter, sort, page, pageSize }` Zod-validált.

## Első lépés visszaigazolásra
Megerősítést kérek:
1. **S0 lezárása előfeltétel** (email backfill + orphan lead + participants fix) — most futtassam le?
2. **S1 első batch**: melyik domain induljon? Javaslat: **companies + contacts** (legtöbb adat, legtöbb fájl, és a marketing/sales modul építőköve).
3. **View-k név-prefixe** `v_` és RPC-k `rpc_` — elfogadható?

Csak ezek után írok migrációt vagy fájlt.
