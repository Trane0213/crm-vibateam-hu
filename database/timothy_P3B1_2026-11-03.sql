CREATE OR REPLACE FUNCTION public.sales_update_approved_next_step(p_action_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE a record; l public.leads; saved public.leads; payload jsonb; c jsonb; before_step jsonb; audit record; uid uuid:=auth.uid(); due_at timestamptz;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('next-step-action:'||p_action_id::text,0));
 SELECT s.* INTO a FROM agent_run_steps s JOIN agent_runs ar ON ar.id=s.run_id
 WHERE s.id=p_action_id AND ar.user_id=uid AND ar.agent_id='timothy' AND s.agent_id='timothy'
 AND s.tool_name='sales_update_next_step' AND s.approval_status='executing' AND s.approval_token IS NOT NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Approved next step not accessible' USING ERRCODE='42501'; END IF;
 payload:=a.input_json->'args'; c:=payload->'context';
 IF jsonb_typeof(payload) IS DISTINCT FROM 'object' OR payload->>'type' IS NULL OR payload->>'type' NOT IN ('phone','email','meeting','site_visit','doc_request','quote_send','follow_up','other')
 OR jsonb_typeof(payload->'leadId') IS DISTINCT FROM 'string' OR jsonb_typeof(payload->'dueAt') IS DISTINCT FROM 'string'
 OR (payload->>'dueAt') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$'
 OR jsonb_typeof(payload->'note') IS DISTINCT FROM 'string' OR length(payload->>'note')>10000 OR jsonb_typeof(c) IS DISTINCT FROM 'object'
 OR jsonb_typeof(c->'before') IS DISTINCT FROM 'object' OR NOT (c ?& ARRAY['company_id','contact_id','assigned_to','status','pipeline_entered_at','before'])
 OR NOT ((c->'before') ?& ARRAY['next_step_type','next_step_due_at','next_step_note'])
 OR EXISTS(SELECT 1 FROM jsonb_object_keys(payload) k WHERE k NOT IN ('leadId','type','dueAt','note','context')) THEN RAISE EXCEPTION 'Invalid next step'; END IF;
 due_at:=(payload->>'dueAt')::timestamptz;
 IF NOT isfinite(due_at) THEN RAISE EXCEPTION 'Invalid due date'; END IF;
 SELECT * INTO l FROM leads WHERE id=(payload->>'leadId')::uuid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Lead not accessible' USING ERRCODE='42501'; END IF;
 IF NOT coalesce(is_owner_role(uid) OR (crm_role_of(uid)='sales' AND l.assigned_to=uid),false) THEN RAISE EXCEPTION 'Lead not accessible' USING ERRCODE='42501'; END IF;
 IF l.status IN ('won','lost') THEN RAISE EXCEPTION 'Lead closed'; END IF;
 IF l.company_id IS DISTINCT FROM (c->>'company_id')::uuid OR l.contact_id IS DISTINCT FROM (c->>'contact_id')::uuid OR l.assigned_to IS DISTINCT FROM (c->>'assigned_to')::uuid
 OR l.status IS DISTINCT FROM c->>'status' OR l.pipeline_entered_at IS DISTINCT FROM (c->>'pipeline_entered_at')::timestamptz THEN RAISE EXCEPTION 'Lead context changed'; END IF;
 before_step:=jsonb_build_object('next_step_type',c->'before'->'next_step_type','next_step_due_at',c->'before'->'next_step_due_at','next_step_note',c->'before'->'next_step_note');
 SELECT * INTO audit FROM activities WHERE id=p_action_id;
 IF FOUND THEN
  IF audit.user_id IS DISTINCT FROM uid OR audit.action IS DISTINCT FROM 'update' OR audit.details->>'approval_id' IS DISTINCT FROM p_action_id::text
  OR audit.details->>'entity_id' IS DISTINCT FROM l.id::text OR audit.details->'before' IS DISTINCT FROM before_step
  OR audit.details->'after' IS DISTINCT FROM jsonb_build_object('next_step_type',payload->>'type','next_step_due_at',due_at,'next_step_note',nullif(btrim(payload->>'note'),'')) THEN RAISE EXCEPTION 'Audit identity mismatch'; END IF;
  saved:=l;
 ELSE
  IF l.next_step_type IS DISTINCT FROM c->'before'->>'next_step_type' OR l.next_step_due_at IS DISTINCT FROM (c->'before'->>'next_step_due_at')::timestamptz
  OR l.next_step_note IS DISTINCT FROM c->'before'->>'next_step_note' THEN RAISE EXCEPTION 'Next step changed'; END IF;
  UPDATE leads SET next_step_type=payload->>'type',next_step_due_at=due_at,next_step_note=nullif(btrim(payload->>'note'),'') WHERE id=l.id RETURNING * INTO saved;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lead not updated' USING ERRCODE='42501'; END IF;
  INSERT INTO activities(id,user_id,action,details,created_at) VALUES(p_action_id,uid,'update',jsonb_build_object('entity_type','leads','entity_id',l.id,'field','next_step','approval_id',p_action_id,
   'before',before_step,'after',jsonb_build_object('next_step_type',saved.next_step_type,'next_step_due_at',saved.next_step_due_at,'next_step_note',saved.next_step_note)),clock_timestamp());
 END IF;
 IF saved.next_step_type IS DISTINCT FROM payload->>'type' OR saved.next_step_due_at IS DISTINCT FROM due_at OR saved.next_step_note IS DISTINCT FROM nullif(btrim(payload->>'note'),'') THEN RAISE EXCEPTION 'Saved next step not verified'; END IF;
 RETURN jsonb_build_object('lead',jsonb_build_object('id',saved.id,'next_step_type',saved.next_step_type,'next_step_due_at',saved.next_step_due_at,'next_step_note',saved.next_step_note),'before',before_step,'audit_id',p_action_id,'approval_id',p_action_id);
END $$;
REVOKE ALL ON FUNCTION public.sales_update_approved_next_step(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sales_update_approved_next_step(uuid) TO authenticated;