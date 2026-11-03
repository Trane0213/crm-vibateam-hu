ALTER TABLE public.quotes
  ADD COLUMN group_id uuid,
  ADD COLUMN alternative_key text NOT NULL DEFAULT 'A' CHECK (alternative_key ~ '^[A-Z]$'),
  ADD COLUMN alternative_label text,
  ADD COLUMN locked_at timestamptz;
UPDATE public.quotes SET group_id = id WHERE group_id IS NULL;
ALTER TABLE public.quotes ALTER COLUMN group_id SET DEFAULT gen_random_uuid(), ALTER COLUMN group_id SET NOT NULL;
DROP INDEX IF EXISTS public.quotes_one_current_per_lead;
CREATE UNIQUE INDEX quotes_one_current_per_alt ON public.quotes(group_id, alternative_key) WHERE is_current;
CREATE UNIQUE INDEX quotes_version_per_alt ON public.quotes(group_id, alternative_key, version);

ALTER TABLE public.quote_items ADD COLUMN section text;

-- Kiküldött (rögzített) ajánlat védelme
CREATE OR REPLACE FUNCTION public.quotes_lock_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.locked_at IS NOT NULL THEN
    IF NEW.locked_at IS DISTINCT FROM OLD.locked_at
       OR (to_jsonb(NEW) - ARRAY['is_current','status','project_id','total_amount']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['is_current','status','project_id','total_amount']) THEN
      RAISE EXCEPTION 'Kiküldött ajánlat nem módosítható — készíts új verziót' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER quotes_lock_guard BEFORE UPDATE ON public.quotes FOR EACH ROW EXECUTE FUNCTION public.quotes_lock_guard();
CREATE OR REPLACE FUNCTION public.quotes_lock_delete_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.locked_at IS NOT NULL THEN RAISE EXCEPTION 'Kiküldött ajánlat nem törölhető' USING ERRCODE = 'check_violation'; END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER quotes_lock_delete_guard BEFORE DELETE ON public.quotes FOR EACH ROW EXECUTE FUNCTION public.quotes_lock_delete_guard();

CREATE OR REPLACE FUNCTION public.quote_items_lock_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE qid uuid := COALESCE(NEW.quote_id, OLD.quote_id);
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.quote_id IS DISTINCT FROM NEW.quote_id AND EXISTS (SELECT 1 FROM quotes WHERE id = OLD.quote_id AND locked_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Kiküldött ajánlat tételei nem módosíthatók' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM quotes WHERE id = qid AND locked_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Kiküldött ajánlat tételei nem módosíthatók — készíts új verziót' USING ERRCODE = 'check_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
REVOKE ALL ON FUNCTION public.quote_items_lock_guard() FROM public, anon, authenticated;
CREATE TRIGGER quote_items_lock_guard BEFORE INSERT OR UPDATE OR DELETE ON public.quote_items FOR EACH ROW EXECUTE FUNCTION public.quote_items_lock_guard();

DROP POLICY IF EXISTS quote_documents_delete ON public.quote_documents;
CREATE POLICY quote_documents_delete ON public.quote_documents FOR DELETE TO authenticated
  USING ((is_owner_role(auth.uid()) OR uploaded_by = current_profile_id())
    AND EXISTS (SELECT 1 FROM quotes q WHERE q.id = quote_id AND can_access_quote(q.lead_id, q.project_id, q.created_by)
      AND NOT (q.locked_at IS NOT NULL AND document_type = 'sent_offer')));

-- Új piszkozat leadhez: a lead meglévő csoportjának "A" alternatívájában új verzió
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

-- Új verzió meglévő ajánlatból (alapadatok + tételek másolása), egy tranzakcióban
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

-- Új alternatíva ugyanabban az üzleti ajánlatban (alapadatok másolása, tételek nélkül)
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

-- Kiküldöttként rögzítés (visszavonhatatlan)
CREATE OR REPLACE FUNCTION public.quote_lock_sent(p_quote_id uuid) RETURNS timestamptz
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE t timestamptz;
BEGIN
  UPDATE quotes SET locked_at = now() WHERE id = p_quote_id AND locked_at IS NULL RETURNING locked_at INTO t;
  IF t IS NULL THEN RAISE EXCEPTION 'Az ajánlat nem rögzíthető (már rögzített, vagy nincs jogosultság)' USING ERRCODE = '42501'; END IF;
  RETURN t;
END $$;

REVOKE ALL ON FUNCTION public.quote_new_version(uuid), public.quote_new_alternative(uuid, text), public.quote_lock_sent(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.quote_new_version(uuid), public.quote_new_alternative(uuid, text), public.quote_lock_sent(uuid) TO authenticated;