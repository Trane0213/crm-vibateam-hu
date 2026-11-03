-- Rollback: Ajánlatkezelés V2.0 S5 (állapotok + utánkövetés), 2026-11-03
-- Előtte mentsd: SELECT * FROM followups WHERE quote_id IS NOT NULL;
DROP TRIGGER IF EXISTS quotes_status_guard ON public.quotes;
DROP FUNCTION IF EXISTS public.quotes_status_guard();
DROP FUNCTION IF EXISTS public.quote_schedule_followup(uuid, timestamptz, text, text);
DROP INDEX IF EXISTS public.followups_one_open_per_quote;
ALTER TABLE public.quotes DROP CONSTRAINT IF EXISTS quotes_status_check;
