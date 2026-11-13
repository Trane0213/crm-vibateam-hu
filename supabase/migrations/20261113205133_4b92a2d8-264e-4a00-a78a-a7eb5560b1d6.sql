-- AI OS 2.0/8 C: dokumentumfeldolgozási kötegnapló. Rollback: DROP TABLE public.knowledge_ingest_runs;
CREATE TABLE public.knowledge_ingest_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_by uuid NOT NULL,
  trigger text NOT NULL DEFAULT 'owner_button' CHECK (trigger IN ('owner_button','test')),
  requested_limit integer NOT NULL CHECK (requested_limit BETWEEN 1 AND 10),
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','ok','error')),
  claimed integer NOT NULL DEFAULT 0,
  outcomes jsonb NOT NULL DEFAULT '{}'::jsonb,
  document_ids uuid[] NOT NULL DEFAULT '{}',
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.knowledge_ingest_runs TO authenticated;
GRANT ALL ON public.knowledge_ingest_runs TO service_role;
ALTER TABLE public.knowledge_ingest_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY knowledge_ingest_runs_owner_read ON public.knowledge_ingest_runs FOR SELECT TO authenticated USING (public.is_owner_role(auth.uid()));
CREATE INDEX knowledge_ingest_runs_started_idx ON public.knowledge_ingest_runs (started_at DESC);
CREATE TRIGGER knowledge_ingest_runs_touch BEFORE UPDATE ON public.knowledge_ingest_runs FOR EACH ROW EXECUTE FUNCTION public.ai_os_touch_updated_at();