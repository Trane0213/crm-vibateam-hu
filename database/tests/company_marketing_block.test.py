"""Isolated PostgreSQL fixture only; never points to production."""
import os, subprocess, json
from pathlib import Path

host=os.environ['SCRATCH_PGHOST']; port=os.environ['SCRATCH_PGPORT']
assert host.startswith('/tmp/'), 'Only local scratch PostgreSQL is allowed'
base=['psql','-h',host,'-p',port,'-U','lovable','-d','company_block_fixture','-qAt','-v','ON_ERROR_STOP=1','-c']
def sql(q, fail=False):
 r=subprocess.run(base+[q],capture_output=True,text=True)
 assert (r.returncode!=0 if fail else r.returncode==0),r.stderr
 return r.stdout.strip()
subprocess.run(['createdb','-h',host,'-p',port,'-U','lovable','company_block_fixture'],check=True)
sql("""
create schema auth;
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
create function public.crm_role_of(uuid) returns text language sql as $$select current_setting('test.crm_role',true)$$;
create function public.is_owner_role(uuid) returns boolean language sql as $$select current_setting('test.crm_role',true)='owner'$$;
create table companies(id uuid primary key,name text,notes text);
create table contacts(id uuid primary key,company_id uuid,email text);
create table activities(id uuid default gen_random_uuid(),user_id uuid,action text,details jsonb);
grant usage on schema auth to authenticated;
grant select,insert,update on companies to authenticated;
grant select on contacts to authenticated;
grant all on activities to authenticated;
alter table companies enable row level security;
create policy visible_company on companies to authenticated using(current_setting('test.visible',true) is distinct from 'no') with check(current_setting('test.visible',true) is distinct from 'no');
""")
sql(Path('database/company_marketing_block_2026-11-06.sql').read_text())
co='11111111-1111-4111-8111-111111111111';uid='22222222-2222-4222-8222-222222222222'
sql(f"insert into companies(id,name,notes) values('{co}','TESZT tiltás','TESZT megőrzött jegyzet')")
def act(role='marketing'):return f"set role authenticated;set test.uid='{uid}';set test.crm_role='{role}';"
def block(role='marketing', blocked=True, revision=None, reason='TESZT kézi döntés', fail=False):
 rev=f"'{revision}'" if revision else 'null'
 return sql(act(role)+f"select company_set_marketing_block('{co}',{str(blocked).lower()},'{reason}',{rev})",fail)
for role in ['sales','pm','']:
 block(role,fail=True)
sql(act()+f"update companies set marketing_blocked=true where id='{co}'",True)
sql(act()+f"insert into companies(id,name,marketing_blocked) values(gen_random_uuid(),'TESZT tiltott',true)",True)
block(reason='x',fail=True)
out=json.loads(block()); assert out['blocked'] is True and out['changed_by']==uid and out['changed_at'] and out['revision']
rev=out['revision']
sql(f"insert into contacts values(gen_random_uuid(),'{co}','teszt-new@example.invalid')")
assert sql(f"select c.marketing_blocked from contacts k join companies c on c.id=k.company_id where k.email='teszt-new@example.invalid'")=='t'
block(blocked=False,revision=rev,fail=True)
block('owner',False,revision=None,fail=True)
sql(act()+f"set test.visible='no';select company_set_marketing_block('{co}',true,'TESZT hidden','{rev}')",True)
sql("create function fail_audit() returns trigger language plpgsql as $$begin raise exception 'TESZT audit error';end$$;create trigger fail_audit before insert on activities for each row execute function fail_audit()")
block('owner',False,revision=rev,fail=True)
assert sql(f"select marketing_block_revision from companies where id='{co}'")==rev
sql('drop trigger fail_audit on activities;drop function fail_audit()')
out=json.loads(block('owner',False,revision=rev)); assert out['blocked'] is False and out['revision']!=rev
block('owner',True,revision=rev,fail=True)
assert sql(f"select notes from companies where id='{co}'")=='TESZT megőrzött jegyzet'
assert sql("select count(*) from activities where action='company_marketing_block'")=='2'
# Both callers saw the same revision: exactly one may claim the locked row.
from concurrent.futures import ThreadPoolExecutor
revision=out['revision']
query=act('owner')+f"select company_set_marketing_block('{co}',true,'TESZT párhuzamos tiltás','{revision}')"
with ThreadPoolExecutor(max_workers=2) as pool:
 results=list(pool.map(lambda _: subprocess.run(base+[query],capture_output=True,text=True).returncode,range(2)))
assert sorted(results)==[0,1], results
assert sql("select count(*) from activities where action='company_marketing_block'")=='3'
print('PASS: roles, protected columns, insert guard, reason, RLS, server metadata, new contact block, owner-only release, stale revision, concurrent single winner, atomic audit rollback, preserved notes')