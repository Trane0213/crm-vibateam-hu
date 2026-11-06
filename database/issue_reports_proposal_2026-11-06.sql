-- PROPOSAL ONLY. Not applied. One new table; no business-table changes.
BEGIN;
CREATE TABLE public.issue_reports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 reporter_id uuid NOT NULL,
 reporter_role text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 page_path text NOT NULL,
 description text NOT NULL,
 expected_result text NOT NULL,
 actual_result text NOT NULL,
 technical_code text,
 submission_key uuid NOT NULL,
 status text NOT NULL DEFAULT 'new',
 owner_note text NOT NULL DEFAULT '',
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(reporter_id, submission_key),
 CHECK (status IN ('new','investigating','awaiting_fix','checking','closed','usage_question')),
 CHECK (length(description) BETWEEN 1 AND 2000),
 CHECK (length(expected_result) BETWEEN 1 AND 1000),
 CHECK (length(actual_result) BETWEEN 1 AND 1000),
 CHECK (page_path ~ '^/[A-Za-z0-9/_-]*$' AND length(page_path) <= 250),
 CHECK (technical_code IS NULL OR (length(technical_code) <= 80 AND technical_code ~ '^[A-Za-z0-9_.:-]+$')),
 CHECK (length(owner_note) <= 2000)
);
GRANT SELECT, INSERT ON public.issue_reports TO authenticated;
GRANT UPDATE(status, owner_note) ON public.issue_reports TO authenticated;
GRANT ALL ON public.issue_reports TO service_role;
ALTER TABLE public.issue_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY issue_reports_read ON public.issue_reports FOR SELECT TO authenticated
 USING (reporter_id = auth.uid() OR public.is_owner_role(auth.uid()));
CREATE POLICY issue_reports_insert ON public.issue_reports FOR INSERT TO authenticated
 WITH CHECK (reporter_id = auth.uid() AND status = 'new' AND owner_note = '' AND
 (public.is_owner_role(auth.uid()) OR public.crm_role_of(auth.uid()) IN ('sales','marketing','project_manager','pm')));
CREATE POLICY issue_reports_owner_update ON public.issue_reports FOR UPDATE TO authenticated
 USING (public.is_owner_role(auth.uid())) WITH CHECK (public.is_owner_role(auth.uid()));
CREATE FUNCTION public.issue_reports_guard() RETURNS trigger LANGUAGE plpgsql
 SET search_path = public AS $$
BEGIN
 IF TG_OP = 'INSERT' THEN
  IF auth.uid() IS NULL OR NEW.reporter_id IS DISTINCT FROM auth.uid() THEN
   RAISE EXCEPTION 'Authenticated reporter required' USING ERRCODE = '42501';
  END IF;
  NEW.reporter_role := CASE WHEN public.is_owner_role(auth.uid()) THEN 'owner' ELSE public.crm_role_of(auth.uid()) END;
  IF NEW.reporter_role NOT IN ('owner','sales','marketing','project_manager','pm') THEN
   RAISE EXCEPTION 'Reporter role denied' USING ERRCODE = '42501';
  END IF;
  NEW.created_at := clock_timestamp(); NEW.status := 'new'; NEW.owner_note := '';
 ELSE
  IF NOT public.is_owner_role(auth.uid()) THEN RAISE EXCEPTION 'Owner required' USING ERRCODE = '42501'; END IF;
  IF (to_jsonb(NEW) - ARRAY['status','owner_note','updated_at']) IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['status','owner_note','updated_at']) THEN
   RAISE EXCEPTION 'Report metadata is immutable' USING ERRCODE = '42501';
  END IF;
 END IF;
 NEW.updated_at := clock_timestamp();
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.issue_reports_guard() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER issue_reports_guard BEFORE INSERT OR UPDATE ON public.issue_reports
 FOR EACH ROW EXECUTE FUNCTION public.issue_reports_guard();
CREATE INDEX issue_reports_own_recent ON public.issue_reports(reporter_id, created_at DESC);
COMMIT;
