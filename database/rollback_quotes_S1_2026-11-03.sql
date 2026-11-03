-- Ajánlatkezelés V2.0 S1 visszaállítása (csak tulajdonosi jóváhagyással).
DROP TRIGGER IF EXISTS quote_items_calc ON public.quote_items;
DROP TRIGGER IF EXISTS quote_items_after ON public.quote_items;
DROP TRIGGER IF EXISTS quotes_discount_after ON public.quotes;
DROP FUNCTION IF EXISTS public.quote_items_calc();
DROP FUNCTION IF EXISTS public.quote_items_after();
DROP FUNCTION IF EXISTS public.quotes_discount_after();
DROP FUNCTION IF EXISTS public.quote_recalc_total(uuid);
DROP FUNCTION IF EXISTS public.quote_create_draft(uuid);
DROP INDEX IF EXISTS public.quotes_one_current_per_lead;
DROP POLICY IF EXISTS quotes_access ON public.quotes;
DROP POLICY IF EXISTS quote_items_access ON public.quote_items;
DROP FUNCTION IF EXISTS public.can_access_quote(uuid,uuid,uuid);
-- Ezután: docs/rollback/quotes-S0-2026-11-03/baseline-restore.sql (eredeti policyk + S0 adatsorok, total_amount=NULL, total_price=0).
