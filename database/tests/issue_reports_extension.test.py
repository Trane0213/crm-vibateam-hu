"""Applies proposal only to an isolated scratch database, never hosted data."""
import subprocess, uuid
from pathlib import Path
host='/tmp/marketing-pg'; port='55439'; db='issue_ext_'+uuid.uuid4().hex[:10]
subprocess.run(['createdb','-h',host,'-p',port,'-U','lovable',db],check=True)
base=['psql','-h',host,'-p',port,'-U','lovable','-d',db,'-qAt','-v','ON_ERROR_STOP=1','-c']
def sql(q,fail=False):
 r=subprocess.run(base+[q],capture_output=True,text=True)
 assert (r.returncode!=0 if fail else r.returncode==0),r.stderr
 return r.stdout.strip()
try:
 sql("create schema auth;create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;create function crm_role_of(uuid) returns text language sql as $$select current_setting('test.role',true)$$;create function is_owner_role(uuid) returns boolean language sql as $$select current_setting('test.role',true)='owner'$$;grant usage on schema auth to authenticated;")
 sql(Path('database/issue_reports_proposal_2026-11-06.sql').read_text())
 sql(Path('database/issue_reports_extension_proposal_2026-11-06.sql').read_text())
 u='11111111-1111-4111-8111-111111111111'; v='22222222-2222-4222-8222-222222222222'
 def act(role='marketing',who=u):return f"set role authenticated;set test.role='{role}';set test.uid='{who}';"
 for role,cat in zip(['marketing','sales','owner','project_manager'],['usage','bug','ux','feature']):
  sql(act(role)+f"insert into issue_reports(reporter_id,reporter_role,page_path,description,submission_key,category) values('{u}','forged','/today','TESZT','{uuid.uuid4()}','{cat}')")
 assert sql(act()+"select count(*) from issue_reports").endswith('4')
 assert sql(act(who=v)+"select count(*) from issue_reports").endswith('0')
 assert sql(act('owner',v)+"select count(*) from issue_reports").endswith('4')
 sql("set role anon;select * from issue_reports",True)
 sql(act()+f"insert into issue_reports(reporter_id,reporter_role,page_path,description,submission_key,source_kind) values('{u}','marketing','/today','TESZT','{uuid.uuid4()}','ai')",True)
 sql(act('owner')+"update issue_reports set evidence_state='confirmed',owner_note='x'",True)
 sql(act('owner')+"update issue_reports set source_kind='ai'",True)
 sql(act('owner')+"update issue_reports set likely_cause='TESZT'",True)
 sql(act('owner')+"update issue_reports set estimate_minutes=60",True)
 sql(act('owner')+"update issue_reports set category='feature'",True)
 sql(act('owner')+"update issue_reports set duplicate_of=id",True)
 sql(act('owner')+"update issue_reports set owner_note='TESZT observed code 401, isolated read',confirmed_category='bug',classification_source='human_confirmed',evidence_state='confirmed',evidence_refs='[{\"source\":\"isolated_test\",\"at\":\"2026-11-06T20:00:00Z\"}]',estimate_minutes=60,estimate_basis='TESZT human estimate'")
 assert sql(act()+"select count(*) from issue_reports where evidence_state='confirmed' and jsonb_array_length(handling_history)=1").endswith('4')
 print('PASS human-only source, AI forgery, confirmed needs evidence, history, four categories/roles, own/owner/anon, false evidence, estimate basis, immutable original, self duplicate')
finally:
 subprocess.run(['dropdb','-h',host,'-p',port,'-U','lovable',db],check=True)