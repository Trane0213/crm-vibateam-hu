import os,subprocess,json,concurrent.futures
base=['psql','-h',os.environ['SCRATCH_PGHOST'],'-p',os.environ['SCRATCH_PGPORT'],'-U','lovable','-d','campaign_fixture','-qAt','-v','ON_ERROR_STOP=1','-c']
def sql(q,fail=False):
 r=subprocess.run(base+[q],capture_output=True,text=True)
 assert (r.returncode!=0 if fail else r.returncode==0),r.stderr
 return r.stdout.strip()
uid='22222222-2222-4222-8222-222222222222';contact='33333333-3333-4333-8333-333333333333'
def act(role='marketing',svc=False):return f"set role {'service_role' if svc else 'authenticated'};set test.uid='{uid}';set test.crm_role='{role}';set test.jwt_role='{'service_role' if svc else 'authenticated'}';"
sql(f"truncate campaign_send_audit,marketing_email_suppressions;insert into users_profile values('{uid}','info@vibateam.hu',true,null);update contacts set email='info@vibateam.hu' where id='{contact}'")
def suppress(blocked,role='marketing',revision=None,fail=False):
 rev='null' if revision is None else "'"+revision+"'"
 return sql(act(role)+f"select contact_set_marketing_suppression('{contact}','info@vibateam.hu',{rev},{str(blocked).lower()},'TESZT explicit evidence')",fail)
for role in ['sales','pm','']:suppress(True,role,fail=True)
r=json.loads(suppress(True));assert r['blocked'] is True
suppress(False,'marketing',r['revision'],True)
sql(f"update contacts set email='new@example.invalid' where id='{contact}'")
assert sql("select blocked from marketing_email_suppressions where email_norm='info@vibateam.hu'")=='t'
sql(f"update contacts set email='info@vibateam.hu' where id='{contact}'")
r=json.loads(suppress(False,'owner',r['revision']));assert r['blocked'] is False
suppress(True,'marketing',None,True)
sql(act()+"update marketing_email_suppressions set blocked=false",True)
def claim(cid,revision,role='marketing',recipient='info@vibateam.hu',fail=False):return sql(act(role,True)+f"select campaign_test_claim('{cid}','{uid}','{revision}','info@vibateam.hu','{recipient}')",fail)
def campaign(i):
 cid=f'10000000-0000-4000-8000-{i:012d}'
 sql(f"set test.jwt_role='service_role';insert into email_campaigns(id,name,created_by,message_subject,message_body) values('{cid}','TESZT {i}','{uid}','TESZT tárgy','TESZT body')")
 return cid,sql(f"select updated_at from email_campaigns where id='{cid}'")
cid,rev=campaign(1)
for role in ['sales','pm','']:claim(cid,rev,role,fail=True)
claim(cid,rev,recipient='customer@example.com',fail=True)
claim(cid,'2000-01-01',fail=True)
audit=claim(cid,rev);claim(cid,rev,fail=True)
sql(act()+"insert into campaign_send_audit(campaign_id) values(null)",True)
sql(act('marketing',True)+f"select campaign_test_finish('{audit}','{uid}',null,null,false)")
assert sql(f"select status from campaign_send_audit where id='{audit}'")=='uncertain'
claim(cid,rev,fail=True)
for i in range(2,40):c,v=campaign(i);claim(c,v)
assert sql('select count(*) from campaign_send_audit')=='39'
pair=[campaign(40),campaign(41)]
def race(args):
 c,v=args
 r=subprocess.run(base+[act('marketing',True)+f"select campaign_test_claim('{c}','{uid}','{v}','info@vibateam.hu','info@vibateam.hu')"],capture_output=True,text=True)
 return r.returncode==0
with concurrent.futures.ThreadPoolExecutor(2) as pool:assert sum(pool.map(race,pair))==1
assert sql('select count(*) from campaign_send_audit')=='40'
c,v=campaign(42);claim(c,v,fail=True)
assert sql("select has_function_privilege('authenticated','campaign_test_claim(uuid,uuid,timestamptz,text,text)','execute')")=='f'
print('PASS: suppression address retention/owner-only release/stale+roles, exact test allowlist, claim revision/replay, uncertain no retry, concurrent 40th succeeds/41st blocked, client metadata denied')