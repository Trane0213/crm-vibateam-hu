CREATE TABLE public.issue_report_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id uuid NOT NULL REFERENCES public.issue_reports(id) ON DELETE CASCADE,
  agent_id text NOT NULL CHECK (agent_id IN ('george','scarlet','timothy','boss','michael')),
  contribution text NOT NULL CHECK (contribution IN ('specialist','coordinator')),
  run_id uuid,
  requested_by uuid NOT NULL,
  requested_role text,
  report_status text NOT NULL CHECK (report_status IN ('answered','insufficient_data','out_of_scope','blocked','invalid_format')),
  summary text NOT NULL DEFAULT '',
  findings jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommended_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  open_questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence text NOT NULL DEFAULT 'low' CHECK (confidence IN ('low','medium','high')),
  verified_source_count integer NOT NULL DEFAULT 0,
  unverified_claim_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX issue_report_findings_issue_idx ON public.issue_report_findings(issue_id, created_at DESC);

GRANT SELECT ON public.issue_report_findings TO authenticated;
GRANT ALL ON public.issue_report_findings TO service_role;

ALTER TABLE public.issue_report_findings ENABLE ROW LEVEL SECURITY;

-- Findings were produced with the requester's permissions, so only the requester or an Owner may read them,
-- and only while the parent report itself is visible to the caller.
CREATE POLICY issue_report_findings_select ON public.issue_report_findings
  FOR SELECT TO authenticated
  USING (
    (requested_by = auth.uid() OR public.is_owner_role(auth.uid()))
    AND EXISTS (SELECT 1 FROM public.issue_reports r WHERE r.id = issue_id)
  );