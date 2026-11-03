ALTER TABLE public.agent_run_steps
 ADD COLUMN approval_status text CHECK (approval_status IN ('pending','executing','succeeded','failed','rejected','expired','unknown')),
 ADD COLUMN approval_expires_at timestamptz,
 ADD COLUMN approval_decided_at timestamptz,
 ADD COLUMN approval_decided_by uuid REFERENCES auth.users(id),
 ADD COLUMN approval_started_at timestamptz,
 ADD COLUMN approval_finished_at timestamptz,
 ADD COLUMN approval_token uuid,
 ADD COLUMN approval_origin_call_id text,
 ADD COLUMN approval_contract_hash text,
 ADD COLUMN approval_events jsonb;
CREATE UNIQUE INDEX ai_os_approval_origin_unique ON public.agent_run_steps(run_id,approval_origin_call_id) WHERE approval_origin_call_id IS NOT NULL;

CREATE FUNCTION public.ai_os_approval_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
 IF OLD.approval_status IS NOT NULL AND
   (NEW.run_id,NEW.kind,NEW.agent_id,NEW.tool_name,NEW.input_json,NEW.approval_origin_call_id,NEW.approval_contract_hash,NEW.approval_expires_at)
   IS DISTINCT FROM
   (OLD.run_id,OLD.kind,OLD.agent_id,OLD.tool_name,OLD.input_json,OLD.approval_origin_call_id,OLD.approval_contract_hash,OLD.approval_expires_at) THEN
   RAISE EXCEPTION 'Immutable approval parameters';
 END IF;
 IF OLD.approval_status IS NOT NULL AND NEW.approval_status IS DISTINCT FROM OLD.approval_status AND NOT (
   (OLD.approval_status='pending' AND NEW.approval_status IN ('executing','rejected','expired')) OR
   (OLD.approval_status='executing' AND NEW.approval_status IN ('succeeded','failed','unknown'))
 ) THEN RAISE EXCEPTION 'Invalid approval transition'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ai_os_approval_immutable BEFORE UPDATE ON public.agent_run_steps FOR EACH ROW EXECUTE FUNCTION public.ai_os_approval_guard();

CREATE FUNCTION public.ai_os_approval_create(p_run uuid,p_user uuid,p_step integer,p_agent text,p_tool text,p_call text,p_input jsonb,p_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.agent_run_steps;
BEGIN
 PERFORM 1 FROM public.agent_runs WHERE id=p_run AND user_id=p_user AND agent_id=p_agent FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Approval owner mismatch'; END IF;
 IF jsonb_typeof(p_input->'args') IS DISTINCT FROM 'object' OR p_input->>'approval' NOT IN ('confirm','dangerous') THEN RAISE EXCEPTION 'Invalid approval input'; END IF;
 SELECT * INTO s FROM public.agent_run_steps WHERE run_id=p_run AND approval_origin_call_id=p_call;
 IF FOUND THEN
  IF s.input_json IS DISTINCT FROM p_input OR s.tool_name IS DISTINCT FROM p_tool OR s.approval_contract_hash IS DISTINCT FROM p_hash THEN RAISE EXCEPTION 'Approval parameter mismatch'; END IF;
  RETURN to_jsonb(s);
 END IF;
 INSERT INTO public.agent_run_steps(run_id,step_no,kind,agent_id,tool_name,input_json,approval_status,approval_expires_at,approval_origin_call_id,approval_contract_hash,approval_events)
 VALUES(p_run,p_step,'approval',p_agent,p_tool,p_input,'pending',clock_timestamp()+interval '30 minutes',p_call,p_hash,jsonb_build_array(jsonb_build_object('state','pending','at',clock_timestamp()))) RETURNING * INTO s;
 RETURN to_jsonb(s);
END $$;

CREATE FUNCTION public.ai_os_approval_decide(p_id uuid,p_user uuid,p_decision text,p_confirmation text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.agent_run_steps; claimed boolean:=false;
BEGIN
 SELECT st.* INTO s FROM public.agent_run_steps st JOIN public.agent_runs r ON r.id=st.run_id
 WHERE st.id=p_id AND r.user_id=p_user AND st.approval_status IS NOT NULL FOR UPDATE OF st;
 IF NOT FOUND THEN RAISE EXCEPTION 'Approval not accessible'; END IF;
 IF p_decision NOT IN ('approve','reject','check') THEN RAISE EXCEPTION 'Invalid decision'; END IF;
 IF s.approval_status='pending' AND s.approval_expires_at<=clock_timestamp() THEN
  UPDATE public.agent_run_steps SET approval_status='expired',approval_finished_at=clock_timestamp(),approval_events=approval_events||jsonb_build_array(jsonb_build_object('state','expired','at',clock_timestamp())) WHERE id=p_id RETURNING * INTO s;
 ELSIF s.approval_status='pending' AND p_decision IN ('approve','reject') THEN
  IF p_decision='approve' AND s.input_json->>'approval'='dangerous' AND p_confirmation IS DISTINCT FROM 'MEGERŐSÍTEM' THEN RAISE EXCEPTION 'Confirmation required'; END IF;
  UPDATE public.agent_run_steps SET approval_status=CASE WHEN p_decision='approve' THEN 'executing' ELSE 'rejected' END,
   approval_decided_at=clock_timestamp(),approval_decided_by=p_user,
   approval_started_at=CASE WHEN p_decision='approve' THEN clock_timestamp() END,
   approval_finished_at=CASE WHEN p_decision='reject' THEN clock_timestamp() END,
   approval_token=CASE WHEN p_decision='approve' THEN gen_random_uuid() END,
   approval_events=approval_events||jsonb_build_array(jsonb_build_object('state',CASE WHEN p_decision='approve' THEN 'executing' ELSE 'rejected' END,'user',p_user,'at',clock_timestamp()))
  WHERE id=p_id RETURNING * INTO s;
  claimed:=p_decision='approve';
 END IF;
 RETURN jsonb_build_object('action',to_jsonb(s),'claimed',claimed);
END $$;

CREATE FUNCTION public.ai_os_approval_finish(p_id uuid,p_user uuid,p_token uuid,p_status text,p_result jsonb,p_error text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.agent_run_steps;
BEGIN
 IF p_status NOT IN ('succeeded','failed','unknown') THEN RAISE EXCEPTION 'Invalid result'; END IF;
 SELECT st.* INTO s FROM public.agent_run_steps st JOIN public.agent_runs r ON r.id=st.run_id WHERE st.id=p_id AND r.user_id=p_user AND st.approval_token=p_token FOR UPDATE OF st;
 IF NOT FOUND THEN RAISE EXCEPTION 'Invalid execution token'; END IF;
 IF s.approval_status<>'executing' THEN RETURN to_jsonb(s); END IF;
 UPDATE public.agent_run_steps SET approval_status=p_status,output_json=p_result,error=p_error,approval_finished_at=clock_timestamp(),
 approval_events=approval_events||jsonb_build_array(jsonb_build_object('state',p_status,'at',clock_timestamp(),'user',p_user)) WHERE id=p_id RETURNING * INTO s;
 RETURN to_jsonb(s);
END $$;

REVOKE ALL ON FUNCTION public.ai_os_approval_guard() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.ai_os_approval_create(uuid,uuid,integer,text,text,text,jsonb,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.ai_os_approval_decide(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.ai_os_approval_finish(uuid,uuid,uuid,text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ai_os_approval_create(uuid,uuid,integer,text,text,text,jsonb,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_os_approval_decide(uuid,uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_os_approval_finish(uuid,uuid,uuid,text,jsonb,text) TO service_role;