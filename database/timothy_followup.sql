CREATE OR REPLACE FUNCTION public.sales_create_approved_followup(p_action_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE a record; l public.leads; f public.followups; p jsonb; c jsonb; uid uuid:=auth.uid(); due_at timestamptz; audit record;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('followup-action:'||p_action_id::text,0));
 SELECT s.* INTO a FROM agent_run_steps s JOIN agent_runs r ON r.id=s.run_id WHERE s.id=p_action_id AND r.user_id=uid AND r.agent_id='timothy' AND s.agent_id='timothy' AND s.tool_name='sales_create_followup' AND s.approval_status='executing' AND s.approval_token IS NOT NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Approved followup not accessible' USING ERRCODE='42501'; END IF;
 p:=a.input_json->'args'; c:=p->'context';
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR p->>'type' IS NULL OR p->>'type' NOT IN ('call','email','meeting','other') OR jsonb_typeof(p->'leadId') IS DISTINCT FROM 'string'
 OR jsonb_typeof(p->'dueAt') IS DISTINCT FROM 'string' OR (p->>'dueAt') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$'
 OR jsonb_typeof(p->'note') IS DISTINCT FROM 'string' OR length(p->>'note')>10000 OR jsonb_typeof(c) IS DISTINCT FROM 'object' OR NOT(c ?& ARRAY['company_id','contact_id','assigned_to','status','pipeline_entered_at'])
 OR EXISTS(SELECT 1 FROM jsonb_object_keys(p) k WHERE k NOT IN ('leadId','type','dueAt','note','context')) THEN RAISE EXCEPTION 'Invalid followup'; END IF;
 due_at:=(p->>'dueAt')::timestamptz;
 IF NOT isfinite(due_at) THEN RAISE EXCEPTION 'Invalid due date'; END IF;
 SELECT * INTO l FROM leads WHERE id=(p->>'leadId')::uuid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Lead inaccessible' USING ERRCODE='42501'; END IF;
 IF NOT coalesce(is_owner_role(uid) OR (crm_role_of(uid)='sales' AND l.assigned_to=uid),false) THEN RAISE EXCEPTION 'Lead inaccessible' USING ERRCODE='42501'; END IF;
 IF l.status IN ('won','lost') OR l.status IS DISTINCT FROM c->>'status' OR l.company_id IS DISTINCT FROM (c->>'company_id')::uuid OR l.contact_id IS DISTINCT FROM (c->>'contact_id')::uuid OR l.assigned_to IS DISTINCT FROM (c->>'assigned_to')::uuid OR l.pipeline_entered_at IS DISTINCT FROM (c->>'pipeline_entered_at')::timestamptz THEN RAISE EXCEPTION 'Lead context changed'; END IF;
 SELECT * INTO f FROM followups WHERE id=p_action_id;
 IF FOUND THEN
  SELECT * INTO audit FROM activities WHERE id=p_action_id AND user_id=uid AND action='create' AND details->>'approval_id'=p_action_id::text AND details->>'entity_type'='followups' AND details->>'entity_id'=p_action_id::text;
  IF NOT FOUND THEN RAISE EXCEPTION 'Missing exact audit'; END IF;
 ELSE
  IF EXISTS(SELECT 1 FROM followups WHERE lead_id=l.id AND completed IS NOT TRUE) THEN RAISE EXCEPTION 'Lead already has an open followup'; END IF;
  INSERT INTO followups(id,lead_id,company_id,assigned_to,followup_type,due_date,result,completed,created_at)
  VALUES(p_action_id,l.id,l.company_id,coalesce(l.assigned_to,uid),p->>'type',due_at,nullif(btrim(p->>'note'),''),false,clock_timestamp()) RETURNING * INTO f;
  INSERT INTO activities(id,user_id,action,details,created_at) VALUES(p_action_id,uid,'create',jsonb_build_object('entity_type','followups','entity_id',p_action_id,'approval_id',p_action_id,'payload',jsonb_build_object('lead_id',l.id,'type',f.followup_type)),clock_timestamp());
 END IF;
 IF f.lead_id IS DISTINCT FROM l.id OR f.company_id IS DISTINCT FROM l.company_id OR f.assigned_to IS DISTINCT FROM coalesce(l.assigned_to,uid) OR f.project_id IS NOT NULL OR f.quote_id IS NOT NULL OR f.followup_type IS DISTINCT FROM p->>'type' OR f.due_date IS DISTINCT FROM due_at OR f.result IS DISTINCT FROM nullif(btrim(p->>'note'),'') OR f.completed IS DISTINCT FROM false THEN RAISE EXCEPTION 'Saved followup mismatch'; END IF;
 RETURN jsonb_build_object('followup',to_jsonb(f),'audit_id',p_action_id,'approval_id',p_action_id);
END $$;
REVOKE ALL ON FUNCTION public.sales_create_approved_followup(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sales_create_approved_followup(uuid) TO authenticated;