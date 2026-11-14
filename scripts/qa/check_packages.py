import asyncio,json,base64,re,sys,urllib.parse
from pathlib import Path
from playwright.async_api import async_playwright
OUT=Path('/tmp/browser/packages/shots'); OUT.mkdir(parents=True, exist_ok=True)
# Izolált TESZT-próba (P1 tervcsomagok: valódi böngészős feltöltőmotor, szimulált szerver és tárhely): kitalált TESZT-sorok, minden írás 403-mal blokkolva,
# a szerepkör a TESZT-profilból jön; nem éles munkamenet és nem valódi RLS.
import urllib.request
_src=urllib.request.urlopen('http://localhost:8080/src/components/today/pm-home.tsx').read().decode()
_rt=urllib.request.urlopen('http://localhost:8080/src/router.tsx').read().decode()
def _u(pat,src): return re.search(r'"((?:/@fs/[^"]*)?/node_modules/[^"]*'+pat+r'[^"]*)"',src).group(1)
REACT=_u(r'\.vite/deps/react\.js',_src); RQ=_u('tanstack_react-query',_rt); RR=_u('react-router/dist/esm/index.dev.js',_rt)
RDC=REACT.replace('react.js','react-dom_client.js')
ROLE=sys.argv[1] if len(sys.argv)>1 else 'project_manager'
P2='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'; P3='dddddddd-dddd-4ddd-8ddd-dddddddddddd'
L1='11111111-1111-4111-8111-111111111111'; L2='22222222-2222-4222-8222-222222222222'
UID={'owner':'TESZT-owner','project_manager':'TESZT-pm','sales':'TESZT-sales','marketing':'TESZT-mkt'}[ROLE]
DB={
 'projects':[
  {'id':P2,'title':'TESZT Lépcsőház felújítás','status':'atadas','company_id':'cccccccc-cccc-4ccc-8ccc-cccccccccccc','lead_id':L2,'address':None,'deadline':None,'start_date':'2026-11-10','project_manager_user_id':'TESZT-pm','created_at':'2026-11-10T09:00:00Z','project_type':None,'description':None,
   'handoff_payload':{'source':'web','summary':'TESZT: lépcsőház festés és burkolat, 4 emelet, ügyfél tavaszi kezdést kér','notes':'','project_manager_user_id':'TESZT-pm','created_via':'sales_mark_won_with_project'},'handoff_at':'2026-11-10T09:00:00Z'},
  {'id':P3,'title':'TESZT Belső karbantartás','status':'kivitelezes','company_id':None,'lead_id':None,'address':'TESZT telephely','deadline':'2026-12-20','start_date':None,'project_manager_user_id':'TESZT-pm','created_at':'2026-11-01T09:00:00Z','handoff_payload':None,'handoff_at':None},
 ],
 'leads':[
  {'id':L1,'status':'contract','summary':'TESZT szerződés előtt álló ügy, 3 lakás','company_id':'cccccccc-cccc-4ccc-8ccc-cccccccccccc','contact_id':'TESZT-contact','assigned_to':'TESZT-sales','next_step_type':'phone','next_step_due_at':'2026-11-20T09:00:00Z','next_step_note':None,'pipeline_entered_at':'2026-11-01T00:00:00Z','created_at':'2026-11-01T00:00:00Z','source':'web','won_at':None,'updated_at':'2026-11-13T00:00:00Z'},
  {'id':L2,'status':'won','summary':'TESZT: lépcsőház festés és burkolat','company_id':'cccccccc-cccc-4ccc-8ccc-cccccccccccc','contact_id':None,'assigned_to':'TESZT-sales','next_step_type':None,'next_step_due_at':None,'next_step_note':None,'pipeline_entered_at':'2026-10-20T00:00:00Z','created_at':'2026-10-01T00:00:00Z','source':'web','won_at':'2026-11-10T09:00:00Z','updated_at':'2026-11-10T09:00:00Z'},
 ],
 'quotes':[{'id':'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1','lead_id':L2,'project_id':P2,'title':'TESZT ajánlat','status':'accepted','valid_until':'2026-11-01','site_address':None,'template_terms':{'payment':'TESZT 30 nap'},'tax_percent':27,'is_current':True,'version':1,'alternative_key':'A','total_amount':1200000,'created_at':'2026-11-01T00:00:00Z','sent_at':'2026-11-02T00:00:00Z','manual_net_amount':None},
            {'id':'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2','lead_id':L1,'project_id':None,'title':'TESZT ajánlat L1','status':'accepted','quote_kind':'viba_offer','discount_percent':0,'notes':None,'valid_until':'2026-12-31','site_address':'TESZT utca 5.','template_terms':None,'tax_percent':27,'is_current':True,'version':1,'alternative_key':'A','total_amount':900000,'created_at':'2026-11-01T00:00:00Z','sent_at':'2026-11-02T00:00:00Z','manual_net_amount':None}],
 'project_contacts':[], 'project_documents':[{'id':'pd-2','project_id':P2,'name':'TESZT lépcsőház fotó 1.jpg','file_url':'projects/TESZT/foto1.jpg','document_type':'photo','created_at':'2026-11-12T09:00:00Z','uploaded_by':'TESZT-pm-profile'},{'id':'pd-3','project_id':None,'name':'TESZT projekt nélküli ármunka.xlsx','file_url':'global/TESZT/arm.xlsx','document_type':'other','created_at':'2026-11-09T09:00:00Z','uploaded_by':'TESZT-owner-profile'},{'id':'pd-1','project_id':P2,'name':'TESZT szerzodes alairt.pdf','file_url':'projects/TESZT/szerzodes.pdf','document_type':'contract','created_at':'2026-11-11T09:00:00Z','uploaded_by':'TESZT-sales'}], 'tasks':[], 'project_notes':[], 'followups':[], 'phone_calls':[], 'meetings':[], 'email_threads':[], 'lead_status_history':[], 'company_documents':[{'id':'cd-1','company_id':'cccccccc-cccc-4ccc-8ccc-cccccccccccc','name':'TESZT társasház bemutató.pdf','file_url':'company-documents/TESZT/bem.pdf','document_type':'marketing','created_at':'2026-10-05T09:00:00Z','uploaded_by':'TESZT-mkt-profile','size_bytes':245000,'source':'manual'},{'id':'cd-2','company_id':'cccccccc-cccc-4ccc-8ccc-cccccccccccc','name':'TESZT alaprajz Árazott.pdf','file_url':'quotes/TESZT/arazott.xlsx','document_type':'technical','created_at':'2026-10-06T09:00:00Z','uploaded_by':'TESZT-sales-profile','size_bytes':None,'source':'manual'}],'quote_documents':[{'id':'qd-2','quote_id':'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1','name':'TESZT árazott költségvetés.xlsx','file_url':'quotes/TESZT/arazott.xlsx','document_type':'priced_budget','created_at':'2026-11-03T09:00:00Z','uploaded_by':'TESZT-sales-profile'},{'id':'qd-1','quote_id':'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2','name':'TESZT feltetelek.pdf','file_url':'quotes/TESZT/feltetelek.pdf','document_type':'contract_terms','created_at':'2026-11-05T09:00:00Z'}],
 'ai_chat_uploads':[
  {'id':'u-s1','folder':'sales','name':'TESZT sales fotó.jpg','file_url':'ai-chat-uploads/sales/TESZT-sales/1-a.jpg','mime_type':'image/jpeg','size_bytes':120000,'uploaded_by':'TESZT-sales','uploader_name':'TESZT Értékesítő','link_table':None,'created_at':'2026-11-14T10:00:00Z'},
  {'id':'u-m1','folder':'marketing','name':'TESZT plakát.png','file_url':'ai-chat-uploads/marketing/TESZT-mkt/1-b.png','mime_type':'image/png','size_bytes':80000,'uploaded_by':'TESZT-mkt','uploader_name':'TESZT Marketing','link_table':None,'created_at':'2026-11-14T09:00:00Z'},
  {'id':'u-p1','folder':'pm','name':'TESZT TIG szkennelt.pdf','file_url':'ai-chat-uploads/pm/TESZT-pm/1-c.pdf','mime_type':'application/pdf','size_bytes':168000,'uploaded_by':'TESZT-pm','uploader_name':'TESZT Projektvezető','link_table':'project_documents','created_at':'2026-11-14T08:00:00Z'},
  {'id':'u-o1','folder':'owner','name':'TESZT tulajdonosi jegyzet.jpg','file_url':'ai-chat-uploads/owner/TESZT-owner/1-d.jpg','mime_type':'image/jpeg','size_bytes':50000,'uploaded_by':'TESZT-owner','uploader_name':'TESZT Tulajdonos','link_table':None,'created_at':'2026-11-14T07:00:00Z'}],
 'contacts':[{'id':'TESZT-contact','company_id':'cccccccc-cccc-4ccc-8ccc-cccccccccccc','name':'TESZT Kapcsolat','email':None,'email_invalid':False}],
 'companies':[{'id':'cccccccc-cccc-4ccc-8ccc-cccccccccccc','name':'TESZT Társasház','company_type':'tarsashaz','tax_number':None}],
 'users_profile_lookup':[{'id':'TESZT-pm-profile','auth_user_id':'TESZT-pm','full_name':'TESZT Projektvezető'},{'id':'TESZT-sales-profile','auth_user_id':'TESZT-sales','full_name':'TESZT Értékesítő'},{'id':'TESZT-owner-profile','auth_user_id':'TESZT-owner','full_name':'TESZT Tulajdonos'}],
}
def filt(table,qs):
 rows=list(DB.get(table,[]))
 for k,vs in qs.items():
  if k in ('select','order','limit','offset','or','and'): continue
  v=vs[0]
  if v.startswith('eq.'): rows=[r for r in rows if str(r.get(k)).lower()==v[3:].lower() or (r.get(k) is True and v[3:]=='true')]
  elif v.startswith('in.('): allowed=v[4:-1].replace('"','').split(','); rows=[r for r in rows if str(r.get(k)) in allowed]
  elif v=='is.null': rows=[r for r in rows if r.get(k) is None]
 return rows

import hashlib, os, time
PKG_DIR=sys.argv[2] if len(sys.argv)>2 else '/tmp/p1/pkg'
MODE=sys.argv[3] if len(sys.argv)>3 else 'ui'
STATE_F='/tmp/browser/packages/state.json'
def load_state():
 return json.load(open(STATE_F)) if os.path.exists(STATE_F) else {'files':{},'puts':0,'put_bytes':0,'md5_mismatch':0,'sha_mismatch':0}
ST=load_state()
def save_state(): json.dump(ST,open(STATE_F,'w'))
PKG_ID='99999999-0000-4000-8000-000000000001'
def fn_name(url):
 try: return json.loads(base64.urlsafe_b64decode(url.split('/_serverFn/')[1].split('?')[0]+'===')).get('export','')
 except Exception: return 'unknown'
def strings(body):
 # A seroval-kódolt kérésből a szöveg- és számértékek kinyerése sorrendben.
 try: j=json.loads(body)
 except Exception: return []
 out=[]
 def walk(n):
  if isinstance(n,dict):
   if n.get('t')==1 and 's' in n: out.append(('s',n['s']))
   elif n.get('t')==0 and 's' in n: out.append(('n',n['s']))
   for v in n.values(): walk(v)
  elif isinstance(n,list):
   for v in n: walk(v)
 walk(j); return out
LOCAL={}
for d,_,fs in os.walk(PKG_DIR):
 for f in fs:
  p=os.path.join(d,f); rel=os.path.relpath(p,PKG_DIR).replace(os.sep,'/')
  LOCAL[rel]=p
def sha_local(rel):
 h=hashlib.sha256()
 with open(LOCAL[rel],'rb') as fh:
  for ch in iter(lambda: fh.read(8<<20), b''): h.update(ch)
 return h.hexdigest()
PART=16<<20
def plan(size): return (PART, max(1,-(-size//PART)))
def summary_pkgs():
 files=list(ST['files'].values())
 base=[{'id':'99999999-0000-4000-8000-0000000000a1','parentKind':'project','parentId':P2,'parentTitle':'TESZT Lépcsőház felújítás','title':'TESZT Kiviteli terv – 1. revízió','source':'folder','createdAt':'2026-11-12T09:00:00Z','createdBy':'TESZT-pm','mine':UID=='TESZT-pm','fileCount':4,'verified':3,'open':0,'failed':1,'duplicates':0,'bytes':412000000}]
 if files:
  base.insert(0,{'id':PKG_ID,'parentKind':'project','parentId':P2,'parentTitle':'TESZT Lépcsőház felújítás','title':'TESZT próbacsomag 530 MB','source':'folder','createdAt':'2026-11-14T18:00:00Z','createdBy':UID,'mine':True,
   'fileCount':len(files),'verified':sum(f['status']=='verified' for f in files),'open':sum(f['status']=='uploading' for f in files),'failed':0,'duplicates':sum(f['status']=='duplicate' for f in files),'bytes':sum(f['size'] for f in files if f['status']=='verified')})
 return base
DEMO_FILES=[
 {'id':'f-1','relativePath':'Kiviteli terv/E-Erősáram/E-01 alaprajz.pdf','name':'E-01 alaprajz.pdf','size':300000000,'kind':'pdf','status':'verified','processingStatus':'waiting','errorCode':None,'revisionNo':1,'revisionOf':None,'duplicateOf':None,'openKey':'document-packages/project/x/y/f-1/original/E-01.pdf','mine':True,'createdAt':'2026-11-12T09:00:00Z','partCount':18},
 {'id':'f-2','relativePath':'Kiviteli terv/E-Erősáram/E-01 alaprajz.pdf','name':'E-01 alaprajz.pdf','size':301000000,'kind':'pdf','status':'verified','processingStatus':'waiting','errorCode':None,'revisionNo':2,'revisionOf':'f-1','duplicateOf':None,'openKey':'document-packages/project/x/y/f-2/original/E-01.pdf','mine':True,'createdAt':'2026-11-13T09:00:00Z','partCount':18},
 {'id':'f-3','relativePath':'CAD/E-01.dwg','name':'E-01.dwg','size':25000000,'kind':'cad','status':'verified','processingStatus':'not_supported','errorCode':None,'revisionNo':1,'revisionOf':None,'duplicateOf':None,'openKey':'document-packages/project/x/y/f-3/original/E-01.dwg','mine':True,'createdAt':'2026-11-12T09:00:00Z','partCount':2},
 {'id':'f-4','relativePath':'Költségvetés/Árazatlan.xlsx','name':'Árazatlan.xlsx','size':8000000,'kind':'spreadsheet','status':'failed','processingStatus':'waiting','errorCode':'integrity','revisionNo':1,'revisionOf':None,'duplicateOf':None,'openKey':None,'mine':True,'createdAt':'2026-11-12T09:00:00Z','partCount':1},
]
async def handle_fn(route, req, log):
 name=fn_name(req.url); body=req.post_data or ''; print('FN',repr(name),req.url.split('/_serverFn/')[1][:80])
 ok=lambda o: route.fulfill(status=200,content_type='application/json',body=json.dumps({'result':o,'context':{}}))
 if 'listDocumentPackages' in name:
  if MODE=='notready': return await ok({'available':False,'packages':[]})
  return await ok({'available':True,'packages':summary_pkgs()})
 if 'listPackageFiles' in name: return await ok({'files':DEMO_FILES})
 if 'packageLimits' in name: return await ok({'maxFileBytes':1<<30,'maxParentBytes':5<<30,'maxFilesPerPackage':5000})
 if 'createDocumentPackage' in name: log.append('createPackage'); return await ok({'packageId':PKG_ID})
 if 'registerPackageFiles' in name:
  vals=strings(body); out=[]
  # sorrend fájlonként: relativePath, size, lastModified, mime?, sha256
  i=0; recs=[]
  ss=[v for v in vals]
  # a relatív utak a LOCAL kulcsai között vannak; a SHA a 64 hosszú hex
  paths=[v for t,v in ss if t=='s' and v in LOCAL]
  shas=[v for t,v in ss if t=='s' and isinstance(v,str) and re.fullmatch(r'[0-9a-f]{64}',v)]
  for rel,sha in zip(paths,shas):
   size=os.path.getsize(LOCAL[rel])
   good=sha==sha_local(rel)
   if not good: ST['sha_mismatch']+=1
   f=ST['files'].get(rel)
   if f and f['status']=='verified': out.append({'relativePath':rel,'action':'verified','fileId':f['id']}); continue
   if f and f['status']=='duplicate': out.append({'relativePath':rel,'action':'duplicate','fileId':f['id'],'ofPath':f['of']}); continue
   if f: out.append({'relativePath':rel,'action':'resume','fileId':f['id'],'partSize':PART,'partCount':f['parts'],'doneParts':sorted(int(k) for k in f['md5'].keys() if f['md5'][k]==f['etag'].get(k))}); log.append(f"RESUME {rel} {len([k for k in f['md5'] if f['md5'][k]==f['etag'].get(k)])}/{f['parts']}"); continue
   dup=next((x for x in ST['files'].values() if x['sha']==sha and x['status']!='duplicate'),None)
   fid=f"pf-{len(ST['files'])+1:04d}-{hashlib.md5(rel.encode()).hexdigest()[:8]}"
   if dup:
    ST['files'][rel]={'id':fid,'sha':sha,'size':size,'status':'duplicate','of':dup['rel'],'rel':rel,'parts':0,'md5':{},'etag':{}}
    out.append({'relativePath':rel,'action':'duplicate','fileId':fid,'ofPath':dup['rel']}); continue
   ps,pc=plan(size)
   ST['files'][rel]={'id':fid,'sha':sha,'size':size,'status':'uploading','rel':rel,'parts':pc,'md5':{},'etag':{}}
   out.append({'relativePath':rel,'action':'upload','fileId':fid,'partSize':ps,'partCount':pc,'doneParts':[]})
  save_state(); return await ok(out)
 if 'signPackageParts' in name:
  vals=strings(body); fid=next(v for t,v in vals if t=='s' and v.startswith('pf-')); nums=[int(v) for t,v in vals if t=='n']
  return await ok([{'partNumber':n,'url':f'https://r2-teszt.invalid/{fid}/{n}'} for n in nums])
 if 'recordPackageParts' in name:
  vals=strings(body); fid=next(v for t,v in vals if t=='s' and v.startswith('pf-')); nums=[v for t,v in vals if t=='n']; md5s=[v for t,v in vals if t=='s' and re.fullmatch(r'[0-9a-f]{32}',v)]
  f=next(x for x in ST['files'].values() if x['id']==fid)
  f['md5'][str(int(nums[0]))]=md5s[0]; save_state(); return await ok({'ok':True,'recorded':1})
 if 'completePackageFile' in name:
  vals=strings(body); fid=next(v for t,v in vals if t=='s' and v.startswith('pf-'))
  f=next(x for x in ST['files'].values() if x['id']==fid)
  bad=[n for n in range(1,f['parts']+1) if f['md5'].get(str(n)) is None or f['md5'].get(str(n))!=f['etag'].get(str(n))]
  if bad: return await ok({'ok':False,'badParts':bad})
  f['status']='verified'; save_state(); return await ok({'ok':True})
 log.append('unhandled fn '+name)
 return await route.fulfill(status=503,content_type='text/plain',body='Isolated test: unavailable')

async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True)
  ctx=await browser.new_context(viewport={'width':1280,'height':1800}, user_agent=None if MODE!='mobile' else 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1')
  page=await ctx.new_page()
  errors=[]; page.on('pageerror',lambda e:errors.append(str(e)[:300])); page.on('console',lambda m: print('CONSOLE',m.type,m.text[:300]) if m.type in ('error','warning') else None)
  writes=[]; log=[]
  await page.goto('http://localhost:8080/auth',wait_until='networkidle')
  async def intercept(route):
   req=route.request;url=req.url
   if url.startswith('https://r2-teszt.invalid/'):
    _,_,_,fid,n=url.split('/')[:5]
    data=req.post_data_buffer or b''
    f=next(x for x in ST['files'].values() if x['id']==fid)
    f['etag'][n]=hashlib.md5(data).hexdigest(); ST['puts']+=1; ST['put_bytes']+=len(data); save_state()
    return await route.fulfill(status=200,headers={'access-control-allow-origin':'*'},body='')
   if '/_serverFn/' in url:
    try: return await handle_fn(route, req, log)
    except Exception as e:
     import traceback; print('HANDLE_FN_ERR', traceback.format_exc()[-600:]); return await route.fulfill(status=500,body='x')
   if '/rest/v1/' in url:
    path=url.split('/rest/v1/')[1]; table=path.split('?')[0]
    if '/rpc/' in url or table.startswith('rpc/'):
     fn=table.split('rpc/')[-1]
     if fn in ('sales_mark_won_with_project','quote_create_draft'): writes.append('RPC '+fn); return await route.fulfill(status=403,content_type='application/json',body=json.dumps({'message':'Isolated test: writes blocked'}))
     return await route.fulfill(status=200,content_type='application/json',body=json.dumps([] if fn!='is_owner_role' else ROLE=='owner'))
    if req.method in ['POST','PATCH','PUT','DELETE']:
     writes.append(req.method+' '+path[:70]+' body='+(req.post_data or '')[:120]); return await route.fulfill(status=403,content_type='application/json',body=json.dumps({'message':'Isolated test: writes blocked','code':'42501'}))
    qs=urllib.parse.parse_qs(urllib.parse.urlsplit(url).query)
    single='application/vnd.pgrst.object' in req.headers.get('accept','')
    if table=='users_profile': body=[{'id':UID+'-profile','auth_user_id':UID,'full_name':'TESZT '+ROLE,'email':'test@example.invalid','role_id':'TESZT-role','roles':{'name':ROLE}}]
    elif table=='agent_role_access': body=[{'agent_id':a,'can_view':True} for a in ['crm','sales','pm','marketing']]
    else: body=filt(table,qs)
    if single: body=body[0] if body else None
    hdr={'content-range':f'0-{max(len(body)-1,0) if isinstance(body,list) else 0}/{len(body) if isinstance(body,list) else (1 if body else 0)}','access-control-expose-headers':'content-range','access-control-allow-origin':'*'}
    if req.method=='HEAD': return await route.fulfill(status=200,headers=hdr,body='')
    return await route.fulfill(status=200,content_type='application/json',headers=hdr,body=json.dumps(body))
   if 'supabase.co' in url: return await route.fulfill(status=403,body='blocked')
   await route.continue_()
  await page.route('**/*',intercept)
  await page.route('**/isolated-check',lambda route:route.fulfill(content_type='text/html',body='<html><head></head><body></body></html>'))
  await page.goto('http://localhost:8080/isolated-check',wait_until='domcontentloaded')
  await page.evaluate(f'''async()=>{{
   const RefreshRuntime=(await import('/@react-refresh')).default;RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{{}};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;
   const R=(await import('{REACT}')).default; const D=(await import('{RDC}')).default;
   const {{Outlet,RouterProvider}}=await import('{RR}');
   const {{supabase}}=await import('/src/integrations/supabase/client.ts');
   const session={{access_token:'TESZT.not-a-real.token',user:{{id:'{UID}',email:'test@example.invalid'}}}};
   supabase.auth.getSession=async()=>({{data:{{session}},error:null}});supabase.auth.getUser=async()=>({{data:{{user:session.user}},error:null}});supabase.auth.onAuthStateChange=()=>({{data:{{subscription:{{unsubscribe(){{}}}}}}}});
   supabase.channel=()=>({{on(){{return this}},subscribe(){{return this}},unsubscribe(){{}}}});supabase.removeChannel=()=>{{}};
   const {{getRouter}}=await import('/src/router.tsx');const {{QueryClientProvider}}=await import('{RQ}');
   window.history.replaceState(null,'','/today');window.testRouter=getRouter();window.testRouter.routeTree.options.shellComponent=undefined;window.testRouter.routeTree.options.component=()=>R.createElement(QueryClientProvider,{{client:window.testRouter.options.context.queryClient}},R.createElement(Outlet));
   const link=document.createElement('link');link.rel='stylesheet';link.href='/src/styles.css';document.head.appendChild(link);
   window.testRouter.options.context.queryClient.setDefaultOptions({{queries:{{retry:false}}}});
   const host=document.createElement('div');document.body.replaceChildren(host);
   D.createRoot(host).render(R.createElement(RouterProvider,{{router:window.testRouter}}));
   window.goTest=async(path)=>{{await window.testRouter.navigate({{href:path}});}};
  }}''')
  await page.wait_for_timeout(2500)
  go=lambda path: page.evaluate('(p)=>window.goTest(p)',path)
  ovf=lambda: page.evaluate('document.documentElement.scrollWidth>innerWidth')
  panel=page.get_by_role('region',name=re.compile('Tervcsomagok'))
  if MODE in ('ui','mobile','notready'):
   if MODE=='mobile': await page.set_viewport_size({'width':390,'height':844})
   await go(f'/projects/{P2}?tab=docs'); await page.wait_for_timeout(2500)
   tab=page.get_by_role('tab',name=re.compile('Dokumentumok'))
   if await tab.count(): await tab.first.click(); await page.wait_for_timeout(1500)
   print(ROLE,MODE,'panel',await panel.count(),'| upload btn',await page.get_by_role('button',name='Új dokumentáció feltöltése').count(),'| overflow',await ovf())
   print('PANEL TEXT',(await panel.first.inner_text())[:400].replace('\n',' | '))
   if MODE!='notready':
    await page.get_by_role('button',name=re.compile('TESZT Kiviteli terv')).click(); await page.wait_for_timeout(1500)
    print(ROLE,MODE,'folders',await panel.locator('p:has(svg.lucide-folder-open)').all_inner_texts(),'| open btns',await panel.get_by_role('button',name='Megnyitás').count(),'| rev2 shown',await panel.get_by_text('(2. változat)').count(),'| CAD note',await panel.get_by_text('csak tárolva').count())
    await panel.get_by_role('button',name=re.compile('Hibák')).click(); await page.wait_for_timeout(500)
    print(ROLE,MODE,'problems list',await panel.locator('li span.block.truncate').all_inner_texts())
    await panel.get_by_role('button',name=re.compile('Hibák')).click()
   await panel.screenshot(path=str(OUT/f'{ROLE}-{MODE}-panel.png'))
   if await page.get_by_role('button',name='Új dokumentáció feltöltése').count():
    await page.get_by_role('button',name='Új dokumentáció feltöltése').click(); await page.wait_for_timeout(800)
    dlg=page.get_by_role('dialog')
    print(ROLE,MODE,'dialog buttons',[b for b in await dlg.get_by_role('button').all_inner_texts() if b.strip()],'| overflow',await ovf())
    await page.screenshot(path=str(OUT/f'{ROLE}-{MODE}-dialog.png'))
    await page.keyboard.press('Escape')
   for path,label in [(f'/quotes/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2','quote'),('/documents?nezet=csomagok','documents')]:
    await go(path); await page.wait_for_timeout(2500)
    print(ROLE,MODE,label,'panel',await panel.count(),'| upload btn',await page.get_by_role('button',name='Új dokumentáció feltöltése').count(),'| parent links',await page.get_by_role('link',name=re.compile('^Projekt:')).count(),'| overflow',await ovf())
    await page.screenshot(path=str(OUT/f'{ROLE}-{MODE}-{label}.png'))
  if MODE in ('upload','resume'):
   await go(f'/projects/{P2}'); await page.wait_for_timeout(2000)
   await page.get_by_role('tab',name=re.compile('Dokumentumok')).first.click(); await page.wait_for_timeout(1500)
   if MODE=='upload': await page.get_by_role('button',name='Új dokumentáció feltöltése').click()
   else: await panel.get_by_role('button',name='Feltöltés folytatása').first.click()
   await page.wait_for_timeout(800)
   dlg=page.get_by_role('dialog')
   t0=time.time()
   await dlg.locator('input[type=file]').nth(1).set_input_files(PKG_DIR)
   await page.wait_for_timeout(1500)
   print(ROLE,MODE,'selected',(await dlg.locator('div.rounded-md.border.p-3').first.inner_text()).replace('\n',' | ')[:200])
   await page.screenshot(path=str(OUT/f'{ROLE}-{MODE}-selected.png'))
   await dlg.get_by_role('button',name='Feltöltés indítása').click()
   if MODE=='upload':
    total=sum(os.path.getsize(v) for k,v in LOCAL.items() if not k.endswith('.DS_Store'))
    while time.time()-t0<500:
     await page.wait_for_timeout(1000)
     if json.load(open(STATE_F))['put_bytes']>0.4*total if os.path.exists(STATE_F) else False: break
    await page.screenshot(path=str(OUT/f'{ROLE}-{MODE}-progress.png'))
    await dlg.get_by_role('button',name='Szüneteltetés').click(); await page.wait_for_timeout(2000)
    print(ROLE,MODE,'paused after s',int(time.time()-t0),'| text',(await dlg.inner_text()).replace('\n',' | ')[:300])
   else:
    for _ in range(500):
     await page.wait_for_timeout(1000)
     if await dlg.get_by_role('button',name='Bezárás').count(): break
    print(ROLE,MODE,'finished after s',int(time.time()-t0),'| text',(await dlg.inner_text()).replace('\n',' | ')[:400])
   await page.screenshot(path=str(OUT/f'{ROLE}-{MODE}-end.png'))
   s=json.load(open(STATE_F))
   print(ROLE,MODE,'files',{k:v['status'] for k,v in s['files'].items()},'| puts',s['puts'],'| MB',round(s['put_bytes']/1e6,1),'| sha mismatch',s['sha_mismatch'],'| md5≠etag',sum(1 for f in s['files'].values() for k in f['etag'] if f['md5'].get(k) and f['md5'][k]!=f['etag'][k]))
  print(ROLE,MODE,'log',log[:12],'| errors',errors[:3],'| supabase writes',writes[:5])
  await browser.close()
asyncio.run(main())
