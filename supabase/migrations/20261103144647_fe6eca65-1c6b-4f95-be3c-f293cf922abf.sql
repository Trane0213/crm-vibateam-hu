DROP TRIGGER IF EXISTS quotes_inherit_template ON public.quotes;
CREATE OR REPLACE FUNCTION public.quote_create_draft(p_lead_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v int := 1; g uuid; nid uuid; src quotes%ROWTYPE;
BEGIN
  IF p_lead_id IS NOT NULL THEN
    PERFORM 1 FROM leads WHERE id = p_lead_id FOR UPDATE;
    SELECT group_id INTO g FROM quotes WHERE lead_id = p_lead_id ORDER BY is_current DESC, created_at DESC LIMIT 1;
  END IF;
  IF g IS NULL THEN g := gen_random_uuid();
  ELSE
    SELECT COALESCE(max(version),0)+1 INTO v FROM quotes WHERE group_id = g AND alternative_key = 'A';
    SELECT * INTO src FROM quotes WHERE group_id = g AND alternative_key = 'A' ORDER BY version DESC LIMIT 1;
    UPDATE quotes SET is_current = false WHERE group_id = g AND alternative_key = 'A' AND is_current;
  END IF;
  INSERT INTO quotes(lead_id, version, is_current, status, group_id, alternative_key, template_key, template_version, template_terms, site_address)
  VALUES (p_lead_id, v, true, 'draft', g, 'A', src.template_key, src.template_version, coalesce(src.template_terms, '{}'::jsonb), src.site_address) RETURNING id INTO nid;
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
    technical_scope, exclusions, group_id, alternative_key, alternative_label, template_key, template_version, template_terms, site_address)
  VALUES (src.lead_id, src.project_id, v, true, 'draft', src.title, src.valid_until, src.notes, src.discount_percent, src.tax_percent,
    src.quote_kind, src.scope_type, src.scope_note, src.contact_id, src.responsible_user_id, src.request_due_date, src.offer_due_date, src.manual_net_amount,
    src.technical_scope, src.exclusions, src.group_id, src.alternative_key, src.alternative_label, src.template_key, src.template_version, src.template_terms, src.site_address)
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
    quote_kind, scope_type, contact_id, responsible_user_id, request_due_date, offer_due_date, group_id, alternative_key, alternative_label, template_key, template_version, template_terms, site_address)
  VALUES (src.lead_id, src.project_id, 1, true, 'draft', src.title, src.valid_until, src.tax_percent,
    src.quote_kind, src.scope_type, src.contact_id, src.responsible_user_id, src.request_due_date, src.offer_due_date, src.group_id, k,
    NULLIF(left(trim(COALESCE(p_label,'')), 120), ''), src.template_key, src.template_version, src.template_terms, src.site_address)
  RETURNING id INTO nid;
  RETURN nid;
END $$;
CREATE OR REPLACE FUNCTION public.quote_lock_sent(p_quote_id uuid) RETURNS timestamptz
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE t timestamptz;
BEGIN
  SELECT sent_at INTO t FROM quote_sends WHERE quote_id = p_quote_id
    AND status IN ('sent','recorded') AND sent_at IS NOT NULL AND nullif(btrim(gmail_message_id),'') IS NOT NULL
    ORDER BY sent_at DESC LIMIT 1;
  IF t IS NULL THEN RAISE EXCEPTION 'Igazolt Gmail-kiküldés vagy elküldött levél hozzárendelése szükséges' USING ERRCODE='check_violation'; END IF;
  UPDATE quotes SET locked_at = t, sent_at = t, status = 'sent' WHERE id = p_quote_id AND locked_at IS NULL RETURNING locked_at INTO t;
  IF t IS NULL THEN RAISE EXCEPTION 'Az ajánlat nem rögzíthető (már rögzített, vagy nincs jogosultság)' USING ERRCODE='42501'; END IF;
  RETURN t;
END $$;
CREATE OR REPLACE FUNCTION public.quotes_send_evidence_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.sent_at IS NOT NULL OR NEW.locked_at IS NOT NULL THEN
      RAISE EXCEPTION 'Új ajánlat nem rögzíthető kiküldöttként' USING ERRCODE='check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF (NEW.sent_at IS DISTINCT FROM OLD.sent_at OR NEW.locked_at IS DISTINCT FROM OLD.locked_at
      OR (NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('sent','negotiation','accepted','rejected')))
    AND (NEW.sent_at IS NOT NULL OR NEW.locked_at IS NOT NULL OR NEW.status IN ('sent','negotiation','accepted','rejected')) THEN
    IF NOT EXISTS (SELECT 1 FROM public.quote_sends s WHERE s.quote_id=NEW.id
      AND s.status IN ('sent','recorded') AND s.sent_at IS NOT NULL
      AND nullif(btrim(s.gmail_message_id),'') IS NOT NULL
      AND (NEW.sent_at IS NULL OR NEW.sent_at=s.sent_at)) THEN
      RAISE EXCEPTION 'Igazolt Gmail-kiküldés vagy elküldött levél hozzárendelése szükséges' USING ERRCODE='check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.quotes_send_evidence_guard() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER quotes_send_evidence_guard BEFORE INSERT OR UPDATE ON public.quotes
FOR EACH ROW EXECUTE FUNCTION public.quotes_send_evidence_guard();