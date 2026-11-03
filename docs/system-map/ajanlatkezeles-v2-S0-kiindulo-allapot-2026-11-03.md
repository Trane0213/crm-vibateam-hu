# Ajánlatkezelés V2.0 – S0 kiinduló állapot (2026-11-03, 14:31 Budapest)

Csak olvasás. Kód, adat, RLS, séma nem változott; nem publikált.
Visszaállítás: `docs/rollback/quotes-S0-2026-11-03/baseline-restore.sql` (policyk + 4 quote + 2 tétel upsert).

## Adat
| quote id | lead | projekt | státusz | cím | tételek |
|---|---|---|---|---|---|
| c9684593… | – | – | draft | – | 0 |
| 6eaab55c… | 43b05791 (TESZT) | 3c69f3f3 | draft | TESZT – Sales S2 ajánlat (áfa 27) | 1: TESZT tétel klíma 2×100 000 |
| da53c565… | 8e70667a | – | draft | teszt (érv. 2026-11-04) | 1: alapszereles 1×6 000, egység „5” |
| 7874be50… | – | – | draft | – | 0 |

Mind version=1, is_current=true, total_amount=NULL; mindkét tételnél total_price=0 (nem számolt). followups.quote_id kitöltve: 0.

## Séma
- `quotes`: id, project_id, version, status (def. draft), created_by (def. current_profile_id()), total_amount, created_at, lead_id, is_current, title, valid_until, notes, discount_percent, tax_percent. Nincs company_id, sent_at, egyedi current-constraint.
- `quote_items`: id, quote_id (nullable), name, quantity, unit, unit_price, total_price, created_at.
- Trigger: egyik táblán sincs.

## Jogosultság (RLS)
- `quotes_write`, `quote_items_write`: ALL, authenticated; owner VAGY bármely project_manager/sales – nincs leadfelelős/projekt szűkítés (S1 célja).

## Érintett kód (SHA-256)
```
29eefc27…87d1  src/components/quotes/quote-items-panel.tsx
4568eb6f…f0f4  src/components/lead-workspace/lead-action-panel.tsx
7f716446…bfc4  src/routes/_authenticated/quotes.$id.tsx
8135ce9b…d1d4  src/lib/quotes/create.ts
869c2fd7…2633  src/lib/owner-kpis.ts
86a3aa42…2fec  src/routes/_authenticated/quotes.index.tsx
b2bacdfa…dfd8  src/components/pipeline/pipeline-data.ts
ef3e0bce…ffe8  src/routes/_authenticated/sales.quotes.tsx
f9c9ef12…d2d3  src/routes/_authenticated/quotes.$id_.print.tsx
```
Egyéb olvasók: ai-panel, global-search, crm-tools.server, companies-export, use-daily-work, customers.$id/index, settings.audit, settings.dashboard-status.

## STOP
S1 (jogosultság-szigorítás + auditált hibák) csak külön jóváhagyással indul.
