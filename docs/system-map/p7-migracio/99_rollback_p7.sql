-- P7 összevont migráció VISSZAÁLLÍTÁSA (TERV — NEM FUTTATVA). Csak a P7 által létrehozott objektumokat érinti.
-- FIGYELEM: a B/C/D táblákban és a quotes.pricing_mode oszlopban az élesítés óta rögzített adat elvész —
-- visszaállítás előtt exportáld: COPY (SELECT * FROM public.quote_package_approvals) TO …; ugyanígy a többi táblára
-- és SELECT id, pricing_mode FROM public.quotes WHERE pricing_mode IS NOT NULL.
BEGIN;
-- E) token: visszaáll a P2 szerinti táblaszintű olvasás
REVOKE SELECT (id, file_id, package_id, status, attempt, requested_by, dispatched_at, heartbeat_at, finished_at, error_code, error_detail, created_at, updated_at)
  ON public.package_processing_jobs FROM authenticated;
GRANT SELECT ON public.package_processing_jobs TO authenticated;
-- D)
DROP TABLE IF EXISTS public.pricing_rate_card_items;
DROP TABLE IF EXISTS public.pricing_rate_cards;
DROP FUNCTION IF EXISTS public.pricing_rate_card_items_guard();
DROP FUNCTION IF EXISTS public.pricing_rate_cards_guard();
-- C) (a jóváhagyás hivatkozhat számításra, ezért előbb)
DROP TABLE IF EXISTS public.quote_package_approvals;
DROP FUNCTION IF EXISTS public.quote_package_approvals_guard();
-- B)
DROP TABLE IF EXISTS public.quote_calculations;
DROP FUNCTION IF EXISTS public.quote_calculations_guard();
-- A)
ALTER TABLE public.quotes DROP CONSTRAINT IF EXISTS quotes_pricing_mode_check;
ALTER TABLE public.quotes DROP COLUMN IF EXISTS pricing_mode;
-- közös
DROP FUNCTION IF EXISTS public.p7_immutable_row();
DROP FUNCTION IF EXISTS public.p7_is_owner_or_sales(uuid);
COMMIT;
