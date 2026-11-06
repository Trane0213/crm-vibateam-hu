-- Nullable, no backfill. Existing company RLS policies and grants stay unchanged.
ALTER TABLE public.companies
 ADD COLUMN marketing_status text,
 ADD COLUMN marketing_status_changed_by uuid,
 ADD COLUMN marketing_status_changed_at timestamptz,
 ADD COLUMN marketing_status_source text,
 ADD COLUMN marketing_handoff_lead_id uuid;

CREATE FUNCTION public.company_marketing_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE changed boolean; service_write boolean;
BEGIN
 service_write := current_user = 'service_role' AND current_setting('app.marketing_sent_write',true) = '1';
 IF TG_OP='INSERT' THEN
  changed := NEW.marketing_status IS NOT NULL;
  IF NEW.marketing_status_changed_by IS NOT NULL OR NEW.marketing_status_changed_at IS NOT NULL OR NEW.marketing_status_source IS NOT NULL THEN
   RAISE EXCEPTION 'Marketing metadata is server controlled' USING ERRCODE='42501';
  END IF;
 ELSE
  changed := (NEW.marketing_status,NEW.marketing_handoff_lead_id) IS DISTINCT FROM (OLD.marketing_status,OLD.marketing_handoff_lead_id);
  IF NOT service_write AND (NEW.marketing_status_changed_by,NEW.marketing_status_changed_at,NEW.marketing_status_source)
   IS DISTINCT FROM (OLD.marketing_status_changed_by,OLD.marketing_status_changed_at,OLD.marketing_status_source) THEN
   RAISE EXCEPTION 'Marketing metadata is server controlled' USING ERRCODE='42501';
  END IF;
 END IF;
 IF NOT changed THEN RETURN NEW; END IF;
 IF NOT service_write AND (auth.uid() IS NULL OR NOT coalesce(public.is_owner_role(auth.uid()) OR public.crm_role_of(auth.uid())='marketing',false)) THEN
  RAISE EXCEPTION 'Only owner or marketing can change marketing status' USING ERRCODE='42501';
 END IF;
 IF NEW.marketing_status IS NULL OR NEW.marketing_status NOT IN ('new','contacted','qualified','handoff','rejected') THEN
  RAISE EXCEPTION 'Invalid marketing status';
 END IF;
 IF NEW.marketing_status='handoff' THEN
  IF NEW.marketing_handoff_lead_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.leads WHERE id=NEW.marketing_handoff_lead_id AND company_id=NEW.id) THEN
   RAISE EXCEPTION 'Handoff requires an accessible same-company lead';
  END IF;
 ELSIF NEW.marketing_handoff_lead_id IS NOT NULL THEN RAISE EXCEPTION 'Lead reference only allowed for handoff';
 END IF;
 IF NOT service_write THEN
  NEW.marketing_status_changed_by:=auth.uid();
  NEW.marketing_status_source:='manual';
 END IF;
 NEW.marketing_status_changed_at:=clock_timestamp();
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.company_marketing_guard() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER company_marketing_guard BEFORE INSERT OR UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.company_marketing_guard();

-- Trigger audit is atomic with company write; no correspondence or notes stored.
CREATE FUNCTION public.company_marketing_audit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.marketing_status IS NULL THEN RETURN NEW; END IF;
 ELSIF (NEW.marketing_status,NEW.marketing_handoff_lead_id) IS NOT DISTINCT FROM (OLD.marketing_status,OLD.marketing_handoff_lead_id) THEN RETURN NEW;
 END IF;
 INSERT INTO public.activities(user_id,action,details)
 VALUES(NEW.marketing_status_changed_by,'company_marketing_status',jsonb_build_object('company_id',NEW.id,'from_status',CASE WHEN TG_OP='UPDATE' THEN OLD.marketing_status END,'to_status',NEW.marketing_status,'source',NEW.marketing_status_source,'handoff_lead_id',NEW.marketing_handoff_lead_id));
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.company_marketing_audit() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER company_marketing_audit AFTER INSERT OR UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.company_marketing_audit();

CREATE FUNCTION public.company_set_marketing_status(p_company uuid,p_status text,p_expected jsonb,p_handoff_lead uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SET search_path=public AS $$
DECLARE c public.companies;
BEGIN
 IF auth.uid() IS NULL OR NOT coalesce(public.is_owner_role(auth.uid()) OR public.crm_role_of(auth.uid())='marketing',false) THEN
  RAISE EXCEPTION 'Only owner or marketing can change marketing status' USING ERRCODE='42501';
 END IF;
 IF p_status IS NULL OR p_status NOT IN ('new','contacted','qualified','handoff','rejected') THEN RAISE EXCEPTION 'Invalid marketing status'; END IF;
 SELECT * INTO c FROM public.companies WHERE id=p_company FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Company not accessible' USING ERRCODE='42501'; END IF;
 IF p_expected IS DISTINCT FROM jsonb_build_object('marketing_status',c.marketing_status,'marketing_status_changed_at',c.marketing_status_changed_at,'notes',c.notes) THEN
  RAISE EXCEPTION 'A cég állapota megváltozott. Frissítsd az adatlapot.' USING ERRCODE='40001';
 END IF;
 UPDATE public.companies SET marketing_status=p_status,marketing_handoff_lead_id=p_handoff_lead WHERE id=c.id RETURNING * INTO c;
 IF NOT FOUND THEN RAISE EXCEPTION 'Company write not permitted' USING ERRCODE='42501'; END IF;
 RETURN to_jsonb(c);
END $$;
REVOKE ALL ON FUNCTION public.company_set_marketing_status(uuid,text,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.company_set_marketing_status(uuid,text,jsonb,uuid) TO authenticated;

-- Only the existing trusted send service can call this. No new transport.
CREATE FUNCTION public.company_marketing_from_sent(p_company uuid,p_email uuid,p_user uuid)
RETURNS boolean LANGUAGE plpgsql SET search_path=public AS $$
DECLARE c public.companies; e public.emails; legacy text; m text[];
BEGIN
 IF current_user IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service only' USING ERRCODE='42501'; END IF;
 SELECT * INTO c FROM public.companies WHERE id=p_company FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 IF c.marketing_status IS NOT NULL AND c.marketing_status<>'new' THEN RETURN false; END IF;
 IF c.marketing_status IS NULL THEN
  IF coalesce(c.notes,'') !~ '\[MKT:|\[KAMPANY:|Forrás: Scarlet kampány' THEN RETURN false; END IF;
  FOR m IN SELECT regexp_matches(coalesce(c.notes,''),'\[MKT:STATUS:(new|contacted|qualified|handoff|rejected)(?::[^\]]*)?\]','g') LOOP legacy:=m[1]; END LOOP;
  IF legacy IS NOT NULL AND legacy<>'new' THEN RETURN false; END IF;
  IF legacy IS NULL AND coalesce(c.notes,'') ~ '\[KAMPANY:(EMAIL_SENT|REJECTED):' THEN RETURN false; END IF;
 END IF;
 SELECT * INTO e FROM public.emails WHERE id=p_email AND owner_user_id=p_user AND company_id=p_company;
 IF NOT FOUND OR nullif(e.gmail_message_id,'') IS NULL OR NOT coalesce(e.gmail_label_ids @> ARRAY['SENT'],false)
  OR coalesce(e.gmail_label_ids && ARRAY['DRAFT','TRASH','SPAM'],false) OR e.is_outbound IS NOT TRUE
  OR NOT EXISTS(SELECT 1 FROM public.users_profile WHERE auth_user_id=p_user AND active IS TRUE AND lower(gmail_email)=lower(e.from_email))
  OR NOT EXISTS(SELECT 1 FROM public.contacts k WHERE k.company_id=p_company AND lower(trim(k.email))=ANY(SELECT lower(trim(x)) FROM unnest(coalesce(e.to_emails,ARRAY[]::text[])) x)) THEN
  RETURN false;
 END IF;
 PERFORM set_config('app.marketing_sent_write','1',true);
 UPDATE public.companies SET marketing_status='contacted',marketing_handoff_lead_id=NULL,
  marketing_status_changed_by=p_user,marketing_status_source='gmail_sent' WHERE id=p_company;
 PERFORM set_config('app.marketing_sent_write','0',true);
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.company_marketing_from_sent(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.company_marketing_from_sent(uuid,uuid,uuid) TO service_role;