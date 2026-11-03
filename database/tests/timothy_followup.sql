-- Run ONLY against a scratch PostgreSQL database, never production.
CREATE ROLE authenticated;
CREATE ROLE anon;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
CREATE FUNCTION crm_role_of(uuid) RETURNS text LANGUAGE sql AS $$ SELECT current_setting('test.role',true) $$;
CREATE FUNCTION is_owner_role(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT current_setting('test.role',true)='owner' $$;
CREATE TABLE leads(id uuid PRIMARY KEY,company_id uuid,contact_id uuid,status text,pipeline_entered_at timestamptz,assigned_to uuid,next_step_type text,next_step_due_at timestamptz,next_step_note text);
CREATE TABLE agent_runs(id uuid PRIMARY KEY,user_id uuid,agent_id text);
CREATE TABLE agent_run_steps(id uuid PRIMARY KEY,run_id uuid,agent_id text,tool_name text,approval_status text,approval_token uuid,input_json jsonb);
CREATE TABLE followups(id uuid PRIMARY KEY,project_id uuid,quote_id uuid,lead_id uuid,company_id uuid,followup_type text,result text,completed boolean,due_date timestamptz,created_at timestamptz,assigned_to uuid);
CREATE TABLE activities(id uuid DEFAULT gen_random_uuid() PRIMARY KEY,user_id uuid,action text,details jsonb,created_at timestamptz);
GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT SELECT ON agent_runs,agent_run_steps TO authenticated;
GRANT SELECT,UPDATE ON leads TO authenticated;
GRANT SELECT,INSERT ON followups,activities TO authenticated;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_lead ON leads FOR ALL TO authenticated USING(is_owner_role(auth.uid()) OR assigned_to=auth.uid());
ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_run ON agent_runs TO authenticated USING(user_id=auth.uid());
ALTER TABLE agent_run_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_step ON agent_run_steps TO authenticated USING(EXISTS(SELECT 1 FROM agent_runs r WHERE r.id=run_id));
\i database/timothy_followup.sql
INSERT INTO leads VALUES('00000000-0000-4000-8000-000000000001',NULL,NULL,'new',NULL,'00000000-0000-4000-8000-000000000010',NULL,NULL,NULL);
INSERT INTO agent_runs VALUES('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000010','timothy');
INSERT INTO agent_run_steps VALUES('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000002','timothy','sales_create_followup','executing',gen_random_uuid(),'{"args":{"leadId":"00000000-0000-4000-8000-000000000001","type":"call","dueAt":"2026-11-05T10:00:00+01:00","note":"TESZT","context":{"company_id":null,"contact_id":null,"assigned_to":"00000000-0000-4000-8000-000000000010","status":"new","pipeline_entered_at":null}}}');
SET test.uid='00000000-0000-4000-8000-000000000010'; SET test.role='sales'; SET ROLE authenticated;
SELECT sales_create_approved_followup('00000000-0000-4000-8000-000000000003');
SELECT sales_create_approved_followup('00000000-0000-4000-8000-000000000003');
DO $$ BEGIN
IF (SELECT count(*) FROM followups)<>1 OR (SELECT count(*) FROM activities)<>1 OR NOT EXISTS(SELECT 1 FROM followups WHERE followup_type='call' AND due_date='2026-11-05T09:00:00Z' AND completed=false AND result='TESZT') OR EXISTS(SELECT 1 FROM leads WHERE next_step_type IS NOT NULL OR next_step_due_at IS NOT NULL OR status<>'new') THEN RAISE EXCEPTION 'followup exact/scope/duplicate failure'; END IF;
END $$;
RESET ROLE;
