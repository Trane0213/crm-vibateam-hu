-- Visszaállítás: weboldal→CRM szinkron mezők eltávolítása a quote_requests-ből.
-- FIGYELEM: a szinkronizált sorok forrásmezői elvesznek. Előtte mentés ajánlott.
DROP INDEX IF EXISTS public.quote_requests_source_lead_id_key;
ALTER TABLE public.quote_requests
  DROP COLUMN IF EXISTS source_lead_id, DROP COLUMN IF EXISTS source_system,
  DROP COLUMN IF EXISTS source_type, DROP COLUMN IF EXISTS source_page,
  DROP COLUMN IF EXISTS origin_page, DROP COLUMN IF EXISTS entry_page,
  DROP COLUMN IF EXISTS utm, DROP COLUMN IF EXISTS payload,
  DROP COLUMN IF EXISTS attachment_path, DROP COLUMN IF EXISTS source_created_at,
  DROP COLUMN IF EXISTS synced_at;
-- Kód: src/routes/api/public/website-lead-sync.ts és src/lib/website-lead-sync*.ts törlése,
-- quote-requests.functions.ts és web-quote-requests oldalak visszaállítása.
