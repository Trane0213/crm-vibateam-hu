import os, subprocess, json
base=['psql','-h',os.environ['SCRATCH_PGHOST'],'-p',os.environ['SCRATCH_PGPORT'],'-U','lovable','-d','campaign_fixture','-qAt','-v','ON_ERROR_STOP=1','-c']
def sql(q,fail=False):
 r=subprocess.run(base+[q],capture_output=True,text=True)
 assert (r.returncode!=0 if fail else r.returncode==0),r.stderr
 return r.stdout.strip()
cid='11111111-1111-4111-8111-111111111111';uid='22222222-2222-4222-8222-222222222222';kid='33333333-3333-4333-8333-333333333333';co='44444444-4444-4444-8444-444444444444'
def act(role='marketing',user=uid):return f"set role authenticated;set test.uid='{user}';set test.crm_role='{role}';set test.jwt_role='authenticated';"
sql(f"set test.jwt_role='service_role';insert into email_campaigns(id,name,created_by) values('{cid}','TESZT','{uid}');insert into contacts values('{kid}','{co}','teszt@example.invalid')")
for role in ['sales','pm','']:
 assert sql(act(role)+f"update email_campaigns set message_body='FORBIDDEN' where id='{cid}' returning id")==''
assert sql(act('marketing','55555555-5555-4555-8555-555555555555')+f"update email_campaigns set message_body='FORBIDDEN' where id='{cid}' returning id")==''
for role in ['owner','marketing']:
 sql(act(role)+f"update email_campaigns set message_subject='TESZT tárgy',message_body='TESZT szöveg' where id='{cid}'")
 assert sql(f"select message_body from email_campaigns where id='{cid}'")=='TESZT szöveg'
old=sql(f"select updated_at from email_campaigns where id='{cid}'")
sql(act()+f"update email_campaigns set message_body='TESZT másik mentés' where id='{cid}'")
assert sql(act()+f"update email_campaigns set message_body='STALE' where id='{cid}' and updated_at='{old}' returning id")==''
sql(act()+f"update email_campaigns set prechecked_at=now() where id='{cid}'",True)
sql(f"set test.jwt_role='service_role';update email_campaigns set status='prechecked' where id='{cid}'")
sql(act()+f"update email_campaigns set message_subject='TESZT új tárgy' where id='{cid}'")
assert sql(f"select status from email_campaigns where id='{cid}'")=='draft'
row=dict(contact_id=kid,company_id=co,email_norm='teszt@example.invalid',eligibility='uncertain',reasons=['TESZT hiányos'],last_history_at=None,selected=True)
def store(rows,role='marketing',expected=None,fail=False):
 ts=expected or sql(f"select updated_at from email_campaigns where id='{cid}'")
 return sql(f"set role service_role;set test.jwt_role='service_role';set test.crm_role='{role}';select campaign_store_preparation('{cid}','{uid}','{ts}','{json.dumps(rows)}',false)",fail)
for role in ['sales','pm','']:store([row],role,fail=True)
store([row]);assert sql('select count(*) from email_campaign_recipients')=='1'
store([row],expected=old,fail=True)
store([row,row],fail=True);assert sql('select count(*) from email_campaign_recipients')=='1'
store([{**row,'email_norm':'changed@example.invalid'}],fail=True)
assert sql('select email_norm from email_campaign_recipients')=='teszt@example.invalid'
sql(act()+f"select campaign_store_preparation('{cid}','{uid}',now(),'[]',false)",True)
print('PASS: own Marketing/Owner copy readback, Sales/PM/other-owner denial, stale save, metadata, copy invalidation, atomic snapshot rollback, changed contact, service-only writer')