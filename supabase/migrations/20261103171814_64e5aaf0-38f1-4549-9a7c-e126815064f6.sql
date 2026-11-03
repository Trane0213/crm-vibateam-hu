CREATE OR REPLACE FUNCTION public.sales_reassign_approved_lead(p_action_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE a record; l public.leads; saved public.leads; p jsonb; c jsonb; t record; au record; uid uuid:=auth.uid(); old_name text; co_name text; audit_details jsonb;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('assignment-action:'||p_action_id::text,0));
 SELECT s.* INTO a FROM agent_run_steps s JOIN agent_runs r ON r.id=s.run_id WHERE s.id=p_action_id AND r.user_id=uid AND r.agent_id='timothy' AND s.agent_id='timothy' AND s.tool_name='sales_reassign_lead' AND s.approval_status='executing' AND s.approval_token IS NOT NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Approval inaccessible' USING ERRCODE='42501'; END IF;
 p:=a.input_json->'args';c:=p->'context';
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR jsonb_typeof(c) IS DISTINCT FROM 'object'
 OR jsonb_typeof(p->'leadId') IS DISTINCT FROM 'string' OR jsonb_typeof(p->'assigneeId') IS DISTINCT FROM 'string'
 OR NOT(c ?& ARRAY['lead_name','company_id','company_name','contact_id','assigned_to','assigned_at','assignee_name','new_assignee_name','status','pipeline_entered_at'])
 OR EXISTS(SELECT 1 FROM jsonb_object_keys(p) k WHERE k NOT IN ('leadId','assigneeId','context')) THEN RAISE EXCEPTION 'Invalid assignment action'; END IF;
 PERFORM up.active FROM users_profile up JOIN roles r ON r.id=up.role_id WHERE up.auth_user_id=uid AND lower(r.name) IN ('owner','tulajdonos','admin','superadmin') FOR SHARE OF up,r;
 IF NOT FOUND THEN RAISE EXCEPTION 'Only owner may reassign' USING ERRCODE='42501'; END IF;
 SELECT * INTO l FROM leads WHERE id=(p->>'leadId')::uuid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Lead inaccessible' USING ERRCODE='42501'; END IF;
 IF l.status IN ('won','lost') OR l.status IS DISTINCT FROM c->>'status' OR l.company_id IS DISTINCT FROM (c->>'company_id')::uuid OR l.contact_id IS DISTINCT FROM (c->>'contact_id')::uuid OR l.pipeline_entered_at IS DISTINCT FROM (c->>'pipeline_entered_at')::timestamptz OR left(coalesce(nullif(l.summary,''),'Érdeklődő'),300) IS DISTINCT FROM c->>'lead_name' THEN RAISE EXCEPTION 'Lead context changed'; END IF;
 IF l.company_id IS NOT NULL THEN
  SELECT name INTO co_name FROM companies WHERE id=l.company_id FOR SHARE;
  IF NOT FOUND OR left(co_name,300) IS DISTINCT FROM c->>'company_name' THEN RAISE EXCEPTION 'Company changed'; END IF;
 END IF;
 SELECT up.auth_user_id,up.full_name,up.email,up.active,r.name INTO t FROM users_profile up JOIN roles r ON r.id=up.role_id WHERE up.auth_user_id=(p->>'assigneeId')::uuid FOR SHARE OF up,r;
 IF NOT FOUND OR t.active IS DISTINCT FROM true OR lower(t.name) IS DISTINCT FROM 'sales' OR left(coalesce(nullif(t.full_name,''),t.email,''),300) IS DISTINCT FROM c->>'new_assignee_name' THEN RAISE EXCEPTION 'Target sales changed or inactive'; END IF;
 IF c->>'assigned_to' IS NOT NULL THEN
  SELECT left(coalesce(nullif(full_name,''),email),300) INTO old_name FROM users_profile WHERE auth_user_id=(c->>'assigned_to')::uuid FOR SHARE;
  IF NOT FOUND OR old_name IS DISTINCT FROM c->>'assignee_name' THEN RAISE EXCEPTION 'Old assignee changed'; END IF;
 END IF;
 audit_details:=jsonb_build_object('entity_type','leads','entity_id',l.id,'field','assigned_to','approval_id',p_action_id,'before',c->'assigned_to','after',p->'assigneeId');
 SELECT * INTO au FROM activities WHERE id=p_action_id;
 IF FOUND THEN
  IF au.user_id IS DISTINCT FROM uid OR au.action IS DISTINCT FROM 'update' OR au.details IS DISTINCT FROM audit_details THEN RAISE EXCEPTION 'Audit mismatch'; END IF;
  saved:=l;
 ELSE
  IF l.assigned_to IS DISTINCT FROM (c->>'assigned_to')::uuid OR l.assigned_at IS DISTINCT FROM (c->>'assigned_at')::timestamptz OR l.assigned_to=t.auth_user_id THEN RAISE EXCEPTION 'Assignment changed'; END IF;
  UPDATE leads SET assigned_to=t.auth_user_id WHERE id=l.id RETURNING * INTO saved;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lead not updated' USING ERRCODE='42501'; END IF;
  INSERT INTO activities(id,user_id,action,details,created_at) VALUES(p_action_id,uid,'update',audit_details,clock_timestamp());
 END IF;
 IF saved.assigned_to IS DISTINCT FROM t.auth_user_id OR saved.assigned_at IS NULL OR (c->>'assigned_at' IS NOT NULL AND saved.assigned_at IS DISTINCT FROM (c->>'assigned_at')::timestamptz) THEN RAISE EXCEPTION 'Saved assignment mismatch'; END IF;
 RETURN jsonb_build_object('lead',jsonb_build_object('id',saved.id,'company_id',saved.company_id,'contact_id',saved.contact_id,'assigned_to',saved.assigned_to,'assigned_at',saved.assigned_at,'status',saved.status,'pipeline_entered_at',saved.pipeline_entered_at),'before_assigned_to',c->'assigned_to','audit_id',p_action_id,'approval_id',p_action_id);
END $$;
REVOKE ALL ON FUNCTION public.sales_reassign_approved_lead(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sales_reassign_approved_lead(uuid) TO authenticated;