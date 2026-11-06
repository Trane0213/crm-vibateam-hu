import os, subprocess, json
base=['psql','-h',os.environ['SCRATCH_PGHOST'],'-p',os.environ['SCRATCH_PGPORT'],'-U','lovable','-d',os.environ.get('SCRATCH_PGDATABASE','contact_fixture'),'-qAt','-v','ON_ERROR_STOP=1','-c']
def sql(q,fail=False):
 r=subprocess.run(base+[q],capture_output=True,text=True)
 assert (r.returncode!=0 if fail else r.returncode==0),r.stderr
 return r.stdout.strip()
cid='11111111-1111-4111-8111-111111111111';uid='22222222-2222-4222-8222-222222222222'
def acting(role): return f"set role authenticated;set test.uid='{uid}';set test.role='{role}';"
def save(role,kind,source,state,ref=None,expected=None,fail=False):
 expected=expected or sql(f"select to_jsonb(c) from contacts c where id='{cid}'")
 reference='null' if ref is None else "'"+ref+"'"
 return sql(acting(role)+f"select contact_set_provenance('{cid}','{expected}'::jsonb,'{kind}','{source}','{state}',{reference})",fail)
sql(f"insert into contacts(id,name,email) values('{cid}','TESZT','test@example.invalid')")
for role in ['sales','pm','project_manager','']:
 save(role,'person','manual','unverified',fail=True)
for role in ['owner','marketing']:
 for kind in ['person','shared_mailbox','unknown']:
  data=json.loads(save(role,kind,'manual','unverified'));assert data['contact_kind']==kind and data['verified_at'] is None
save('marketing','person','email_inferred','human_verified',fail=True)
save('marketing','unknown','direct_confirmation','human_verified','TESZT confirmation',fail=True)
save('marketing','person','email_inferred','human_verified','TESZT human checked')
assert sql(f"select verified_by from contacts where id='{cid}'")==uid
for col in ['name','email','company_id']:
 save('marketing','person','direct_confirmation','human_verified','TESZT checked')
 value="gen_random_uuid()" if col=='company_id' else "'TESZT changed'"
 sql(acting('sales')+f"update contacts set {col}={value} where id='{cid}'")
 assert sql(f"select verification_state from contacts where id='{cid}'")=='unverified'
save('marketing','person','direct_confirmation','human_verified','TESZT checked')
sql(acting('pm')+f"update contacts set phone='123',position='TESZT' where id='{cid}'")
assert sql(f"select verification_state from contacts where id='{cid}'")=='human_verified'
sql(acting('marketing')+f"update contacts set verified_at='2000-01-01' where id='{cid}'",True)
sql(acting('marketing')+f"update contacts set verified_by=gen_random_uuid() where id='{cid}'",True)
old=sql(f"select to_jsonb(c) from contacts c where id='{cid}'")
sql(acting('sales')+f"update contacts set name='TESZT concurrent' where id='{cid}'")
save('marketing','person','manual','unverified',expected=old,fail=True)
sql("create function fixture_audit_fail() returns trigger language plpgsql as $$begin raise exception 'TESZT audit';end$$;create trigger fixture_audit_fail before insert on activities for each row execute function fixture_audit_fail();")
save('marketing','person','direct_confirmation','human_verified','TESZT checked',fail=True)
assert sql(f"select verification_state from contacts where id='{cid}'")=='unverified'
sql("drop trigger fixture_audit_fail on activities;drop function fixture_audit_fail();")
print('PASS: roles, kind/source, explicit human evidence, identity invalidation, phone/position, metadata, concurrent edit, atomic audit')