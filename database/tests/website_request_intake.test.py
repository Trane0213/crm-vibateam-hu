"""Disposable PostgreSQL only. Runs migration against TESZT fixtures, never the hosted DB."""
import subprocess, json, concurrent.futures
from pathlib import Path
base=['psql','-h','/tmp/intake-pg','-p','55438','-U','lovable','-d','postgres','-qAt','-v','ON_ERROR_STOP=1','-c']
def sql(q,fail=False):
 r=subprocess.run(base+[q],text=True,capture_output=True)
 assert (r.returncode!=0 if fail else r.returncode==0),r.stderr
 return r.stdout.strip()
sql("""create role service_role bypassrls;create role authenticated;create role anon;
create schema auth;create function auth.role() returns text language sql as $$select current_setting('test.role',true)$$;
create function public.crm_role_of(uuid) returns text language sql as $$select current_setting('test.actor',true)$$;
create table companies(id uuid primary key default gen_random_uuid(),name text not null,notes text);
create table contacts(id uuid primary key default gen_random_uuid(),company_id uuid references companies(id),name text not null,email text,phone text);
create table activities(id uuid primary key default gen_random_uuid(),user_id uuid,action text,details jsonb);
create table quote_requests(id uuid primary key,name text not null,company_name text,email text,phone text,message text);
grant usage on schema auth to service_role,authenticated,anon;grant execute on all functions in schema auth to service_role,authenticated,anon;
alter table quote_requests enable row level security;
""")
sql(Path('database/website_request_intake_2026-11-06.sql').read_text())
u='11111111-1111-4111-8111-111111111111'
def req(n,email=None,name=None):
 id=f'22222222-2222-4222-8222-{n:012d}'
 sql(f"insert into quote_requests values('{id}','{name or 'TESZT '+str(n)}',null,'{email or str(n)+'@example.invalid'}',null,null,null,null,null,null)")
 return id
def call(id,actor='marketing',role='service_role',fail=False):
 return sql(f"set role {role};set test.role='{role}';set test.actor='{actor}';select website_request_intake('{id}','{u}')",fail)
r=req(1)
for role in ['anon','authenticated']:call(r,role=role,fail=True)
for actor in ['sales','pm','admin','']:call(r,actor=actor,fail=True)
with concurrent.futures.ThreadPoolExecutor() as pool: results=list(pool.map(lambda _:json.loads(call(r)),range(2)))
assert results[0]==results[1]
assert json.loads(call(r))==results[0]
assert sql('select count(*) from companies')=='1' and sql('select count(*) from contacts')=='1' and sql('select count(*) from activities')=='1'
for table in ['contacts','activities','quote_requests']:
 r2=req({'contacts':2,'activities':3,'quote_requests':4}[table]);before=sql('select count(*) from companies')
 sql(f"create function fail_fixture() returns trigger language plpgsql as $$begin raise exception 'TESZT fail';end$$;create trigger fail_fixture before {'update' if table=='quote_requests' else 'insert'} on {table} for each row execute function fail_fixture()")
 call(r2,fail=True)
 assert sql('select count(*) from companies')==before
 assert sql(f"select intake_company_id is null from quote_requests where id='{r2}'")=='t'
 sql(f'drop trigger fail_fixture on {table};drop function fail_fixture()')
a=req(5,'same@example.invalid');b=req(6,'same@example.invalid')
with concurrent.futures.ThreadPoolExecutor() as pool: out=list(pool.map(lambda id:json.loads(call(id)),[a,b]))
assert sorted(x['kind'] for x in out)==['existing','saved']
assert out[0]['company_id']==out[1]['company_id']
r3=req(7);sql(f"insert into companies(name,notes) values('TESZT partial','Weboldali ajánlatkérésből: {r3}')")
assert json.loads(call(r3))['kind']=='ambiguous'
assert sql(f"select intake_company_id is null from quote_requests where id='{r3}'")=='t'
assert sql("select has_function_privilege('authenticated','website_request_intake(uuid,uuid)','execute')")=='f'
assert sql("select relrowsecurity from pg_class where relname='quote_requests'")=='t'
print('PASS: roles, exact replay, concurrent same/different request, atomic contact/audit/receipt rollback, legacy no repair, RLS/no client execute')