-- ============================================================
-- VIBA CRM v1 — adatmodell lezárás + activity_log
-- Másold be teljes egészében a Supabase SQL Editorba és futtasd.
-- Idempotens: többször futtatható.
-- ============================================================

-- 1) FELADATOK / EMAILEK: projekt kapcsolat + alap mezők ----------
ALTER TABLE public.tasks  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;
ALTER TABLE public.emails ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;
ALTER TABLE public.emails ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL;
ALTER TABLE public.emails ADD COLUMN IF NOT EXISTS subject text;

CREATE INDEX IF NOT EXISTS idx_tasks_project_id  ON public.tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_emails_project_id ON public.emails(project_id);
CREATE INDEX IF NOT EXISTS idx_emails_contact_id ON public.emails(contact_id);
CREATE INDEX IF NOT EXISTS idx_emails_thread_id  ON public.emails(thread_id);

-- 2) ACTIVITY LOG (audit nyomvonal) -------------------------------
CREATE TABLE IF NOT EXISTS public.activity_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  user_id      uuid,            -- auth.users.id (nem FK, hogy user törlés után is megmaradjon)
  entity_type  text NOT NULL,   -- pl. 'projects', 'quotes', 'tasks'
  entity_id    uuid,            -- érintett rekord id
  action       text NOT NULL,   -- 'create' | 'update' | 'delete' | 'status_change' | egyéb
  payload      jsonb            -- változás részletei
);

CREATE INDEX IF NOT EXISTS idx_activity_entity     ON public.activity_log(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_created_at ON public.activity_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_user       ON public.activity_log(user_id, created_at DESC);

GRANT SELECT, INSERT ON public.activity_log TO authenticated;
GRANT ALL ON public.activity_log TO service_role;

ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "activity_log_select_authenticated" ON public.activity_log;
CREATE POLICY "activity_log_select_authenticated"
  ON public.activity_log FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "activity_log_insert_self" ON public.activity_log;
CREATE POLICY "activity_log_insert_self"
  ON public.activity_log FOR INSERT
  TO authenticated
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

-- 3) Data API GRANTs — biztos ami biztos (idempotens) -------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['tasks','emails']::text[]
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;