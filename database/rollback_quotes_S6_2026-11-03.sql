-- Rollback: Ajánlatkezelés V2.0 S6 (sablonok), 2026-11-03. Előtte mentsd a kitöltött feltételeket:
-- SELECT id, template_key, template_version, template_terms, site_address FROM quotes WHERE template_key IS NOT NULL;
DROP TRIGGER IF EXISTS quotes_inherit_template ON public.quotes;
DROP FUNCTION IF EXISTS public.quotes_inherit_template();
ALTER TABLE public.quotes DROP COLUMN IF EXISTS template_key, DROP COLUMN IF EXISTS template_version,
  DROP COLUMN IF EXISTS template_terms, DROP COLUMN IF EXISTS site_address;
