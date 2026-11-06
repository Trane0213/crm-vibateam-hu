"""Isolated PostgreSQL only; the supplied socket must be under /tmp/."""
import os,subprocess,json,hashlib
from pathlib import Path
h=os.environ['SCRATCH_PGHOST'];p=os.environ['SCRATCH_PGPORT'];assert h.startswith('/tmp/')
db='delivery_fixture'
subprocess.run(['dropdb','-h',h,'-p',p,'-U','lovable','--if-exists',db],check=True)
subprocess.run(['createdb','-h',h,'-p',p,'-U','lovable','-T','campaign_fixture',db],check=True)
base=['psql','-h',h,'-p',p,'-U','lovable','-d',db,'-qAt','-v','ON_ERROR_STOP=1','-c']
def sql(q,fail=False):
 r=subprocess.run(base+[q],capture_output=True,text=True);assert (r.returncode!=0 if fail else r.returncode==0),r.stderr;return r.stdout.strip()
sql("alter table contacts add column email_invalid boolean;create table companies(id uuid primary key,marketing_blocked boolean);alter table email_campaigns add column message_html text,add column gmail_draft_source jsonb,add column target_company_ids uuid[];alter table emails add column subject text,add column body text,add column company_id uuid,add column contact_id uuid;grant all on companies to service_role;")
sql('truncate campaign_send_audit,marketing_email_suppressions;')
for file in sorted(Path('supabase/migrations').glob('2026110617*.sql')):
 if file.name.startswith(('20261106174954','20261106175026','20261106175322')):sql(file.read_text())
c='99999999-1111-4111-8111-111111111111';u='22222222-2222-4222-8222-222222222222'
def act(role='marketing',who=u,dbrole='service_role'):return f"set role {dbrole};set test.uid='{who}';set test.crm_role='{role}';set test.jwt_role='{dbrole}';"
sql(act()+f"insert into email_campaigns(id,name,created_by,message_subject,message_body,status) values('{c}','TESZT','{u}','TESZT','Body','draft');")
sql(act()+f"insert into users_profile(auth_user_id,gmail_email,active) select '{u}','info@vibateam.hu',true where not exists(select 1 from users_profile where auth_user_id='{u}');")
def revision():return sql(f"select updated_at from email_campaigns where id='{c}'")
rev=revision()
sql(act(dbrole='authenticated')+f"select campaign_save_message('{c}','{u}','{rev}','TESZT','Body','<b>Body</b>',null,null)",True)
sql(act()+f"select campaign_save_message('{c}','{u}','{rev}','TESZT','Body','<b>Body</b>','<i>Aláírás</i>','Aláírás')")
sql(act()+f"select campaign_save_message('{c}','{u}','{rev}','STALE','Body',null,null,null)",True)
snapshot={'subject':'[TESZT] TESZT','body':'Body','html':'<b>Body</b>'}
digest=hashlib.sha256(json.dumps(snapshot,separators=(',',':')).encode()).hexdigest()
at=sql("select clock_timestamp()+interval '5 minutes'")
rows=[{'recipient_email':'viktor.csotai@gmail.com','mode':'test','scheduled_at':at,'snapshot':snapshot,'snapshot_hash':digest}]
def schedule(role='marketing',who=u,fail=False):return sql(act(role,who)+f"select campaign_schedule('{c}','{who}','{revision()}','info@vibateam.hu','{json.dumps(rows)}')",fail)
schedule(role='sales',fail=True);schedule(who='55555555-5555-4555-8555-555555555555',fail=True)
schedule();item=sql(f"select id from campaign_delivery_items where campaign_id='{c}'")
sql(act()+f"update campaign_delivery_items set snapshot='{{}}' where id='{item}'",True)
sql(act(dbrole='authenticated')+"select * from campaign_delivery_items",True)
sql(act()+f"select campaign_delivery_claim('{item}','{u}','{digest}')",True)
sql(act()+f"select campaign_delivery_control('{c}','{u}','{revision()}','pause')")
sql(act()+f"select campaign_delivery_claim('{item}','{u}','{digest}')",True)
sql(act()+f"select campaign_delivery_control('{c}','{u}','{revision()}','resume')")
# Future schedule is immutable; move the fixture clock expectation with a separate due item.
c2='88888888-1111-4111-8111-111111111111'
sql(act()+f"insert into email_campaigns(id,name,created_by,message_subject,message_body,status) values('{c2}','TESZT due','{u}','TESZT','Body','draft');")
rev2=sql(f"select updated_at from email_campaigns where id='{c2}'")
sql(act()+f"insert into campaign_delivery_items(campaign_id,campaign_revision,user_id,mailbox,recipient_email,mode,scheduled_at,snapshot,snapshot_hash) values('{c2}','{rev2}','{u}','info@vibateam.hu','info@vibateam.hu','test',clock_timestamp()-interval '1 minute','{json.dumps(snapshot)}','{digest}');update email_campaigns set delivery_state='scheduled',approved_revision='{rev2}',approved_by='{u}',approved_at=now() where id='{c2}';")
i2=sql(f"select id from campaign_delivery_items where campaign_id='{c2}'")
query=act()+f"select campaign_delivery_claim('{i2}','{u}','{digest}')"
a=subprocess.Popen(base+[query],stdout=subprocess.PIPE,stderr=subprocess.PIPE);b=subprocess.Popen(base+[query],stdout=subprocess.PIPE,stderr=subprocess.PIPE);a.communicate();b.communicate();assert sorted([a.returncode,b.returncode])==[0,1]
token=sql(f"select claim_token from campaign_delivery_items where id='{i2}'")
sql(act()+f"select campaign_delivery_finish('{i2}','{u}','{token}',null,null,false)")
assert sql(f"select state from campaign_delivery_items where id='{i2}'")=='uncertain'
sql(act()+f"update campaign_delivery_items set state='pending' where id='{i2}'",True)
sql(act()+f"select campaign_delivery_control('{c}','{u}','{revision()}','stop')")
assert sql(f"select state from campaign_delivery_items where id='{item}'")=='cancelled'
sql(act()+f"select campaign_delivery_control('{c}','{u}','{revision()}','resume')",True)
assert sql("select has_function_privilege('authenticated','campaign_delivery_claim(uuid,uuid,text)','execute')::text")=='false'
# Shared quota: one uncertain delivery plus 39 legacy test attempts consumes exactly 40.
sql(act()+f"insert into campaign_send_audit(campaign_id,campaign_revision,user_id,mailbox,recipient,budapest_day) select '{c}',clock_timestamp()+i*interval '1 second','{u}','info@vibateam.hu','info@vibateam.hu',(clock_timestamp() at time zone 'Europe/Budapest')::date from generate_series(1,39) i;")
sql(act()+f"select campaign_test_claim('{c}','{u}','{revision()}','info@vibateam.hu','viktor.csotai@gmail.com')",True)
sql(act()+f"update email_campaigns set delivery_state='scheduled' where id='{c2}';insert into campaign_delivery_items(campaign_id,campaign_revision,user_id,mailbox,recipient_email,mode,scheduled_at,snapshot,snapshot_hash) values('{c2}','{rev2}','{u}','info@vibateam.hu','viktor.csotai@gmail.com','test',clock_timestamp()-interval '1 minute','{json.dumps(snapshot)}','{digest}');")
i3=sql(f"select id from campaign_delivery_items where campaign_id='{c2}' and state='pending'")
sql(act()+f"select campaign_delivery_claim('{i3}','{u}','{digest}')",True)
sql(act()+f"insert into marketing_email_suppressions(email_norm,blocked,reference,source_contact_id,changed_by) values('viktor.csotai@gmail.com',true,'TESZT friss tiltás','33333333-3333-4333-8333-333333333333','{u}');")
sql(act()+f"select campaign_delivery_claim('{i3}','{u}','{digest}')")
assert sql(f"select state from campaign_delivery_items where id='{i3}'")=='blocked'
# Content change invalidates the exact immutable approval, even when changed as a privileged fixture.
sql(act()+f"update email_campaigns set message_body='TESZT changed' where id='{c2}'")
assert sql(f"select (approved_revision is null and delivery_state is null)::text from email_campaigns where id='{c2}'")=='true'
sql("create function fixture_audit_fail() returns trigger language plpgsql as $$begin raise exception 'TESZT audit rollback';end$$;create trigger fixture_audit_fail before insert on activities for each row execute function fixture_audit_fail();")
before=sql(f"select message_body from email_campaigns where id='{c}'")
sql(act()+f"select campaign_save_message('{c}','{u}','{revision()}','TESZT','wrong',null,null,null)",True)
assert sql(f"select message_body from email_campaigns where id='{c}'")==before
print('PASS: shared schema, own role, direct access denied, stale copy, future/pause/stop, immutable snapshot, parallel single claim, uncertain no replay')