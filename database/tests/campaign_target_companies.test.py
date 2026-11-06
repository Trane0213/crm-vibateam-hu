"""Only an isolated scratch fixture; target company never creates a contact."""
import os, subprocess, json
from pathlib import Path
host=os.environ['SCRATCH_PGHOST']; port=os.environ['SCRATCH_PGPORT']
assert host.startswith('/tmp/')
subprocess.run(['createdb','-h',host,'-p',port,'-U','lovable','campaign_target_fixture'],check=True)
base=['psql','-h',host,'-p',port,'-U','lovable','-d','campaign_target_fixture','-qAt','-v','ON_ERROR_STOP=1','-c']
def sql(q,fail=False):
 r=subprocess.run(base+[q],capture_output=True,text=True)
 assert (r.returncode!=0 if fail else r.returncode==0),r.stderr
 return r.stdout.strip()
sql("""create schema auth;
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
create function crm_role_of(uuid) returns text language sql as $$select current_setting('test.role',true)$$;
create table companies(id uuid primary key);
create table contacts(id uuid primary key);
create table email_campaign_recipients(id uuid primary key);
create table activities(user_id uuid,action text,details jsonb);
create table email_campaigns(id uuid primary key,created_by uuid,status text,updated_at timestamptz);
grant usage on schema auth to authenticated;
grant select,update on email_campaigns to authenticated;
grant select on companies to authenticated;
grant insert on activities to authenticated;
alter table email_campaigns enable row level security;
create policy own on email_campaigns to authenticated using(crm_role_of(auth.uid())='owner' or (crm_role_of(auth.uid())='marketing' and created_by=auth.uid()));
""")
sql(Path('database/campaign_target_companies_2026-11-06.sql').read_text())
co='11111111-1111-4111-8111-111111111111'; ca='22222222-2222-4222-8222-222222222222'; u='33333333-3333-4333-8333-333333333333'
sql(f"insert into companies values('{co}');insert into email_campaigns values('{ca}','{u}','draft','2026-11-06T17:00:00Z',null)")
def acting(role):return f"set role authenticated;set test.uid='{u}';set test.role='{role}';"
def add(role='marketing',expected='2026-11-06T17:00:00Z',fail=False):return sql(acting(role)+f"select campaign_add_target_company('{ca}','{co}','{expected}')",fail)
for role in ['sales','pm','']:add(role,fail=True)
sql(acting('marketing')+f"update email_campaigns set target_company_ids=array['{co}'::uuid] where id='{ca}'",True)
add(expected='2000-01-01',fail=True)
out=json.loads(add());assert out['already_saved'] is False
out=json.loads(add(expected='2000-01-01'));assert out['already_saved'] is True
assert sql('select cardinality(target_company_ids) from email_campaigns')=='1'
assert sql('select count(*) from contacts')=='0'
assert sql('select count(*) from email_campaign_recipients')=='0'
assert sql('select count(*) from activities')=='1'
sql(f"update email_campaigns set status='archived' where id='{ca}'")
add(fail=True)
print('PASS: contactless persistent membership, no contact/recipient creation, role/RLS, stale save, idempotency, audit, archived denial')