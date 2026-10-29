ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS email_invalid boolean NOT NULL DEFAULT false;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS email_invalid_note text;

CREATE TABLE public.import_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch text NOT NULL,
  entity text NOT NULL,
  entity_id uuid NOT NULL,
  action text NOT NULL,
  before jsonb,
  source_ref text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX import_log_batch_idx ON public.import_log(batch, entity);
CREATE UNIQUE INDEX import_log_once_idx ON public.import_log(batch, entity, entity_id, action);
GRANT SELECT ON public.import_log TO authenticated;
GRANT ALL ON public.import_log TO service_role;
ALTER TABLE public.import_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads import log" ON public.import_log FOR SELECT TO authenticated USING (public.is_owner_role(auth.uid()));

CREATE TABLE public.import_review_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch text NOT NULL,
  kind text NOT NULL,
  title text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (batch, kind, title)
);
GRANT SELECT, UPDATE ON public.import_review_items TO authenticated;
GRANT ALL ON public.import_review_items TO service_role;
ALTER TABLE public.import_review_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads review items" ON public.import_review_items FOR SELECT TO authenticated USING (public.is_owner_role(auth.uid()));
CREATE POLICY "Owner updates review items" ON public.import_review_items FOR UPDATE TO authenticated USING (public.is_owner_role(auth.uid())) WITH CHECK (public.is_owner_role(auth.uid()));
CREATE TRIGGER import_review_items_touch BEFORE UPDATE ON public.import_review_items FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

CREATE TABLE public.project_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  title text NOT NULL,
  source_note text,
  review_status text NOT NULL DEFAULT 'review',
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, title)
);
GRANT SELECT, UPDATE ON public.project_candidates TO authenticated;
GRANT ALL ON public.project_candidates TO service_role;
ALTER TABLE public.project_candidates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads project candidates" ON public.project_candidates FOR SELECT TO authenticated USING (public.is_owner_role(auth.uid()));
CREATE POLICY "Owner updates project candidates" ON public.project_candidates FOR UPDATE TO authenticated USING (public.is_owner_role(auth.uid())) WITH CHECK (public.is_owner_role(auth.uid()));
CREATE TRIGGER project_candidates_touch BEFORE UPDATE ON public.project_candidates FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();