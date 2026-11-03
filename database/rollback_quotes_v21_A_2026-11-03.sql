-- V2.1/A rollback: definition-only; no business rows changed.
DROP TRIGGER IF EXISTS quotes_send_evidence_guard ON public.quotes;
DROP FUNCTION IF EXISTS public.quotes_send_evidence_guard();

CREATE OR REPLACE FUNCTION public.quote_create_draft(p_lead_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v int := 1; g uuid; nid uuid;
BEGIN
  IF p_lead_id IS NOT NULL THEN
    PERFORM 1 FROM leads WHERE id = p_lead_id FOR UPDATE;
    SELECT group_id INTO g FROM quotes WHERE lead_id = p_lead_id ORDER BY is_current DESC, created_at DESC LIMIT 1;
  END IF;
  IF g IS NULL THEN g := gen_random_uuid();
  ELSE
    SELECT COALESCE(max(version),0)+1 INTO v FROM quotes WHERE group_id = g AND alternative_key = 'A';
    UPDATE quotes SET is_current = false WHERE group_id = g AND alternative_key = 'A' AND is_current;
  END IF;
  INSERT INTO quotes(lead_id, version, is_current, status, group_id, alternative_key)
  VALUES (p_lead_id, v, true, 'draft', g, 'A') RETURNING id INTO nid;
  RETURN nid;
END $$;

CREATE OR REPLACE FUNCTION public.quote_new_version(p_quote_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE src quotes%ROWTYPE; v int; nid uuid;
BEGIN
  SELECT * INTO src FROM quotes WHERE id = p_quote_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Az ajánlat nem található vagy nincs jogosultság' USING ERRCODE = '42501'; END IF;
  SELECT COALESCE(max(version),0)+1 INTO v FROM quotes WHERE group_id = src.group_id AND alternative_key = src.alternative_key;
  UPDATE quotes SET is_current = false WHERE group_id = src.group_id AND alternative_key = src.alternative_key AND is_current;
  INSERT INTO quotes(lead_id, project_id, version, is_current, status, title, valid_until, notes, discount_percent, tax_percent,
    quote_kind, scope_type, scope_note, contact_id, responsible_user_id, request_due_date, offer_due_date, manual_net_amount,
    technical_scope, exclusions, group_id, alternative_key, alternative_label)
  VALUES (src.lead_id, src.project_id, v, true, 'draft', src.title, src.valid_until, src.notes, src.discount_percent, src.tax_percent,
    src.quote_kind, src.scope_type, src.scope_note, src.contact_id, src.responsible_user_id, src.request_due_date, src.offer_due_date, src.manual_net_amount,
    src.technical_scope, src.exclusions, src.group_id, src.alternative_key, src.alternative_label)
  RETURNING id INTO nid;
  INSERT INTO quote_items(quote_id, name, quantity, unit, unit_price, section)
    SELECT nid, name, quantity, unit, unit_price, section FROM quote_items WHERE quote_id = p_quote_id ORDER BY created_at;
  RETURN nid;
END $$;

CREATE OR REPLACE FUNCTION public.quote_new_alternative(p_quote_id uuid, p_label text) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE src quotes%ROWTYPE; k text; nid uuid;
BEGIN
  SELECT * INTO src FROM quotes WHERE id = p_quote_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Az ajánlat nem található vagy nincs jogosultság' USING ERRCODE = '42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext(src.group_id::text));
  SELECT chr(ascii(max(alternative_key)) + 1) INTO k FROM quotes WHERE group_id = src.group_id;
  IF k > 'Z' THEN RAISE EXCEPTION 'Túl sok alternatíva'; END IF;
  INSERT INTO quotes(lead_id, project_id, version, is_current, status, title, valid_until, tax_percent,
    quote_kind, scope_type, contact_id, responsible_user_id, request_due_date, offer_due_date, group_id, alternative_key, alternative_label)
  VALUES (src.lead_id, src.project_id, 1, true, 'draft', src.title, src.valid_until, src.tax_percent,
    src.quote_kind, src.scope_type, src.contact_id, src.responsible_user_id, src.request_due_date, src.offer_due_date, src.group_id, k,
    NULLIF(left(trim(COALESCE(p_label,'')), 120), ''))
  RETURNING id INTO nid;
  RETURN nid;
END $$;

CREATE OR REPLACE FUNCTION public.quote_lock_sent(p_quote_id uuid) RETURNS timestamptz
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE t timestamptz;
BEGIN
  UPDATE quotes SET locked_at = now() WHERE id = p_quote_id AND locked_at IS NULL RETURNING locked_at INTO t;
  IF t IS NULL THEN RAISE EXCEPTION 'Az ajánlat nem rögzíthető (már rögzített, vagy nincs jogosultság)' USING ERRCODE = '42501'; END IF;
  RETURN t;
END $$;
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
