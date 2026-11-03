ALTER TABLE public.quotes ADD CONSTRAINT quotes_status_check
  CHECK (status IS NULL OR status IN ('draft','ready','sent','negotiation','accepted','rejected','withdrawn'));

CREATE UNIQUE INDEX IF NOT EXISTS followups_one_open_per_quote ON public.followups(quote_id) WHERE quote_id IS NOT NULL AND completed IS NOT TRUE;

CREATE OR REPLACE FUNCTION public.quotes_status_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o text := coalesce(OLD.status,'draft'); n text := coalesce(NEW.status,'draft');
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF n NOT IN ('draft','ready') THEN RAISE EXCEPTION 'Új ajánlat csak piszkozat vagy előkészített lehet' USING ERRCODE='check_violation'; END IF;
    RETURN NEW;
  END IF;
  IF n = o THEN RETURN NEW; END IF;
  IF o IN ('accepted','rejected','withdrawn') THEN
    RAISE EXCEPTION 'Lezárt ajánlat állapota nem módosítható — készíts új verziót' USING ERRCODE='check_violation';
  END IF;
  IF n IN ('sent','negotiation','accepted','rejected') AND NEW.sent_at IS NULL THEN
    RAISE EXCEPTION 'Ez az állapot csak igazolt kiküldés után állítható' USING ERRCODE='check_violation';
  END IF;
  IF n IN ('draft','ready') AND OLD.sent_at IS NOT NULL THEN
    RAISE EXCEPTION 'Kiküldött ajánlat nem állítható vissza piszkozatra' USING ERRCODE='check_violation';
  END IF;
  IF n IN ('accepted','rejected','withdrawn') THEN
    UPDATE followups SET completed = true,
      result = coalesce(nullif(result,''), 'Ajánlat lezárva: ' || CASE n WHEN 'accepted' THEN 'elfogadott' WHEN 'rejected' THEN 'elutasított' ELSE 'visszavont' END)
     WHERE quote_id = NEW.id AND completed IS NOT TRUE;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS quotes_status_guard ON public.quotes;
CREATE TRIGGER quotes_status_guard BEFORE INSERT OR UPDATE OF status ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.quotes_status_guard();

CREATE OR REPLACE FUNCTION public.quote_schedule_followup(p_quote_id uuid, p_due timestamptz, p_type text, p_note text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE q record; fid uuid; v_company uuid;
BEGIN
  IF p_due IS NULL OR p_type NOT IN ('phone','email') THEN
    RAISE EXCEPTION 'Add meg az utánkövetés dátumát és módját (telefon vagy e-mail)' USING ERRCODE='check_violation';
  END IF;
  SELECT id, lead_id, project_id, status, responsible_user_id, created_by INTO q FROM quotes WHERE id = p_quote_id;
  IF q.id IS NULL THEN RAISE EXCEPTION 'Az ajánlathoz nincs jogosultságod' USING ERRCODE='insufficient_privilege'; END IF;
  IF coalesce(q.status,'draft') NOT IN ('sent','negotiation') THEN
    RAISE EXCEPTION 'Utánkövetés csak kiküldött vagy pontosítás alatti ajánlatnál rögzíthető' USING ERRCODE='check_violation';
  END IF;
  SELECT company_id INTO v_company FROM leads WHERE id = q.lead_id;
  UPDATE followups SET due_date = p_due, followup_type = p_type, result = p_note,
         assigned_to = coalesce(q.responsible_user_id, assigned_to)
   WHERE quote_id = q.id AND completed IS NOT TRUE RETURNING id INTO fid;
  IF fid IS NULL THEN
    INSERT INTO followups(quote_id, lead_id, project_id, company_id, followup_type, due_date, completed, result, assigned_to)
    VALUES (q.id, q.lead_id, q.project_id, v_company, p_type, p_due, false, p_note, coalesce(q.responsible_user_id, q.created_by))
    RETURNING id INTO fid;
  END IF;
  IF q.lead_id IS NOT NULL THEN
    UPDATE leads SET next_step_type = p_type, next_step_due_at = p_due,
           next_step_note = coalesce(nullif(p_note,''), 'Ajánlat utánkövetése')
     WHERE id = q.lead_id AND status NOT IN ('won','lost');
  END IF;
  RETURN fid;
END $$;
REVOKE ALL ON FUNCTION public.quote_schedule_followup(uuid, timestamptz, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.quote_schedule_followup(uuid, timestamptz, text, text) TO authenticated;