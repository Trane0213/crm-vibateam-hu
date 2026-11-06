"""Scratch PostgreSQL only; no hosted writes."""
import os,subprocess,json
from pathlib import Path
h=os.environ['SCRATCH_PGHOST'];p=os.environ['SCRATCH_PGPORT'];assert h.startswith('/tmp/')
subprocess.run(['createdb','-h',h,'-p',p,'-U','lovable','gmail_source_fixture'],check=True)
base=['psql','-h',h,'-p',p,'-U','lovable','-d','gmail_source_fixture','-qAt','-v','ON_ERROR_STOP=1','-c']
def sql(q,fail=False):
 r=subprocess.run(base+[q],capture_output=True,text=True);assert (r.returncode!=0 if fail else r.returncode==0),r.stderr;return r.stdout.strip()
sql("""create schema auth;
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
create function auth.role() returns text language sql as $$select current_user::text$$;
create function public.crm_role_of(uuid) returns text language sql as $$select current_setting('test.role',true)$$;
create table users_profile(auth_user_id uuid,gmail_email text,active boolean,gmail_auth_error text);
create table activities(user_id uuid,action text,details jsonb);
create table email_campaigns(id uuid primary key,name text,target_group text,message_subject text,message_body text,created_by uuid,status text,updated_at timestamptz,prechecked_at timestamptz);
grant usage on schema auth to authenticated,service_role;
grant all on users_profile,activities,email_campaigns to service_role;
grant select,insert,update on email_campaigns to authenticated;
alter table email_campaigns enable row level security;
create policy own on email_campaigns to authenticated using(crm_role_of(auth.uid())='owner' or (crm_role_of(auth.uid())='marketing' and created_by=auth.uid()));
""")
guard=Path('database/campaign_preparation_2026-11-06.sql').read_text().split('create or replace function public.email_campaigns_guard()')[1].split('-- Privileged snapshot')[0]
sql('create or replace function public.email_campaigns_guard()'+guard)
sql('create trigger email_campaigns_guard before insert or update on email_campaigns for each row execute function email_campaigns_guard()')
sql(Path('database/campaign_gmail_source_2026-11-06.sql').read_text())
c='11111111-1111-4111-8111-111111111111';u='22222222-2222-4222-8222-222222222222'
sql(f"insert into email_campaigns(id,name,created_by,status) values('{c}','TESZT','{u}','draft');insert into users_profile values('{u}','info@vibateam.hu',true,null)")
s={'draft_id':'d','message_id':'m','mailbox':'info@vibateam.hu','read_at':'2026-11-06T17:27:00Z','imported_by':u,'sha256':'a'*64}
def act(role='marketing',db='service_role'):return f"set role {db};set test.uid='{u}';set test.role='{role}';"
def imp(role='marketing',expected=None,source=s,db='service_role',fail=False):
 rev=expected or sql(f"select updated_at from email_campaigns where id='{c}'")
 return sql(act(role,db)+f"select campaign_import_gmail_source('{c}','{u}','{rev}','TESZT','TESZT őű','<b>TESZT őű</b>','{json.dumps(source)}')",fail)
for role in ['sales','pm','']:imp(role,fail=True)
imp(db='authenticated',fail=True)
old=sql(f"select updated_at from email_campaigns where id='{c}'")
imp();assert sql('select message_html from email_campaigns')=='<b>TESZT őű</b>'
assert sql('select count(*) from activities')=='1'
imp(expected=old,fail=True)
sql(act(db='authenticated')+f"update email_campaigns set message_body='WRONG' where id='{c}'",True)
sql(act(db='authenticated')+f"update email_campaigns set message_html='WRONG' where id='{c}'",True)
sql(act(db='authenticated')+f"update email_campaigns set name='TESZT rename' where id='{c}'")
assert sql('select message_html from email_campaigns')=='<b>TESZT őű</b>'
imp(source={**s,'mailbox':'ramon.dencsi@vibateam.hu'},fail=True)
imp(source={**s,'sha256':None},fail=True)
sql("create function audit_fail() returns trigger language plpgsql as $$begin raise exception 'TESZT audit fail';end$$;create trigger audit_fail before insert on activities for each row execute function audit_fail()")
imp(fail=True);assert sql('select count(*) from activities')=='1'
sql('drop trigger audit_fail on activities')
rev=sql('select updated_at from email_campaigns')
query=act()+f"select campaign_import_gmail_source('{c}','{u}','{rev}','TESZT','TESZT őű','<b>TESZT őű</b>','{json.dumps(s)}')"
a=subprocess.Popen(base+[query],stdout=subprocess.PIPE,stderr=subprocess.PIPE);b=subprocess.Popen(base+[query],stdout=subprocess.PIPE,stderr=subprocess.PIPE);a.communicate();b.communicate();assert sorted([a.returncode,b.returncode])==[0,1]
rev=sql('select updated_at from email_campaigns')
sql(act('owner')+f"select campaign_detach_gmail_source('{c}','{u}','{rev}')")
assert sql("select (message_html is null and gmail_draft_source is null)::text from email_campaigns")=='true'
assert sql('select message_body from email_campaigns')=='TESZT őű'
print('PASS: service-only, own scope, stale/concurrent import, exact HTML, direct-edit protection, metadata preservation, bad source, atomic audit rollback, explicit detach')