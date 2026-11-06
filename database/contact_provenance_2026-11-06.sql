ALTER TABLE public.contacts ADD COLUMN contact_kind text, ADD COLUMN data_source text,
 ADD COLUMN verification_state text, ADD COLUMN verification_reference text,
 ADD COLUMN verified_by uuid, ADD COLUMN verified_at timestamptz;
CREATE FUNCTION public.contact_provenance_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE changed boolean; identity_changed boolean:=false;
BEGIN
 IF TG_OP='INSERT' THEN
  changed:=(NEW.contact_kind,NEW.data_source,NEW.verification_state,NEW.verification_reference) IS DISTINCT FROM (NULL::text,NULL::text,NULL::text,NULL::text);
  IF NEW.verified_by IS NOT NULL OR NEW.verified_at IS NOT NULL THEN RAISE EXCEPTION 'Verification metadata is server controlled' USING ERRCODE='42501'; END IF;
 ELSE
  identity_changed:=(NEW.name,NEW.email,NEW.company_id) IS DISTINCT FROM (OLD.name,OLD.email,OLD.company_id);
  changed:=(NEW.contact_kind,NEW.data_source,NEW.verification_state,NEW.verification_reference) IS DISTINCT FROM (OLD.contact_kind,OLD.data_source,OLD.verification_state,OLD.verification_reference);
  IF (NEW.verified_by,NEW.verified_at) IS DISTINCT FROM (OLD.verified_by,OLD.verified_at) THEN RAISE EXCEPTION 'Verification metadata is server controlled' USING ERRCODE='42501'; END IF;
 END IF;
 IF changed THEN
  IF auth.uid() IS NULL OR NOT coalesce(public.is_owner_role(auth.uid()) OR public.crm_role_of(auth.uid())='marketing',false) THEN RAISE EXCEPTION 'Only owner or marketing may verify contacts' USING ERRCODE='42501'; END IF;
  IF NEW.contact_kind IS NULL OR NEW.contact_kind NOT IN ('person','shared_mailbox','unknown') OR NEW.data_source IS NULL OR NEW.data_source NOT IN ('manual','document_import','email_inferred','direct_confirmation') OR NEW.verification_state IS NULL OR NEW.verification_state NOT IN ('unverified','human_verified') THEN RAISE EXCEPTION 'Invalid contact provenance'; END IF;
  IF length(coalesce(NEW.verification_reference,''))>500 THEN RAISE EXCEPTION 'Reference too long'; END IF;
  IF NEW.verification_state='human_verified' THEN
   IF NEW.contact_kind='unknown' OR length(trim(coalesce(NEW.verification_reference,'')))<5 THEN RAISE EXCEPTION 'Explicit human evidence required'; END IF;
   NEW.verified_by:=auth.uid(); NEW.verified_at:=clock_timestamp();
  ELSE NEW.verified_by:=NULL; NEW.verified_at:=NULL; END IF;
 END IF;
 IF identity_changed THEN
  NEW.verification_state:=CASE WHEN OLD.verification_state IS NULL THEN NULL ELSE 'unverified' END;
  NEW.verified_by:=NULL; NEW.verified_at:=NULL; NEW.verification_reference:=NULL;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.contact_provenance_guard() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER contact_provenance_guard BEFORE INSERT OR UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.contact_provenance_guard();
CREATE FUNCTION public.contact_provenance_audit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='INSERT' THEN IF NEW.contact_kind IS NULL THEN RETURN NEW; END IF;
 ELSIF (NEW.contact_kind,NEW.data_source,NEW.verification_state,NEW.verification_reference,NEW.verified_by,NEW.verified_at) IS NOT DISTINCT FROM (OLD.contact_kind,OLD.data_source,OLD.verification_state,OLD.verification_reference,OLD.verified_by,OLD.verified_at) THEN RETURN NEW; END IF;
 INSERT INTO public.activities(user_id,action,details) VALUES(auth.uid(),'contact_provenance',jsonb_build_object('contact_id',NEW.id,'kind',NEW.contact_kind,'source',NEW.data_source,'state',NEW.verification_state,'previous_state',CASE WHEN TG_OP='UPDATE' THEN OLD.verification_state END));
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.contact_provenance_audit() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER contact_provenance_audit AFTER INSERT OR UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.contact_provenance_audit();
CREATE FUNCTION public.contact_set_provenance(p_contact uuid,p_expected jsonb,p_kind text,p_source text,p_state text,p_reference text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SET search_path=public AS $$
DECLARE c public.contacts;
BEGIN
 IF auth.uid() IS NULL OR NOT coalesce(public.is_owner_role(auth.uid()) OR public.crm_role_of(auth.uid())='marketing',false) THEN RAISE EXCEPTION 'Only owner or marketing may verify contacts' USING ERRCODE='42501'; END IF;
 SELECT * INTO c FROM public.contacts WHERE id=p_contact FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Contact inaccessible' USING ERRCODE='42501'; END IF;
 IF to_jsonb(c) IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'A kapcsolattartó megváltozott. Frissítsd az adatlapot.' USING ERRCODE='40001'; END IF;
 UPDATE public.contacts SET contact_kind=p_kind,data_source=p_source,verification_state=p_state,verification_reference=nullif(trim(p_reference),'') WHERE id=p_contact RETURNING * INTO c;
 IF NOT FOUND THEN RAISE EXCEPTION 'Contact write denied' USING ERRCODE='42501'; END IF;
 RETURN to_jsonb(c);
END $$;
REVOKE ALL ON FUNCTION public.contact_set_provenance(uuid,jsonb,text,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.contact_set_provenance(uuid,jsonb,text,text,text,text) TO authenticated;