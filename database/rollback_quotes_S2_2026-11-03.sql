-- Ajánlatkezelés V2.0 S2 visszaállítása (csak tulajdonosi jóváhagyással).
-- FIGYELEM: előbb ellenőrizd, van-e quote_documents sor; ha van, a hozzá tartozó R2-fájlokat
-- (quote-documents/<quote_id>/...) nem törli ez a script — azokat előbb mentsd/kezeld.
DROP TABLE IF EXISTS public.quote_documents;
ALTER TABLE public.quotes
  DROP COLUMN IF EXISTS quote_kind, DROP COLUMN IF EXISTS scope_type, DROP COLUMN IF EXISTS scope_note,
  DROP COLUMN IF EXISTS contact_id, DROP COLUMN IF EXISTS responsible_user_id,
  DROP COLUMN IF EXISTS request_due_date, DROP COLUMN IF EXISTS offer_due_date,
  DROP COLUMN IF EXISTS manual_net_amount, DROP COLUMN IF EXISTS technical_scope, DROP COLUMN IF EXISTS exclusions;
