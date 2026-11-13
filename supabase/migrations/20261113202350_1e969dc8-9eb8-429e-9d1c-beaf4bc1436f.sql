-- AI OS 2.0 / 6. szakasz: George tulajdonosi napi összesítője és heti fejlesztési listája.
-- A tényeket a szerver determinisztikusan gyűjti (forrásazonosítókkal); George csak ezekből ír, a forrásokat ellenőrizzük.
CREATE TABLE public.ai_owner_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('daily','weekly')),
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  period_label text NOT NULL,
  facts jsonb NOT NULL,
  facts_hash text NOT NULL,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','ok','error','paused')),
  report jsonb,
  run_id uuid,
  tokens_used integer NOT NULL DEFAULT 0,
  error text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz NOT NULL DEFAULT now() + interval '15 minutes',
  finished_at timestamptz
);
GRANT SELECT ON public.ai_owner_reports TO authenticated;
GRANT ALL ON public.ai_owner_reports TO service_role;
REVOKE ALL ON public.ai_owner_reports FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.ai_owner_reports FROM authenticated;
ALTER TABLE public.ai_owner_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_owner_reports_owner_select ON public.ai_owner_reports FOR SELECT TO authenticated USING (public.is_owner_role(auth.uid()));
-- Egyszerre egy készülő jelentés fajtánként; változatlan tényekre nem készül újabb AI-jelentés.
CREATE UNIQUE INDEX ai_owner_reports_single_flight ON public.ai_owner_reports(kind) WHERE status = 'running';
CREATE UNIQUE INDEX ai_owner_reports_same_facts ON public.ai_owner_reports(kind, facts_hash) WHERE status = 'ok';
CREATE INDEX ai_owner_reports_kind_created ON public.ai_owner_reports(kind, created_at DESC);