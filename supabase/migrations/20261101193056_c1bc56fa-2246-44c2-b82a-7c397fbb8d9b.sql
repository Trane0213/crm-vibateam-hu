ALTER TABLE public.quote_requests
  ADD COLUMN IF NOT EXISTS source_lead_id uuid,
  ADD COLUMN IF NOT EXISTS source_system text,
  ADD COLUMN IF NOT EXISTS source_type text,
  ADD COLUMN IF NOT EXISTS source_page text,
  ADD COLUMN IF NOT EXISTS origin_page text,
  ADD COLUMN IF NOT EXISTS entry_page text,
  ADD COLUMN IF NOT EXISTS utm jsonb,
  ADD COLUMN IF NOT EXISTS payload jsonb,
  ADD COLUMN IF NOT EXISTS attachment_path text,
  ADD COLUMN IF NOT EXISTS source_created_at timestamptz,
  ADD COLUMN IF NOT EXISTS synced_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS quote_requests_source_lead_id_key ON public.quote_requests(source_lead_id) WHERE source_lead_id IS NOT NULL;