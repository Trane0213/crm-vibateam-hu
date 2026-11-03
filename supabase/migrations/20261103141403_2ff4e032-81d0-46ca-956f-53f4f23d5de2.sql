ALTER TABLE public.quotes
  ADD COLUMN template_key text CHECK (template_key IS NULL OR template_key IN ('private','b2b')),
  ADD COLUMN template_version integer,
  ADD COLUMN template_terms jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN site_address text CHECK (site_address IS NULL OR length(site_address) <= 500);

CREATE OR REPLACE FUNCTION public.quotes_inherit_template() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE src record;
BEGIN
  IF NEW.template_key IS NULL AND NEW.group_id IS NOT NULL THEN
    SELECT template_key, template_version, template_terms, site_address INTO src
      FROM quotes WHERE group_id = NEW.group_id AND id <> NEW.id AND template_key IS NOT NULL
      ORDER BY created_at DESC LIMIT 1;
    IF src.template_key IS NOT NULL THEN
      NEW.template_key := src.template_key; NEW.template_version := src.template_version;
      NEW.template_terms := src.template_terms; NEW.site_address := coalesce(NEW.site_address, src.site_address);
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.quotes_inherit_template() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER quotes_inherit_template BEFORE INSERT ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.quotes_inherit_template();