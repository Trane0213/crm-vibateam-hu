CREATE OR REPLACE FUNCTION public.sales_set_approved_contact(p_action_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE a record; l public.leads; saved public.leads; p jsonb; c jsonb; t public.contacts; old_name text; co_name text; au record; uid uuid:=auth.uid();
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('contact-action:'||p_action_id::text,0));
 SELECT s.* INTO a FROM agent_run_steps s JOIN agent_runs r ON r.id=s.run_id WHERE s.id=p_action_id AND r.user_id=uid AND r.agent_id='timothy' AND s.agent_id='timothy' AND s.tool_name='sales_set_lead_contact' AND s.approval_status='executing' AND s.approval_token IS NOT NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Approval inaccessible' USING ERRCODE='42501'; END IF;
 p:=a.input_json->'args';c:=p->'context';
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR jsonb_typeof(p->'leadId') IS DISTINCT FROM 'string' OR jsonb_typeof(p->'contactId') IS DISTINCT FROM 'string' OR jsonb_typeof(c) IS DISTINCT FROM 'object'
 OR NOT(c ?& ARRAY['company_id','company_name','contact_id','contact_name','assigned_to','status','pipeline_entered_at','new_contact_name'])
 OR EXISTS(SELECT 1 FROM jsonb_object_keys(p) k WHERE k NOT IN ('leadId','contactId','context')) THEN RAISE EXCEPTION 'Invalid contact action'; END IF;
 SELECT * INTO l FROM leads WHERE id=(p->>'leadId')::uuid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Lead inaccessible' USING ERRCODE='42501'; END IF;
 IF NOT coalesce(is_owner_role(uid) OR (crm_role_of(uid)='sales' AND l.assigned_to=uid),false) THEN RAISE EXCEPTION 'Lead inaccessible' USING ERRCODE='42501'; END IF;
 IF l.status IN ('won','lost') OR l.company_id IS NULL OR l.company_id IS DISTINCT FROM (c->>'company_id')::uuid OR l.assigned_to IS DISTINCT FROM (c->>'assigned_to')::uuid OR l.status IS DISTINCT FROM c->>'status' OR l.pipeline_entered_at IS DISTINCT FROM (c->>'pipeline_entered_at')::timestamptz THEN RAISE EXCEPTION 'Lead context changed'; END IF;
 SELECT name INTO co_name FROM companies WHERE id=l.company_id FOR SHARE;
 IF NOT FOUND OR left(co_name,300) IS DISTINCT FROM c->>'company_name' THEN RAISE EXCEPTION 'Company changed'; END IF;
 PERFORM id FROM contacts WHERE id IN ((p->>'contactId')::uuid,(c->>'contact_id')::uuid) ORDER BY id FOR SHARE;
 SELECT * INTO t FROM contacts WHERE id=(p->>'contactId')::uuid AND company_id=l.company_id;
 IF NOT FOUND OR left(t.name,300) IS DISTINCT FROM c->>'new_contact_name' THEN RAISE EXCEPTION 'Target contact changed or inaccessible'; END IF;
 IF c->>'contact_id' IS NOT NULL THEN
  SELECT name INTO old_name FROM contacts WHERE id=(c->>'contact_id')::uuid;
  IF NOT FOUND OR left(old_name,300) IS DISTINCT FROM c->>'contact_name' THEN RAISE EXCEPTION 'Old contact changed'; END IF;
 END IF;
 SELECT * INTO au FROM activities WHERE id=p_action_id;
 IF FOUND THEN
  IF au.user_id IS DISTINCT FROM uid OR au.action IS DISTINCT FROM 'update' OR au.details IS DISTINCT FROM jsonb_build_object('entity_type','leads','entity_id',l.id,'field','contact_id','approval_id',p_action_id,'before',c->'contact_id','after',p->'contactId') THEN RAISE EXCEPTION 'Audit mismatch'; END IF;
  saved:=l;
 ELSE
  IF l.contact_id IS DISTINCT FROM (c->>'contact_id')::uuid THEN RAISE EXCEPTION 'Lead contact changed'; END IF;
  UPDATE leads SET contact_id=t.id WHERE id=l.id RETURNING * INTO saved;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lead not updated' USING ERRCODE='42501'; END IF;
  INSERT INTO activities(id,user_id,action,details,created_at) VALUES(p_action_id,uid,'update',jsonb_build_object('entity_type','leads','entity_id',l.id,'field','contact_id','approval_id',p_action_id,'before',c->'contact_id','after',p->'contactId'),clock_timestamp());
 END IF;
 IF saved.contact_id IS DISTINCT FROM t.id THEN RAISE EXCEPTION 'Saved contact mismatch'; END IF;
 RETURN jsonb_build_object('lead',jsonb_build_object('id',saved.id,'company_id',saved.company_id,'contact_id',saved.contact_id,'assigned_to',saved.assigned_to,'status',saved.status,'pipeline_entered_at',saved.pipeline_entered_at),'before_contact_id',c->'contact_id','audit_id',p_action_id,'approval_id',p_action_id);
END $$;
REVOKE ALL ON FUNCTION public.sales_set_approved_contact(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sales_set_approved_contact(uuid) TO authenticated;