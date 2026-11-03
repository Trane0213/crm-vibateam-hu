"""Isolated PostgreSQL only; caller supplies a scratch database socket. Never production."""
import subprocess, concurrent.futures, os
base=['psql','-h',os.environ['SCRATCH_PGHOST'],'-p',os.environ['SCRATCH_PGPORT'],'-U','lovable','-d','postgres','-qAt','-v','ON_ERROR_STOP=1','-c']
u='00000000-0000-4000-8000-000000000091'; r='10000000-0000-4000-8000-000000000091'; args='{"message":{"body":"TESZT"}}'
def sql(s): return subprocess.run(base+[s],capture_output=True,text=True,check=True).stdout.strip()
sql(f"DELETE FROM agent_run_steps WHERE run_id='{r}';INSERT INTO auth.users(id) VALUES('{u}') ON CONFLICT DO NOTHING; INSERT INTO agent_runs(id,user_id,agent_id) VALUES('{r}','{u}','timothy') ON CONFLICT DO NOTHING")
n=0
def action(tool='sales_send_email',agent='timothy',approval='dangerous',expiry="clock_timestamp()+interval '30 minutes'"):
 global n
 n+=1
 return sql(f"INSERT INTO agent_run_steps(run_id,step_no,agent_id,tool_name,input_json,approval_status,approval_expires_at,approval_decided_by,approval_token) VALUES('{r}',{n},'{agent}','{tool}','{{\"args\":{args},\"approval\":\"{approval}\"}}','executing',{expiry},'{u}',gen_random_uuid()) RETURNING id")
def claim(a,role='service_role',user=u,data=args): return sql(f"SET ROLE {role};SELECT ai_os_email_dispatch_claim('{a}','{user}','{data}');").splitlines()[-1]
def blocked(label,a,**kwargs):
 try: claim(a,**kwargs)
 except subprocess.CalledProcessError: print(label,'PASS'); return
 raise AssertionError(label+' accepted')
a=action()
for role in ['anon','authenticated']: blocked('client grant '+role,a,role=role)
blocked('foreign user',a,user='00000000-0000-4000-8000-000000000092')
blocked('changed body',a,data='{"message":{"body":"CHANGED"}}')
for state in ['pending','rejected','expired','succeeded','failed','unknown']:
 b=action()
 # Scratch fixture deliberately removes lifecycle guard only inside transaction, then restores it.
 sql(f"BEGIN;ALTER TABLE agent_run_steps DISABLE TRIGGER ai_os_approval_immutable;UPDATE agent_run_steps SET approval_status='{state}' WHERE id='{b}';ALTER TABLE agent_run_steps ENABLE TRIGGER ai_os_approval_immutable;COMMIT")
 blocked(state,b)
blocked('expired executing',action(expiry="clock_timestamp()-interval '1 second'"))
blocked('wrong tool',action(tool='sales_update_next_step'))
blocked('wrong agent',action(agent='scarlet'))
blocked('missing dangerous confirmation',action(approval='confirm'))
with concurrent.futures.ThreadPoolExecutor(max_workers=12) as ex: results=list(ex.map(lambda _:claim(a),range(12)))
assert results.count('t')==1 and results.count('f')==11
assert sql(f"SELECT count(*) FROM agent_run_steps st,LATERAL jsonb_array_elements(st.approval_events) e WHERE st.id='{a}' AND e->>'state'='email_dispatch_claimed'")=='1'
assert claim(a)=='f'
print('12 parallel requests, one dispatch event, no replay PASS')
sql(f"DELETE FROM agent_run_steps WHERE run_id='{r}';DELETE FROM agent_runs WHERE id='{r}';DELETE FROM auth.users WHERE id='{u}'")
print('Isolated SQL PASS; TESZT fixtures removed; no Gmail/production requests')