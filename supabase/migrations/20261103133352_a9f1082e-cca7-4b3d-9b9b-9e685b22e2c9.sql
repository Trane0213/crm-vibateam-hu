CREATE OR REPLACE FUNCTION public.can_access_quote(_lead_id uuid, _project_id uuid, _created_by uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r text; uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RETURN false; END IF;
  IF is_owner_role(uid) THEN RETURN true; END IF;
  r := crm_role_of(uid);
  IF _lead_id IS NULL AND _project_id IS NULL THEN
    RETURN r IN ('sales','project_manager','pm') AND _created_by = current_profile_id();
  END IF;
  IF r = 'sales' THEN
    RETURN EXISTS (SELECT 1 FROM leads l WHERE l.id = _lead_id AND l.assigned_to = uid)
        OR EXISTS (SELECT 1 FROM projects p JOIN leads l ON l.id = p.lead_id WHERE p.id = _project_id AND l.assigned_to = uid);
  ELSIF r IN ('project_manager','pm') THEN
    RETURN EXISTS (SELECT 1 FROM projects p WHERE p.id = _project_id AND p.project_manager_user_id = uid)
        OR EXISTS (SELECT 1 FROM projects p WHERE p.lead_id = _lead_id AND _lead_id IS NOT NULL AND p.project_manager_user_id = uid);
  END IF;
  RETURN false;
END $$;
REVOKE ALL ON FUNCTION public.can_access_quote(uuid,uuid,uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.can_access_quote(uuid,uuid,uuid) TO authenticated;

DROP POLICY IF EXISTS quotes_write ON public.quotes;
CREATE POLICY quotes_access ON public.quotes FOR ALL TO authenticated
  USING (can_access_quote(lead_id, project_id, created_by))
  WITH CHECK (can_access_quote(lead_id, project_id, created_by));
DROP POLICY IF EXISTS quote_items_write ON public.quote_items;
CREATE POLICY quote_items_access ON public.quote_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM quotes q WHERE q.id = quote_id AND can_access_quote(q.lead_id, q.project_id, q.created_by)))
  WITH CHECK (EXISTS (SELECT 1 FROM quotes q WHERE q.id = quote_id AND can_access_quote(q.lead_id, q.project_id, q.created_by)));

-- Összegek
CREATE OR REPLACE FUNCTION public.quote_recalc_total(_quote_id uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE quotes q SET total_amount = round(
    COALESCE((SELECT sum(COALESCE(i.quantity,0)*COALESCE(i.unit_price,0)) FROM quote_items i WHERE i.quote_id = q.id),0)
    * (1 - COALESCE(q.discount_percent,0)/100.0), 2)
  WHERE q.id = _quote_id;
$$;
REVOKE ALL ON FUNCTION public.quote_recalc_total(uuid) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.quote_items_calc() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.total_price := COALESCE(NEW.quantity,0)*COALESCE(NEW.unit_price,0); RETURN NEW; END $$;
CREATE TRIGGER quote_items_calc BEFORE INSERT OR UPDATE ON public.quote_items FOR EACH ROW EXECUTE FUNCTION public.quote_items_calc();

CREATE OR REPLACE FUNCTION public.quote_items_after() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP <> 'INSERT' AND OLD.quote_id IS NOT NULL THEN PERFORM quote_recalc_total(OLD.quote_id); END IF;
  IF TG_OP <> 'DELETE' AND NEW.quote_id IS NOT NULL THEN PERFORM quote_recalc_total(NEW.quote_id); END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER quote_items_after AFTER INSERT OR UPDATE OR DELETE ON public.quote_items FOR EACH ROW EXECUTE FUNCTION public.quote_items_after();

CREATE OR REPLACE FUNCTION public.quotes_discount_after() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM quote_recalc_total(NEW.id); RETURN NULL; END $$;
CREATE TRIGGER quotes_discount_after AFTER UPDATE OF discount_percent ON public.quotes FOR EACH ROW EXECUTE FUNCTION public.quotes_discount_after();

UPDATE public.quote_items SET quantity = quantity;
SELECT public.quote_recalc_total(id) FROM public.quotes;

-- Egy aktuális verzió leadenként
CREATE UNIQUE INDEX IF NOT EXISTS quotes_one_current_per_lead ON public.quotes(lead_id) WHERE is_current AND lead_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.quote_create_draft(p_lead_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v int := 1; nid uuid;
BEGIN
  IF p_lead_id IS NOT NULL THEN
    PERFORM 1 FROM leads WHERE id = p_lead_id FOR UPDATE;
    SELECT COALESCE(max(version),0)+1 INTO v FROM quotes WHERE lead_id = p_lead_id;
    UPDATE quotes SET is_current = false WHERE lead_id = p_lead_id AND is_current;
  END IF;
  INSERT INTO quotes(lead_id, version, is_current, status) VALUES (p_lead_id, v, true, 'draft') RETURNING id INTO nid;
  RETURN nid;
END $$;
REVOKE ALL ON FUNCTION public.quote_create_draft(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.quote_create_draft(uuid) TO authenticated;