CREATE FUNCTION public.company_marketing_legacy_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
DECLARE before_markers text[]; after_markers text[];
BEGIN
 SELECT array_agg(m[1] ORDER BY m[1]) INTO after_markers FROM regexp_matches(coalesce(NEW.notes,''),'(\[MKT:STATUS:[^\]]*\]|\[KAMPANY:(?:EMAIL_SENT|REJECTED):[^\]]*\])','g') m;
 IF TG_OP='UPDATE' THEN
  SELECT array_agg(m[1] ORDER BY m[1]) INTO before_markers FROM regexp_matches(coalesce(OLD.notes,''),'(\[MKT:STATUS:[^\]]*\]|\[KAMPANY:(?:EMAIL_SENT|REJECTED):[^\]]*\])','g') m;
 END IF;
 IF after_markers IS DISTINCT FROM before_markers THEN
  RAISE EXCEPTION 'Legacy marketing status markers are read-only' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.company_marketing_legacy_guard() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER company_marketing_legacy_guard BEFORE INSERT OR UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.company_marketing_legacy_guard();

-- Preserve old signature but revoke its client entry; new path owns source update.
REVOKE EXECUTE ON FUNCTION public.company_set_marketing_status(uuid,text,jsonb,uuid) FROM authenticated;
CREATE FUNCTION public.company_set_marketing_status(p_company uuid,p_status text,p_expected jsonb,p_handoff_lead uuid,p_lead_source text)
RETURNS jsonb LANGUAGE plpgsql SET search_path=public AS $$
DECLARE c public.companies; next_notes text;
BEGIN
 IF auth.uid() IS NULL OR NOT coalesce(public.is_owner_role(auth.uid()) OR public.crm_role_of(auth.uid())='marketing',false) THEN
  RAISE EXCEPTION 'Only owner or marketing can change marketing status' USING ERRCODE='42501';
 END IF;
 IF p_status IS NULL OR p_status NOT IN ('new','contacted','qualified','handoff','rejected') THEN RAISE EXCEPTION 'Invalid marketing status'; END IF;
 SELECT * INTO c FROM public.companies WHERE id=p_company FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Company not accessible' USING ERRCODE='42501'; END IF;
 IF p_expected IS NULL OR NOT (p_expected ?& ARRAY['marketing_status','marketing_status_changed_at','notes'])
  OR (p_expected->>'marketing_status',nullif(p_expected->>'marketing_status_changed_at','')::timestamptz,p_expected->>'notes')
  IS DISTINCT FROM (c.marketing_status,c.marketing_status_changed_at,c.notes) THEN
  RAISE EXCEPTION 'A cég állapota megváltozott. Frissítsd az adatlapot.' USING ERRCODE='40001';
 END IF;
 next_notes:=c.notes;
 IF p_lead_source IS NOT NULL THEN
  IF p_status<>'handoff' OR p_lead_source NOT IN ('web_form','email_inbound','phone','personal','referral','google_ads','social','repeat_customer','partner','other') THEN RAISE EXCEPTION 'Invalid handoff source'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.leads WHERE id=p_handoff_lead AND company_id=p_company AND source=p_lead_source) THEN RAISE EXCEPTION 'Handoff source does not match lead'; END IF;
  next_notes:=rtrim(regexp_replace(coalesce(c.notes,''),'\[MKT:LEAD_SOURCE:[a-z_]+\]','','g'));
  next_notes:=CASE WHEN next_notes='' THEN '' ELSE next_notes||E'\n' END||'[MKT:LEAD_SOURCE:'||p_lead_source||']';
 END IF;
 UPDATE public.companies SET marketing_status=p_status,marketing_handoff_lead_id=p_handoff_lead,notes=next_notes WHERE id=c.id RETURNING * INTO c;
 IF NOT FOUND THEN RAISE EXCEPTION 'Company write not permitted' USING ERRCODE='42501'; END IF;
 RETURN to_jsonb(c);
END $$;
REVOKE ALL ON FUNCTION public.company_set_marketing_status(uuid,text,jsonb,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.company_set_marketing_status(uuid,text,jsonb,uuid,text) TO authenticated;