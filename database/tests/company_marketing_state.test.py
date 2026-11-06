"""Run against an isolated fixture database only, never live CRM.
Usage: SCRATCH_PGHOST=... SCRATCH_PGPORT=... python3 database/tests/company_marketing_state.test.py
Requires the companies/leads/emails/users_profile/contacts fixture and proposed migration.
"""
import os, subprocess, json
base=['psql','-h',os.environ['SCRATCH_PGHOST'],'-p',os.environ['SCRATCH_PGPORT'],'-U','lovable','-d','postgres','-qAt','-v','ON_ERROR_STOP=1','-c']
def sql(query, fail=False):
 r=subprocess.run(base+[query],capture_output=True,text=True)
 if fail: assert r.returncode != 0, 'Forbidden operation succeeded'
 else: assert r.returncode == 0,r.stderr
 return r.stdout.strip()
cid='11111111-1111-4111-8111-111111111111'; uid='22222222-2222-4222-8222-222222222222'; lid='33333333-3333-4333-8333-333333333333'; eid='44444444-4444-4444-8444-444444444444'
sql(f"insert into companies(id,notes) values('{cid}','TESZT állapot'); insert into leads values('{lid}','{cid}');")
sql("alter table companies enable row level security; create policy fixture_company_access on companies for all to authenticated using (current_setting('test.visible',true) is distinct from 'no') with check (current_setting('test.visible',true) is distinct from 'no'); alter role service_role bypassrls;")
def acting(role): return f"set role authenticated; set test.uid='{uid}'; set test.role='{role}'; "
for role in ['sales','pm','project_manager','']:
 sql(acting(role)+f"update companies set marketing_status='qualified' where id='{cid}'",fail=True)
sql(f"set role authenticated; update companies set marketing_status='new' where id='{cid}'",fail=True)
for role in ['owner','marketing']:
 for status in ['new','contacted','qualified','handoff','rejected']:
  expected=sql(f"select jsonb_build_object('marketing_status',marketing_status,'marketing_status_changed_at',marketing_status_changed_at,'notes',notes) from companies where id='{cid}'")
  handoff=f"'{lid}'" if status=='handoff' else 'null'
  out=json.loads(sql(acting(role)+f"select company_set_marketing_status('{cid}','{status}','{expected}'::jsonb,{handoff})"))
  assert out['marketing_status']==status and out['notes']=='TESZT állapot'
  assert out['marketing_status_changed_by']==uid and out['marketing_status_source']=='manual'
  assert out['marketing_status_changed_at'] is not None
sql(acting('marketing')+f"update companies set marketing_status_changed_at='2000-01-01' where id='{cid}'",True)
sql(acting('marketing')+f"update companies set marketing_status_changed_by=gen_random_uuid() where id='{cid}'",True)
sql(acting('marketing')+f"update companies set marketing_status_source='gmail_sent' where id='{cid}'",True)
sql(acting('marketing')+f"select company_set_marketing_status('{cid}','new','{{}}')",True)
sql(acting('marketing')+f"update companies set marketing_status='invalid' where id='{cid}'",True)
sql(acting('marketing')+f"update companies set marketing_status='handoff',marketing_handoff_lead_id=gen_random_uuid() where id='{cid}'",True)
sql(acting('sales')+f"update companies set notes='TESZT más jegyzet' where id='{cid}'")
assert sql(f"select marketing_status from companies where id='{cid}'")=='rejected'
assert int(sql("select count(*) from activities where action='company_marketing_status'"))==10
sql(acting('marketing')+f"update companies set marketing_status='new' where id='{cid}'")
sql(f"insert into users_profile values('{uid}',true,'test@example.invalid'); insert into contacts values('{cid}','contact@example.invalid'); insert into emails values('{eid}','{uid}','{cid}','gmail-test',ARRAY['DRAFT'],true,'test@example.invalid',ARRAY['contact@example.invalid']);")
assert sql(f"set role service_role; select company_marketing_from_sent('{cid}','{eid}','{uid}')")=='f'
sql(f"update emails set gmail_label_ids=ARRAY['SENT'] where id='{eid}'")
sql(acting('marketing')+f"select company_marketing_from_sent('{cid}','{eid}','{uid}')",True)
assert sql(f"set role service_role; select company_marketing_from_sent('{cid}','{eid}','{uid}')")=='t'
assert sql(f"select marketing_status||':'||marketing_status_source from companies where id='{cid}'")=='contacted:gmail_sent'
assert sql(f"set role service_role; select company_marketing_from_sent('{cid}','{eid}','{uid}')")=='f'
expected=sql(f"select jsonb_build_object('marketing_status',marketing_status,'marketing_status_changed_at',marketing_status_changed_at,'notes',notes) from companies where id='{cid}'")
sql(acting('marketing')+f"set test.visible='no'; select company_set_marketing_status('{cid}','qualified','{expected}'::jsonb)",True)
sql("create function test_audit_failure() returns trigger language plpgsql as $$begin raise exception 'TESZT audit failure'; end$$; create trigger test_audit_failure before insert on activities for each row execute function test_audit_failure();")
sql(acting('marketing')+f"select company_set_marketing_status('{cid}','qualified','{expected}'::jsonb)",True)
assert sql(f"select marketing_status from companies where id='{cid}'")=='contacted'
sql("drop trigger test_audit_failure on activities; drop function test_audit_failure();")
for role in ['sales','pm','marketing','owner']:
 sql(acting(role)+f"update companies set notes=notes||E'\n[MKT:STATUS:rejected:2026-11-06]' where id='{cid}'",True)
sql(f"update leads set source='phone' where id='{lid}'")
expected=sql(f"select jsonb_build_object('marketing_status',marketing_status,'marketing_status_changed_at',marketing_status_changed_at,'notes',notes) from companies where id='{cid}'")
sql(acting('sales')+f"update companies set notes='TESZT concurrent note' where id='{cid}'")
sql(acting('marketing')+f"select company_set_marketing_status('{cid}','handoff','{expected}'::jsonb,'{lid}','phone')",True)
assert sql(f"select notes from companies where id='{cid}'")=='TESZT concurrent note'
expected=sql(f"select jsonb_build_object('marketing_status',marketing_status,'marketing_status_changed_at',marketing_status_changed_at,'notes',notes) from companies where id='{cid}'")
sql(acting('marketing')+f"select company_set_marketing_status('{cid}','handoff','{expected}'::jsonb,'{lid}','phone')")
assert sql(f"select notes from companies where id='{cid}'")=='TESZT concurrent note\n[MKT:LEAD_SOURCE:phone]'
print('PASS: five statuses, owner/marketing, sales/PM/no-role denial, metadata protection, stale input, handoff scope, notes independence, atomic audit and SENT/DRAFT guard')