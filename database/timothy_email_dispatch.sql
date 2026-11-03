-- No tables, grants to client roles, policies or existing P0 functions change.
CREATE OR REPLACE FUNCTION public.ai_os_email_dispatch_claim(p_action uuid,p_user uuid,p_args jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.agent_run_steps;
BEGIN
 SELECT st.* INTO s FROM public.agent_run_steps st JOIN public.agent_runs r ON r.id=st.run_id
 WHERE st.id=p_action AND r.user_id=p_user AND r.agent_id='timothy' FOR UPDATE OF st;
 IF NOT FOUND OR s.agent_id IS DISTINCT FROM 'timothy' OR s.tool_name IS DISTINCT FROM 'sales_send_email'
 OR s.approval_status IS DISTINCT FROM 'executing' OR s.approval_decided_by IS DISTINCT FROM p_user
 OR s.approval_token IS NULL OR s.approval_expires_at<=clock_timestamp()
 OR s.input_json->'args' IS DISTINCT FROM p_args OR s.input_json->>'approval' IS DISTINCT FROM 'dangerous' THEN
  RAISE EXCEPTION 'Invalid email approval' USING ERRCODE='42501';
 END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(s.approval_events,'[]'::jsonb)) e WHERE e->>'state'='email_dispatch_claimed') THEN RETURN false; END IF;
 UPDATE public.agent_run_steps SET approval_events=coalesce(approval_events,'[]'::jsonb)||jsonb_build_array(jsonb_build_object('state','email_dispatch_claimed','at',clock_timestamp(),'user',p_user)) WHERE id=p_action;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.ai_os_email_dispatch_claim(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ai_os_email_dispatch_claim(uuid,uuid,jsonb) TO service_role;
-- Rollback: DROP FUNCTION public.ai_os_email_dispatch_claim(uuid,uuid,jsonb);