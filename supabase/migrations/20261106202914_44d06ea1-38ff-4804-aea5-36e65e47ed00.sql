ALTER TABLE public.issue_reports
  ADD COLUMN category text NOT NULL DEFAULT 'bug' CHECK (category IN ('usage','bug','ux','feature')),
  ADD COLUMN ai_specialist text CHECK (ai_specialist IN ('george','scarlet','timothy','boss')),
  ADD COLUMN ai_analysis text NOT NULL DEFAULT '' CHECK (length(ai_analysis) <= 6000),
  ADD COLUMN ai_evidence text CHECK (ai_evidence IN ('proven','assumed','not_examinable')),
  ADD COLUMN ai_analyzed_at timestamptz,
  ADD COLUMN ai_run_count integer NOT NULL DEFAULT 0 CHECK (ai_run_count BETWEEN 0 AND 10),
  ADD COLUMN reporter_verdict text CHECK (reporter_verdict IN ('resolved','not_resolved')),
  ADD COLUMN reporter_feedback text NOT NULL DEFAULT '' CHECK (length(reporter_feedback) <= 1000),
  ADD COLUMN reporter_verdict_at timestamptz;

CREATE OR REPLACE FUNCTION public.issue_reports_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
 IF TG_OP = 'INSERT' THEN
  IF auth.uid() IS NULL OR NEW.reporter_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Authenticated reporter required' USING ERRCODE = '42501'; END IF;
  NEW.reporter_role := CASE WHEN public.is_owner_role(auth.uid()) THEN 'owner' ELSE public.crm_role_of(auth.uid()) END;
  IF NEW.reporter_role NOT IN ('owner','sales','marketing','project_manager','pm') THEN RAISE EXCEPTION 'Reporter role denied' USING ERRCODE = '42501'; END IF;
  NEW.created_at := clock_timestamp(); NEW.status := 'new'; NEW.owner_note := '';
  NEW.ai_specialist := NULL; NEW.ai_analysis := ''; NEW.ai_evidence := NULL; NEW.ai_analyzed_at := NULL; NEW.ai_run_count := 0;
  NEW.reporter_verdict := NULL; NEW.reporter_feedback := ''; NEW.reporter_verdict_at := NULL;
 ELSIF current_user IN ('service_role','postgres') THEN
  IF (to_jsonb(NEW) - ARRAY['status','owner_note','updated_at','ai_specialist','ai_analysis','ai_evidence','ai_analyzed_at','ai_run_count','reporter_verdict','reporter_feedback','reporter_verdict_at'])
     IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','owner_note','updated_at','ai_specialist','ai_analysis','ai_evidence','ai_analyzed_at','ai_run_count','reporter_verdict','reporter_feedback','reporter_verdict_at']) THEN
   RAISE EXCEPTION 'Report metadata is immutable' USING ERRCODE = '42501'; END IF;
 ELSE
  IF NOT public.is_owner_role(auth.uid()) THEN RAISE EXCEPTION 'Owner required' USING ERRCODE = '42501'; END IF;
  IF (to_jsonb(NEW) - ARRAY['status','owner_note','updated_at']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','owner_note','updated_at']) THEN RAISE EXCEPTION 'Report metadata is immutable' USING ERRCODE = '42501'; END IF;
 END IF;
 NEW.updated_at := clock_timestamp(); RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.issue_reports_guard() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.issue_report_verdict(_id uuid, _verdict text, _feedback text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.issue_reports;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
 IF _verdict NOT IN ('resolved','not_resolved') OR length(coalesce(_feedback,'')) > 1000 THEN RAISE EXCEPTION 'Invalid verdict' USING ERRCODE = '22023'; END IF;
 SELECT * INTO r FROM public.issue_reports WHERE id = _id FOR UPDATE;
 IF NOT FOUND OR r.reporter_id <> auth.uid() THEN RAISE EXCEPTION 'Not found' USING ERRCODE = '42501'; END IF;
 IF r.status <> 'checking' THEN RAISE EXCEPTION 'Report is not awaiting verification' USING ERRCODE = '55000'; END IF;
 UPDATE public.issue_reports SET reporter_verdict = _verdict, reporter_feedback = coalesce(_feedback,''), reporter_verdict_at = clock_timestamp(),
   status = CASE WHEN _verdict = 'resolved' THEN 'closed' ELSE 'investigating' END WHERE id = _id;
END $$;
REVOKE ALL ON FUNCTION public.issue_report_verdict(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.issue_report_verdict(uuid,text,text) TO authenticated;