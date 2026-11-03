CREATE OR REPLACE FUNCTION public.sales_change_approved_pipeline_status(p_action_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE a record; l public.leads; saved public.leads; p jsonb; c jsonb; au record; uid uuid:=auth.uid(); co_name text; audit_details jsonb;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('pipeline-status-action:'||p_action_id::text,0));
 SELECT s.* INTO a FROM agent_run_steps s JOIN agent_runs r ON r.id=s.run_id WHERE s.id=p_action_id AND r.user_id=uid AND r.agent_id='timothy' AND s.agent_id='timothy' AND s.tool_name='sales_change_pipeline_status' AND s.approval_status='executing' AND s.approval_token IS NOT NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Approval inaccessible' USING ERRCODE='42501'; END IF;
 p:=a.input_json->'args'; c:=p->'context';
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR jsonb_typeof(c) IS DISTINCT FROM 'object' OR jsonb_typeof(p->'leadId') IS DISTINCT FROM 'string'
 OR NOT(c ?& ARRAY['lead_name','company_id','company_name','contact_id','assigned_to','status','pipeline_entered_at','next_step_type','next_step_due_at','next_step_note'])
 OR EXISTS(SELECT 1 FROM jsonb_object_keys(p) k WHERE k NOT IN ('leadId','status','context')) THEN RAISE EXCEPTION 'Invalid pipeline action'; END IF;
 -- Exact open edges from existing STATUS_TRANSITIONS, not a new global state machine.
 IF NOT coalesce(((c->>'status'='quote_prep' AND p->>'status'='quote_sent') OR (c->>'status'='quote_sent' AND p->>'status' IN ('follow_up','contract')) OR (c->>'status'='follow_up' AND p->>'status' IN ('quote_sent','contract'))),false) THEN RAISE EXCEPTION 'Disallowed open transition'; END IF;
 SELECT * INTO l FROM leads WHERE id=(p->>'leadId')::uuid FOR UPDATE;
 IF NOT FOUND OR NOT coalesce(is_owner_role(uid) OR (crm_role_of(uid)='sales' AND l.assigned_to=uid),false) THEN RAISE EXCEPTION 'Lead inaccessible' USING ERRCODE='42501'; END IF;
 IF l.pipeline_entered_at IS NULL OR l.pipeline_entered_at IS DISTINCT FROM (c->>'pipeline_entered_at')::timestamptz OR l.company_id IS DISTINCT FROM (c->>'company_id')::uuid OR l.contact_id IS DISTINCT FROM (c->>'contact_id')::uuid OR l.assigned_to IS DISTINCT FROM (c->>'assigned_to')::uuid OR left(coalesce(nullif(l.summary,''),'Érdeklődő'),300) IS DISTINCT FROM c->>'lead_name'
 OR l.next_step_type IS NULL OR l.next_step_due_at IS NULL OR l.next_step_type IS DISTINCT FROM c->>'next_step_type' OR l.next_step_due_at IS DISTINCT FROM (c->>'next_step_due_at')::timestamptz OR l.next_step_note IS DISTINCT FROM c->>'next_step_note' THEN RAISE EXCEPTION 'Lead context or next step changed'; END IF;
 IF l.company_id IS NOT NULL THEN
  SELECT name INTO co_name FROM companies WHERE id=l.company_id FOR SHARE;
  IF NOT FOUND OR left(co_name,300) IS DISTINCT FROM c->>'company_name' THEN RAISE EXCEPTION 'Company changed'; END IF;
 END IF;
 audit_details:=jsonb_build_object('entity_type','leads','entity_id',l.id,'action','status_change','approval_id',p_action_id,'from',c->'status','to',p->'status');
 SELECT * INTO au FROM activities WHERE id=p_action_id;
 IF FOUND THEN
  IF au.user_id IS DISTINCT FROM uid OR au.action IS DISTINCT FROM 'update' OR au.details IS DISTINCT FROM audit_details THEN RAISE EXCEPTION 'Audit mismatch'; END IF;
  saved:=l;
 ELSE
  IF l.status IS DISTINCT FROM c->>'status' THEN RAISE EXCEPTION 'Lead status changed'; END IF;
  UPDATE leads SET status=p->>'status' WHERE id=l.id RETURNING * INTO saved;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lead not updated' USING ERRCODE='42501'; END IF;
  INSERT INTO activities(id,user_id,action,details,created_at) VALUES(p_action_id,uid,'update',audit_details,clock_timestamp());
 END IF;
 IF saved.status IS DISTINCT FROM p->>'status' THEN RAISE EXCEPTION 'Saved status mismatch'; END IF;
 RETURN jsonb_build_object('lead',jsonb_build_object('id',saved.id,'company_id',saved.company_id,'contact_id',saved.contact_id,'assigned_to',saved.assigned_to,'status',saved.status,'pipeline_entered_at',saved.pipeline_entered_at,'next_step_type',saved.next_step_type,'next_step_due_at',saved.next_step_due_at,'next_step_note',saved.next_step_note),'before_status',c->'status','audit_id',p_action_id,'approval_id',p_action_id);
END $$;
REVOKE ALL ON FUNCTION public.sales_change_approved_pipeline_status(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sales_change_approved_pipeline_status(uuid) TO authenticated;