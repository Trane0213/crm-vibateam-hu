-- STOP execution in application first, export P0 steps securely before running.
-- Never restore the legacy client-approvedToolCallIds bypass.
BEGIN;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM public.agent_run_steps WHERE approval_status = 'executing') THEN
   RAISE EXCEPTION 'Execution still in progress or outcome unconfirmed; rollback refused';
 END IF;
END $$;
DROP FUNCTION IF EXISTS public.ai_os_approval_create(uuid,uuid,integer,text,text,text,jsonb,text);
DROP FUNCTION IF EXISTS public.ai_os_approval_decide(uuid,uuid,text,text);
DROP FUNCTION IF EXISTS public.ai_os_approval_finish(uuid,uuid,uuid,text,jsonb,text);
DROP TRIGGER IF EXISTS ai_os_approval_immutable ON public.agent_run_steps;
DROP FUNCTION IF EXISTS public.ai_os_approval_guard();
DROP INDEX IF EXISTS public.ai_os_approval_origin_unique;
ALTER TABLE public.agent_run_steps
 DROP COLUMN approval_status, DROP COLUMN approval_expires_at,
 DROP COLUMN approval_decided_at, DROP COLUMN approval_decided_by,
 DROP COLUMN approval_started_at, DROP COLUMN approval_finished_at,
 DROP COLUMN approval_token, DROP COLUMN approval_origin_call_id,
 DROP COLUMN approval_contract_hash, DROP COLUMN approval_events;
COMMIT;