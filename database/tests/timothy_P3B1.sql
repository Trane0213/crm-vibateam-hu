-- Scratch DB ONLY. No production execution.
CREATE ROLE authenticated;
CREATE ROLE anon;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
CREATE FUNCTION crm_role_of(uuid) RETURNS text LANGUAGE sql AS $$ SELECT current_setting('test.role',true) $$;
CREATE FUNCTION is_owner_role(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT current_setting('test.role',true)='owner' $$;
CREATE TABLE leads(id uuid PRIMARY KEY,company_id uuid,contact_id uuid,status text,pipeline_entered_at timestamptz,assigned_to uuid,next_step_type text,next_step_due_at timestamptz,next_step_note text);
GRANT SELECT,UPDATE ON leads TO authenticated;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_lead ON leads FOR ALL TO authenticated USING(is_owner_role(auth.uid()) OR assigned_to=auth.uid());
CREATE TABLE agent_runs(id uuid PRIMARY KEY,user_id uuid,agent_id text);
GRANT SELECT ON agent_runs TO authenticated;
ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_run ON agent_runs TO authenticated USING(user_id=auth.uid());
CREATE TABLE agent_run_steps(id uuid PRIMARY KEY,run_id uuid,agent_id text,tool_name text,approval_status text,approval_token uuid,input_json jsonb);
GRANT SELECT ON agent_run_steps TO authenticated;
ALTER TABLE agent_run_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_step ON agent_run_steps TO authenticated USING(EXISTS(SELECT 1 FROM agent_runs r WHERE r.id=run_id));
CREATE TABLE activities(id uuid PRIMARY KEY,user_id uuid,action text,details jsonb,created_at timestamptz);
GRANT SELECT,INSERT ON activities TO authenticated;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY read_audit ON activities FOR SELECT TO authenticated USING(true);
CREATE POLICY insert_self ON activities FOR INSERT TO authenticated WITH CHECK(user_id=auth.uid());
GRANT USAGE ON SCHEMA auth TO authenticated;
\i database/timothy_P3B1_2026-11-03.sql
INSERT INTO leads VALUES('00000000-0000-4000-8000-000000000001',NULL,NULL,'new',NULL,'00000000-0000-4000-8000-000000000010',NULL,NULL,NULL);
INSERT INTO agent_runs VALUES('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000010','timothy');
INSERT INTO agent_run_steps VALUES('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000002','timothy','sales_update_next_step','executing',gen_random_uuid(),'{"args":{"leadId":"00000000-0000-4000-8000-000000000001","type":"phone","dueAt":"2026-11-05T10:00:00+01:00","note":"TESZT visszahívás","context":{"company_id":null,"contact_id":null,"assigned_to":"00000000-0000-4000-8000-000000000010","status":"new","pipeline_entered_at":null,"before":{"next_step_type":null,"next_step_due_at":null,"next_step_note":null}}}}');
SET test.uid='00000000-0000-4000-8000-000000000010'; SET test.role='sales'; SET ROLE authenticated;
SELECT sales_update_approved_next_step('00000000-0000-4000-8000-000000000003');
SELECT sales_update_approved_next_step('00000000-0000-4000-8000-000000000003');
DO $$ BEGIN
 IF (SELECT count(*) FROM activities)<>1 OR NOT EXISTS(SELECT 1 FROM leads WHERE next_step_type='phone' AND next_step_due_at='2026-11-05T09:00:00Z' AND next_step_note='TESZT visszahívás' AND status='new' AND company_id IS NULL AND contact_id IS NULL AND pipeline_entered_at IS NULL AND assigned_to='00000000-0000-4000-8000-000000000010') THEN RAISE EXCEPTION 'exact/duplicate/scope'; END IF;
END $$;
RESET ROLE;
SELECT 'P3/B1 baseline SQL PASS';