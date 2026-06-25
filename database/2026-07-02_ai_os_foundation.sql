-- ============================================================
-- VIBA AI OPERATING SYSTEM — Foundation (2026-07-02)
--
-- Provider-agnostic AI core számára. NEM CRM-specifikus.
-- Idempotens, többször futtatható.
--
-- Táblák:
--   ai_threads        — beszélgetés-szálak (felhasználó × agent)
--   ai_messages       — szál üzenetei (user / assistant / tool)
--   agent_runs        — egy felhasználói üzenethez tartozó teljes futás
--   agent_run_steps   — a futás lépésenkénti naplója (LLM hívás, tool, handoff)
--   ai_memory         — OBJEKTUM-alapú memória (user/company/contact/lead/project/conversation)
--                       MINDEN agent ugyanebből dolgozik; nem agenthez kötött.
-- ============================================================

-- ---------- ai_threads ----------
CREATE TABLE IF NOT EXISTS public.ai_threads (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id      text NOT NULL,
  title         text,
  context_json  jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_threads_user_idx ON public.ai_threads(user_id, updated_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_threads TO authenticated;
GRANT ALL ON public.ai_threads TO service_role;
ALTER TABLE public.ai_threads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_threads_owner_all ON public.ai_threads;
CREATE POLICY ai_threads_owner_all ON public.ai_threads
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ---------- ai_messages ----------
CREATE TABLE IF NOT EXISTS public.ai_messages (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id     uuid NOT NULL REFERENCES public.ai_threads(id) ON DELETE CASCADE,
  role          text NOT NULL CHECK (role IN ('system','user','assistant','tool')),
  content       text,
  tool_calls    jsonb,
  tool_call_id  text,
  agent_id      text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_messages_thread_idx ON public.ai_messages(thread_id, created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_messages TO authenticated;
GRANT ALL ON public.ai_messages TO service_role;
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_messages_owner_all ON public.ai_messages;
CREATE POLICY ai_messages_owner_all ON public.ai_messages
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.ai_threads t WHERE t.id = thread_id AND t.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.ai_threads t WHERE t.id = thread_id AND t.user_id = auth.uid()));

-- ---------- agent_runs ----------
CREATE TABLE IF NOT EXISTS public.agent_runs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id      uuid REFERENCES public.ai_threads(id) ON DELETE SET NULL,
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id       text NOT NULL,
  provider       text,
  model          text,
  status         text NOT NULL DEFAULT 'running' CHECK (status IN ('running','ok','error','cancelled')),
  error_message  text,
  prompt_tokens  integer DEFAULT 0,
  completion_tokens integer DEFAULT 0,
  total_steps    integer DEFAULT 0,
  started_at     timestamptz NOT NULL DEFAULT now(),
  finished_at    timestamptz
);
CREATE INDEX IF NOT EXISTS agent_runs_user_idx ON public.agent_runs(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS agent_runs_thread_idx ON public.agent_runs(thread_id, started_at);
GRANT SELECT ON public.agent_runs TO authenticated;
GRANT ALL ON public.agent_runs TO service_role;
ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agent_runs_owner_read ON public.agent_runs;
CREATE POLICY agent_runs_owner_read ON public.agent_runs
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ---------- agent_run_steps ----------
CREATE TABLE IF NOT EXISTS public.agent_run_steps (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id      uuid NOT NULL REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  step_no     integer NOT NULL,
  kind        text NOT NULL CHECK (kind IN ('llm','tool','handoff','approval','error')),
  agent_id    text,
  tool_name   text,
  input_json  jsonb,
  output_json jsonb,
  error       text,
  duration_ms integer,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, step_no)
);
CREATE INDEX IF NOT EXISTS agent_run_steps_run_idx ON public.agent_run_steps(run_id, step_no);
GRANT SELECT ON public.agent_run_steps TO authenticated;
GRANT ALL ON public.agent_run_steps TO service_role;
ALTER TABLE public.agent_run_steps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agent_run_steps_owner_read ON public.agent_run_steps;
CREATE POLICY agent_run_steps_owner_read ON public.agent_run_steps
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.agent_runs r WHERE r.id = run_id AND r.user_id = auth.uid()));

-- ---------- ai_memory (objektum-alapú, agent-független) ----------
-- subject_type: 'user' | 'company' | 'contact' | 'lead' | 'project' | 'conversation' | <bármi a jövőben>
-- subject_id:   az adott objektum UUID-je (user esetén auth.users.id)
-- scope:        'shared' (minden user látja, ha jogosult) | 'private' (csak az írója)
-- key/value:    kulcs alapú memóriadarab; value strukturált JSON
CREATE TABLE IF NOT EXISTS public.ai_memory (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type  text NOT NULL,
  subject_id    uuid NOT NULL,
  scope         text NOT NULL DEFAULT 'shared' CHECK (scope IN ('shared','private')),
  key           text NOT NULL,
  value         jsonb NOT NULL,
  source        text,                -- pl. 'agent:george', 'system', 'user'
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subject_type, subject_id, scope, key, created_by)
);
CREATE INDEX IF NOT EXISTS ai_memory_subject_idx ON public.ai_memory(subject_type, subject_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_memory TO authenticated;
GRANT ALL ON public.ai_memory TO service_role;
ALTER TABLE public.ai_memory ENABLE ROW LEVEL SECURITY;
-- shared scope: minden authenticated user olvashatja; csak az író módosíthatja
DROP POLICY IF EXISTS ai_memory_shared_read ON public.ai_memory;
CREATE POLICY ai_memory_shared_read ON public.ai_memory
  FOR SELECT TO authenticated
  USING (scope = 'shared' OR created_by = auth.uid());
DROP POLICY IF EXISTS ai_memory_owner_write ON public.ai_memory;
CREATE POLICY ai_memory_owner_write ON public.ai_memory
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());
DROP POLICY IF EXISTS ai_memory_owner_update ON public.ai_memory;
CREATE POLICY ai_memory_owner_update ON public.ai_memory
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());
DROP POLICY IF EXISTS ai_memory_owner_delete ON public.ai_memory;
CREATE POLICY ai_memory_owner_delete ON public.ai_memory
  FOR DELETE TO authenticated
  USING (created_by = auth.uid());

-- updated_at trigger (közös)
CREATE OR REPLACE FUNCTION public.ai_os_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS ai_threads_touch ON public.ai_threads;
CREATE TRIGGER ai_threads_touch BEFORE UPDATE ON public.ai_threads
  FOR EACH ROW EXECUTE FUNCTION public.ai_os_touch_updated_at();

DROP TRIGGER IF EXISTS ai_memory_touch ON public.ai_memory;
CREATE TRIGGER ai_memory_touch BEFORE UPDATE ON public.ai_memory
  FOR EACH ROW EXECUTE FUNCTION public.ai_os_touch_updated_at();

-- Function jogosultságok
REVOKE ALL ON FUNCTION public.ai_os_touch_updated_at() FROM PUBLIC, anon;