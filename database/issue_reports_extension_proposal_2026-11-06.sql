-- PROPOSAL ONLY: NOT APPLIED. Extends the existing sole issue table.
BEGIN;
ALTER TABLE public.issue_reports
 ADD COLUMN category text NOT NULL DEFAULT 'bug',
 ADD COLUMN confirmed_category text,
 ADD COLUMN classification_source text NOT NULL DEFAULT 'reporter',
 ADD COLUMN evidence_state text NOT NULL DEFAULT 'unverified',
 ADD COLUMN severity text NOT NULL DEFAULT 'unassessed',
 ADD COLUMN business_impact text NOT NULL DEFAULT '',
 ADD COLUMN reproduction text NOT NULL DEFAULT '',
 ADD COLUMN correlation_id uuid NOT NULL DEFAULT gen_random_uuid(),
 ADD COLUMN handler_id uuid,
 ADD COLUMN duplicate_of uuid REFERENCES public.issue_reports(id),
 ADD COLUMN ai_suggestion jsonb,
 ADD COLUMN diagnosis_steps jsonb NOT NULL DEFAULT '[]'::jsonb,
 ADD COLUMN external_event_id text,
 ADD COLUMN external_event_url text,
 ADD COLUMN fingerprint text,
 ADD COLUMN build_version text,
 ADD COLUMN development_state text NOT NULL DEFAULT 'unreviewed',
 ADD COLUMN estimate_minutes integer,
 ADD COLUMN estimate_basis text NOT NULL DEFAULT '',
 ADD COLUMN reviewed_at timestamptz,
 ADD COLUMN closed_at timestamptz;
-- Existing rows stay bug/unverified/unassessed; this does not infer diagnosis.
ALTER TABLE public.issue_reports ALTER COLUMN expected_result SET DEFAULT '',
 ALTER COLUMN actual_result SET DEFAULT '';
ALTER TABLE public.issue_reports DROP CONSTRAINT issue_reports_expected_result_check,
 DROP CONSTRAINT issue_reports_actual_result_check;
ALTER TABLE public.issue_reports ADD CONSTRAINT issue_reports_expected_result_check CHECK(length(expected_result)<=1000),
 ADD CONSTRAINT issue_reports_actual_result_check CHECK(length(actual_result)<=1000);
GRANT UPDATE(confirmed_category,classification_source,evidence_state,severity,business_impact,
 handler_id,duplicate_of,development_state,estimate_minutes,estimate_basis) ON public.issue_reports TO authenticated;
-- Existing SELECT/INSERT grants and own/owner RLS retained. No anon grants.
-- External event / AI result fields are not user-updatable and remain inactive.
CREATE OR REPLACE FUNCTION public.issue_reports_guard() RETURNS trigger LANGUAGE plpgsql
 SET search_path=public AS $$
DECLARE target_reporter uuid;
BEGIN
 IF NEW.category NOT IN ('usage','bug','ux','feature') OR
    (NEW.confirmed_category IS NOT NULL AND NEW.confirmed_category NOT IN ('usage','bug','ux','feature')) OR
    NEW.classification_source NOT IN ('reporter','human_confirmed') OR
    NEW.evidence_state NOT IN ('verified','unverified','uninspectable') OR
    NEW.severity NOT IN ('unassessed','low','medium','high','critical') OR
    NEW.development_state NOT IN ('unreviewed','proposed','approved','deferred','rejected') OR
    length(NEW.business_impact)>1000 OR length(NEW.reproduction)>2000 OR
    length(NEW.estimate_basis)>1000 OR (NEW.estimate_minutes IS NOT NULL AND NEW.estimate_minutes<0) OR
    (NEW.estimate_minutes IS NOT NULL AND length(trim(NEW.estimate_basis))=0) OR
    (NEW.classification_source='human_confirmed' AND NEW.confirmed_category IS NULL) THEN
  RAISE EXCEPTION 'Invalid case assessment' USING ERRCODE='22023';
 END IF;
 IF TG_OP='INSERT' THEN
  IF auth.uid() IS NULL OR NEW.reporter_id IS DISTINCT FROM auth.uid() THEN
   RAISE EXCEPTION 'Authenticated reporter required' USING ERRCODE='42501';
  END IF;
  NEW.reporter_role:=CASE WHEN public.is_owner_role(auth.uid()) THEN 'owner' ELSE public.crm_role_of(auth.uid()) END;
  IF NEW.reporter_role NOT IN ('owner','sales','marketing','project_manager','pm') THEN
   RAISE EXCEPTION 'Reporter role denied' USING ERRCODE='42501';
  END IF;
  IF NEW.confirmed_category IS NOT NULL OR NEW.classification_source<>'reporter' OR
     NEW.evidence_state<>'unverified' OR NEW.severity<>'unassessed' OR NEW.handler_id IS NOT NULL OR
     NEW.duplicate_of IS NOT NULL OR NEW.ai_suggestion IS NOT NULL OR NEW.diagnosis_steps<>'[]'::jsonb OR
     NEW.external_event_id IS NOT NULL OR NEW.external_event_url IS NOT NULL OR NEW.fingerprint IS NOT NULL OR
     NEW.build_version IS NOT NULL OR NEW.development_state<>'unreviewed' OR NEW.estimate_minutes IS NOT NULL OR
     NEW.estimate_basis<>'' OR NEW.reviewed_at IS NOT NULL OR NEW.closed_at IS NOT NULL THEN
   RAISE EXCEPTION 'Report cannot claim investigation or approval' USING ERRCODE='42501';
  END IF;
  NEW.created_at:=clock_timestamp(); NEW.status:='new'; NEW.owner_note:='';
  NEW.correlation_id:=gen_random_uuid();
 ELSE
  IF NOT public.is_owner_role(auth.uid()) THEN RAISE EXCEPTION 'Owner required' USING ERRCODE='42501'; END IF;
  IF (to_jsonb(NEW)-ARRAY['status','owner_note','updated_at','confirmed_category','classification_source',
      'evidence_state','severity','business_impact','handler_id','duplicate_of','development_state',
      'estimate_minutes','estimate_basis','reviewed_at','closed_at']) IS DISTINCT FROM
     (to_jsonb(OLD)-ARRAY['status','owner_note','updated_at','confirmed_category','classification_source',
      'evidence_state','severity','business_impact','handler_id','duplicate_of','development_state',
      'estimate_minutes','estimate_basis','reviewed_at','closed_at']) THEN
   RAISE EXCEPTION 'Original report and technical evidence are immutable' USING ERRCODE='42501';
  END IF;
  IF NEW.evidence_state='verified' AND OLD.evidence_state<>'verified' AND length(trim(NEW.owner_note))=0 THEN
   RAISE EXCEPTION 'Observed evidence reference required' USING ERRCODE='22023';
  END IF;
  IF NEW.duplicate_of IS NOT NULL THEN
   SELECT reporter_id INTO target_reporter FROM public.issue_reports WHERE id=NEW.duplicate_of;
   IF target_reporter IS NULL OR NEW.duplicate_of=NEW.id THEN RAISE EXCEPTION 'Invalid duplicate target'; END IF;
   -- A worker must never receive another worker's case identifier via a link.
   IF target_reporter<>NEW.reporter_id THEN RAISE EXCEPTION 'Duplicate links require same reporter'; END IF;
   IF EXISTS(WITH RECURSIVE chain AS (
     SELECT id,duplicate_of FROM public.issue_reports WHERE id=NEW.duplicate_of
     UNION SELECT r.id,r.duplicate_of FROM public.issue_reports r JOIN chain c ON r.id=c.duplicate_of
   ) SELECT 1 FROM chain WHERE id=NEW.id) THEN RAISE EXCEPTION 'Duplicate cycle denied'; END IF;
  END IF;
  NEW.reviewed_at:=clock_timestamp();
  NEW.closed_at:=CASE WHEN NEW.status='closed' THEN COALESCE(OLD.closed_at,clock_timestamp()) ELSE NULL END;
 END IF;
 NEW.updated_at:=clock_timestamp(); RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.issue_reports_guard() FROM PUBLIC,anon,authenticated;
CREATE INDEX issue_reports_category_recent ON public.issue_reports(category,created_at DESC);
CREATE INDEX issue_reports_duplicate ON public.issue_reports(duplicate_of) WHERE duplicate_of IS NOT NULL;
COMMIT;