CREATE OR REPLACE FUNCTION public.sales_record_approved_prep_activity(p_action_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE a record; l record; f public.followups; payload jsonb; uid uuid:=auth.uid(); r text; at_time timestamptz:=clock_timestamp(); audit_id uuid;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('prep-action:'||p_action_id::text,0));
 SELECT s.*,ar.user_id INTO a FROM agent_run_steps s JOIN agent_runs ar ON ar.id=s.run_id
 WHERE s.id=p_action_id AND ar.user_id=uid AND ar.agent_id='timothy' AND s.agent_id='timothy'
 AND s.tool_name='sales_record_prep_activity' AND s.approval_status='executing' AND s.approval_token IS NOT NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Approved activity not accessible' USING ERRCODE='42501'; END IF;
 payload:=a.input_json->'args';
 IF jsonb_typeof(payload) IS DISTINCT FROM 'object' OR payload->>'type' IS NULL OR payload->>'type' NOT IN ('call','email') OR jsonb_typeof(payload->'leadId') IS DISTINCT FROM 'string'
 OR jsonb_typeof(payload->'result') IS DISTINCT FROM 'string' OR length(payload->>'result')>10000 OR jsonb_typeof(payload->'context') IS DISTINCT FROM 'object'
 OR EXISTS(SELECT 1 FROM jsonb_object_keys(payload) k WHERE k NOT IN ('leadId','type','result','context')) THEN RAISE EXCEPTION 'Invalid activity'; END IF;
 SELECT id,company_id,contact_id,status,pipeline_entered_at,assigned_to INTO l FROM leads WHERE id=(payload->>'leadId')::uuid FOR UPDATE;
 r:=crm_role_of(uid);
 IF NOT FOUND OR NOT (is_owner_role(uid) OR (r='sales' AND l.assigned_to=uid)) THEN RAISE EXCEPTION 'Lead not accessible' USING ERRCODE='42501'; END IF;
 IF l.pipeline_entered_at IS NOT NULL OR l.status IN ('won','lost') THEN RAISE EXCEPTION 'Lead is not in preparation'; END IF;
 IF to_jsonb(l.company_id) IS DISTINCT FROM nullif(payload->'context'->'company_id','null'::jsonb) OR to_jsonb(l.contact_id) IS DISTINCT FROM nullif(payload->'context'->'contact_id','null'::jsonb)
 OR to_jsonb(l.assigned_to) IS DISTINCT FROM nullif(payload->'context'->'assigned_to','null'::jsonb) THEN RAISE EXCEPTION 'Lead context changed'; END IF;
 SELECT * INTO f FROM followups WHERE id=p_action_id;
 IF FOUND THEN
  IF f.lead_id IS DISTINCT FROM l.id OR f.followup_type IS DISTINCT FROM payload->>'type' OR f.result IS DISTINCT FROM nullif(payload->>'result','') OR f.completed IS DISTINCT FROM true OR f.due_date IS DISTINCT FROM f.created_at
  OR f.company_id IS DISTINCT FROM l.company_id OR f.assigned_to IS DISTINCT FROM coalesce(l.assigned_to,uid) THEN RAISE EXCEPTION 'Activity identity mismatch'; END IF;
  SELECT id INTO audit_id FROM activities WHERE user_id=uid AND details->>'approval_id'=p_action_id::text LIMIT 1;
  IF audit_id IS NULL THEN RAISE EXCEPTION 'Missing activity audit'; END IF;
 ELSE
  INSERT INTO followups(id,lead_id,company_id,followup_type,result,completed,due_date,created_at,assigned_to)
  VALUES(p_action_id,l.id,l.company_id,payload->>'type',nullif(payload->>'result',''),true,at_time,at_time,coalesce(l.assigned_to,uid)) RETURNING * INTO f;
  INSERT INTO activities(user_id,action,details,created_at) VALUES(uid,'create',jsonb_build_object('entity_type','followups','entity_id',f.id,'approval_id',p_action_id,'payload',jsonb_build_object('lead_id',l.id,'type',f.followup_type)),at_time) RETURNING id INTO audit_id;
 END IF;
 RETURN jsonb_build_object('activity',to_jsonb(f),'audit_id',audit_id,'approval_id',p_action_id);
END $$;
REVOKE ALL ON FUNCTION public.sales_record_approved_prep_activity(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sales_record_approved_prep_activity(uuid) TO authenticated;