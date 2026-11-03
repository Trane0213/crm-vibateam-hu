-- Ajánlatkezelés V2.0 S4 visszaállítása (csak tulajdonosi jóváhagyással).
-- Előtte mentsd a quote_sends sorokat (kiküldési napló) — törlésük a bizonyíték elvesztése.
DROP TABLE IF EXISTS public.quote_sends;
ALTER TABLE public.quotes DROP COLUMN IF EXISTS sent_at;
-- quotes_lock_guard: S3-as változat (sent_at nélküli kivétellista), lásd S3 migráció.
