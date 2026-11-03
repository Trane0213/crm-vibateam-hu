-- Restore P2 callers first. No row deletion. Keeps all business/memory/audit data.
DROP FUNCTION IF EXISTS public.ai_os_daily_sales_read(uuid);
DROP FUNCTION IF EXISTS public.ai_os_daily_sales_claim(uuid,text);
DROP FUNCTION IF EXISTS public.ai_os_daily_sales_finish(uuid,text,uuid,text,jsonb);
DROP TRIGGER IF EXISTS ai_os_daily_sales_guard ON public.ai_memory;
DROP FUNCTION IF EXISTS public.ai_os_daily_sales_guard();