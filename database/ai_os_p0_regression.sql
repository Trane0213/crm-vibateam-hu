-- Isolated database only. Entire fixture is rolled back.
BEGIN;
INSERT INTO auth.users(id) VALUES ('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');
INSERT INTO public.agent_runs(id,user_id,agent_id,status) VALUES ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','timothy','ok');
DO $$
DECLARE s jsonb; d jsonb; a uuid; tok uuid;
BEGIN
 s:=public.ai_os_approval_create('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001',1,'timothy','TESZT','original','{"args":{"lead_id":"TESZT"},"approval":"confirm"}','hash');
 a:=(s->>'id')::uuid;
 IF (s->>'approval_expires_at')::timestamptz-(s->>'created_at')::timestamptz NOT BETWEEN interval '29 minutes 59 seconds' AND interval '30 minutes 1 second' THEN RAISE EXCEPTION 'expiry FAIL'; END IF;
 IF (public.ai_os_approval_create('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001',1,'timothy','TESZT','original','{"args":{"lead_id":"TESZT"},"approval":"confirm"}','hash')->>'id')::uuid<>a THEN RAISE EXCEPTION 'create replay FAIL'; END IF;
 BEGIN
  PERFORM public.ai_os_approval_decide(a,'00000000-0000-4000-8000-000000000002','approve',NULL);
  RAISE EXCEPTION 'other owner FAIL';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM='other owner FAIL' THEN RAISE; END IF; END;
 BEGIN
  UPDATE public.agent_run_steps SET input_json='{}' WHERE id=a;
  RAISE EXCEPTION 'mutation FAIL';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM='mutation FAIL' THEN RAISE; END IF; END;
 d:=public.ai_os_approval_decide(a,'00000000-0000-4000-8000-000000000001','approve',NULL);
 IF NOT (d->>'claimed')::boolean THEN RAISE EXCEPTION 'claim FAIL'; END IF;
 tok:=(d->'action'->>'approval_token')::uuid;
 IF (public.ai_os_approval_decide(a,'00000000-0000-4000-8000-000000000001','approve',NULL)->>'claimed')::boolean THEN RAISE EXCEPTION 'duplicate FAIL'; END IF;
 PERFORM public.ai_os_approval_finish(a,'00000000-0000-4000-8000-000000000001',tok,'succeeded','{"ok":true}',NULL);
 IF public.ai_os_approval_decide(a,'00000000-0000-4000-8000-000000000001','approve',NULL)->'action'->>'approval_status'<>'succeeded' THEN RAISE EXCEPTION 'success replay FAIL'; END IF;
 s:=public.ai_os_approval_create('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001',2,'timothy','TESZT','reject','{"args":{},"approval":"confirm"}','hash');
 a:=(s->>'id')::uuid;
 PERFORM public.ai_os_approval_decide(a,'00000000-0000-4000-8000-000000000001','reject',NULL);
 IF (public.ai_os_approval_decide(a,'00000000-0000-4000-8000-000000000001','approve',NULL)->>'claimed')::boolean THEN RAISE EXCEPTION 'rejected replay FAIL'; END IF;
 s:=public.ai_os_approval_create('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001',3,'timothy','TESZT','dangerous','{"args":{},"approval":"dangerous"}','hash');
 a:=(s->>'id')::uuid;
 BEGIN
  PERFORM public.ai_os_approval_decide(a,'00000000-0000-4000-8000-000000000001','approve',NULL);
  RAISE EXCEPTION 'dangerous FAIL';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM='dangerous FAIL' THEN RAISE; END IF; END;
 IF NOT (public.ai_os_approval_decide(a,'00000000-0000-4000-8000-000000000001','approve','MEGERŐSÍTEM')->>'claimed')::boolean THEN RAISE EXCEPTION 'dangerous confirm FAIL'; END IF;
 INSERT INTO public.agent_run_steps(run_id,step_no,kind,agent_id,tool_name,input_json,approval_status,approval_expires_at,approval_origin_call_id)
 VALUES('10000000-0000-4000-8000-000000000001',4,'approval','timothy','TESZT','{"args":{},"approval":"confirm"}','pending',clock_timestamp()-interval '1 second','expired') RETURNING id INTO a;
 IF public.ai_os_approval_decide(a,'00000000-0000-4000-8000-000000000001','approve',NULL)->'action'->>'approval_status'<>'expired' THEN RAISE EXCEPTION 'expired FAIL'; END IF;
 IF has_function_privilege('authenticated','public.ai_os_approval_decide(uuid,uuid,text,text)','EXECUTE') OR has_function_privilege('anon','public.ai_os_approval_decide(uuid,uuid,text,text)','EXECUTE') THEN RAISE EXCEPTION 'grants FAIL'; END IF;
 RAISE NOTICE 'PASS: create replay, expiry 30m, wrong owner, immutable params, claim, duplicate, succeeded replay, reject, dangerous, service-only grants';
END $$;
ROLLBACK;