"""Isolated one-table issue RLS regression; never connects to hosted data."""
import subprocess
from pathlib import Path
host='/tmp/marketing-pg';port='55439';db='issue_reports_fixture'
subprocess.run(['createdb','-h',host,'-p',port,'-U','lovable',db],check=True)
base=['psql','-h',host,'-p',port,'-U','lovable','-d',db,'-qAt','-v','ON_ERROR_STOP=1','-c']
def sql(q,fail=False):
 r=subprocess.run(base+[q],capture_output=True,text=True)
 assert (r.returncode!=0 if fail else r.returncode==0),r.stderr
 return r.stdout.strip()
sql("create schema auth; create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;create function public.crm_role_of(uuid) returns text language sql as $$select current_setting('test.role',true)$$;create function public.is_owner_role(uuid) returns boolean language sql as $$select current_setting('test.role',true)='owner'$$;grant usage on schema auth to authenticated;")
sql(Path('database/issue_reports_proposal_2026-11-06.sql').read_text())
u='11111111-1111-4111-8111-111111111111';other='22222222-2222-4222-8222-222222222222';key='33333333-3333-4333-8333-333333333333'
def acting(role='marketing',who=u):return f"set role authenticated;set test.uid='{who}';set test.role='{role}';"
insert=f"insert into issue_reports(reporter_id,reporter_role,page_path,description,expected_result,actual_result,submission_key) values('{u}','owner','/today','TESZT','TESZT expected','TESZT actual','{key}');"
sql(acting()+insert)
assert sql(acting()+"select reporter_role||':'||status from issue_reports").endswith('marketing:new')
assert sql(acting(who=other)+"select count(*) from issue_reports").endswith('0')
assert sql(acting('owner',other)+"select count(*) from issue_reports").endswith('1')
sql(acting()+insert,True)
sql(acting()+"update issue_reports set status='closed'",True)
sql(acting('owner',other)+"update issue_reports set status='investigating',owner_note='TESZT observed'")
sql(acting('owner',other)+"update issue_reports set description='changed'",True)
sql("set role anon; select * from issue_reports",True)
assert sql(acting()+"select status from issue_reports").endswith('investigating')
print('PASS own/foreign/owner/status/immutable/dedup/anon RLS')
