import asyncio,json,base64,re,sys,urllib.parse
from pathlib import Path
from playwright.async_api import async_playwright
OUT=Path('/tmp/browser/contract/shots'); OUT.mkdir(parents=True, exist_ok=True)
# Izolált TESZT-próba (7. csomag, szerződés-előkészítés): kitalált TESZT-sorok, minden írás 403-mal blokkolva,
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
UID={'owner':'TESZT-owner','project_manager':'TESZT-pm','sales':'TESZT-sales'}[ROLE]
DB={
 'projects':[
  {'id':P2,'title':'TESZT Lépcsőház felújítás','status':'atadas','company_id':'TESZT-company','lead_id':L2,'address':None,'deadline':None,'start_date':'2026-11-10','project_manager_user_id':'TESZT-pm','created_at':'2026-11-10T09:00:00Z','project_type':None,'description':None,
   'handoff_payload':{'source':'web','summary':'TESZT: lépcsőház festés és burkolat, 4 emelet, ügyfél tavaszi kezdést kér','notes':'','project_manager_user_id':'TESZT-pm','created_via':'sales_mark_won_with_project'},'handoff_at':'2026-11-10T09:00:00Z'},
  {'id':P3,'title':'TESZT Belső karbantartás','status':'kivitelezes','company_id':None,'lead_id':None,'address':'TESZT telephely','deadline':'2026-12-20','start_date':None,'project_manager_user_id':'TESZT-pm','created_at':'2026-11-01T09:00:00Z','handoff_payload':None,'handoff_at':None},
 ],
 'leads':[
  {'id':L1,'status':'contract','summary':'TESZT szerződés előtt álló ügy, 3 lakás','company_id':'TESZT-company','contact_id':'TESZT-contact','assigned_to':'TESZT-sales','next_step_type':'phone','next_step_due_at':'2026-11-20T09:00:00Z','next_step_note':None,'pipeline_entered_at':'2026-11-01T00:00:00Z','created_at':'2026-11-01T00:00:00Z','source':'web','won_at':None,'updated_at':'2026-11-13T00:00:00Z'},
  {'id':L2,'status':'won','summary':'TESZT: lépcsőház festés és burkolat','company_id':'TESZT-company','contact_id':None,'assigned_to':'TESZT-sales','next_step_type':None,'next_step_due_at':None,'next_step_note':None,'pipeline_entered_at':'2026-10-20T00:00:00Z','created_at':'2026-10-01T00:00:00Z','source':'web','won_at':'2026-11-10T09:00:00Z','updated_at':'2026-11-10T09:00:00Z'},
 ],
 'quotes':[{'id':'q-1','lead_id':L2,'project_id':P2,'title':'TESZT ajánlat','status':'accepted','valid_until':'2026-11-01','site_address':None,'template_terms':{'payment':'TESZT 30 nap'},'tax_percent':27,'is_current':True,'version':1,'alternative_key':'A','total_amount':1200000,'created_at':'2026-11-01T00:00:00Z','sent_at':'2026-11-02T00:00:00Z','manual_net_amount':None},
            {'id':'q-2','lead_id':L1,'project_id':None,'title':'TESZT ajánlat L1','status':'accepted','quote_kind':'viba_offer','discount_percent':0,'notes':None,'valid_until':'2026-12-31','site_address':'TESZT utca 5.','template_terms':None,'tax_percent':27,'is_current':True,'version':1,'alternative_key':'A','total_amount':900000,'created_at':'2026-11-01T00:00:00Z','sent_at':'2026-11-02T00:00:00Z','manual_net_amount':None}],
 'project_contacts':[], 'project_documents':[{'id':'pd-1','project_id':P2,'name':'TESZT szerzodes alairt.pdf','file_url':'projects/TESZT/szerzodes.pdf','document_type':'contract','created_at':'2026-11-11T09:00:00Z','uploaded_by':'TESZT-sales'}], 'tasks':[], 'project_notes':[], 'followups':[], 'phone_calls':[], 'meetings':[], 'email_threads':[], 'lead_status_history':[], 'quote_documents':[{'id':'qd-1','quote_id':'q-2','name':'TESZT feltetelek.pdf','file_url':'quotes/TESZT/feltetelek.pdf','document_type':'contract_terms','created_at':'2026-11-05T09:00:00Z'}],
 'contacts':[{'id':'TESZT-contact','company_id':'TESZT-company','name':'TESZT Kapcsolat','email':None,'email_invalid':False}],
 'companies':[{'id':'TESZT-company','name':'TESZT Társasház','company_type':'tarsashaz','tax_number':None}],
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
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True)
  page=await browser.new_page(viewport={'width':1280,'height':1800})
  errors=[]; page.on('pageerror',lambda e:errors.append(str(e)[:300]))
  writes=[]; fns=[]
  await page.goto('http://localhost:8080/auth',wait_until='networkidle')
  async def intercept(route):
   req=route.request;url=req.url
   if '/_serverFn/' in url:
    try: name=json.loads(base64.urlsafe_b64decode(url.split('/_serverFn/')[1].split('?')[0]+'===')).get('export','')
    except Exception: name='unknown'
    fns.append(name)
    return await route.fulfill(status=503,content_type='text/plain',body='Isolated test: unavailable')
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
    elif table=='agent_role_access': body=[{'agent_id':'pm','can_view':True}]
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
  items=lambda: page.eval_on_selector_all('[data-contract-item]','els=>els.map(e=>e.dataset.contractItem+":"+e.dataset.state)')
  phase=lambda: page.eval_on_selector_all('[data-contract-phase]','els=>els.map(e=>e.dataset.contractPhase)')
  for w,h,tag in [(1280,1800,'desktop'),(390,844,'mobile')]:
   await page.set_viewport_size({'width':w,'height':h})
   await go(f'/projects/{P2}?tab=handover'); await page.wait_for_timeout(3500)
   txt=await page.locator('body').inner_text()
   hk=await page.eval_on_selector_all('[data-handoff-item]','els=>els.map(e=>e.dataset.handoffItem)')
   ck=[x.split(':')[0] for x in await items()]
   print(ROLE,tag,'PROJECT contract items',await items(),'| phase',await phase(),'| duplicate keys',sorted(set(hk)&set(ck)))
   print(ROLE,tag,'  section2', '2. Szerződés-előkészítés és szerződésfájlok' in txt, '| section3 TIG', '3. Műszaki átadás a megrendelőnek' in txt,
         '| docs', await page.eval_on_selector_all('[data-contract-doc]','els=>els.map(e=>e.dataset.contractDoc)'),
         '| owner decisions', await page.eval_on_selector_all('[data-owner-decision]','els=>els.map(e=>e.dataset.ownerDecision)'),
         '| approved-wording', any(x in txt for x in ['Jóváhagyva','Aláírva']), '| overflow', await ovf())
   await page.locator('#szerzodes-elokeszites').scroll_into_view_if_needed()
   await page.screenshot(path=str(OUT/f'{ROLE}-project-{tag}.png'))
  await page.set_viewport_size({'width':1280,'height':1800})
  await go(f'/projects/{P2}?tab=handover'); await page.wait_for_timeout(2500)
  btn=page.locator('[data-contract-doc]').first.get_by_role('button',name='Megnyitás')
  if await btn.count():
   await btn.click(); await page.wait_for_timeout(1500)
   print(ROLE,'DOC open → server fn called', 'r2PresignDownload' in ' '.join(fns) or any('r2' in f.lower() for f in fns), '| error toast', 'A fájl nem nyitható meg' in await page.locator('body').inner_text())
  if ROLE in ('sales','owner'):
   for w,h,tag in [(1280,1800,'desktop'),(390,844,'mobile')]:
    await page.set_viewport_size({'width':w,'height':h})
    await go(f'/sales/leads?lead={L1}'); await page.wait_for_timeout(3500)
    reg=page.get_by_role('region',name='Szerződés-előkészítés')
    print(ROLE,tag,'PIPELINE panel', await reg.count(), '| items', await items(), '| phase', await phase(), '| overflow', await ovf())
    if await reg.count():
     links=await reg.first.locator('a[href]').evaluate_all('els=>els.map(e=>e.getAttribute("href"))')
     print(ROLE,tag,'  links',sorted(set(links)))
     await reg.first.scroll_into_view_if_needed(); await page.screenshot(path=str(OUT/f'{ROLE}-pipeline-{tag}.png'))
   await page.set_viewport_size({'width':1280,'height':1800})
   await go(f'/leads?lead={L2}'); await page.wait_for_timeout(3500)
   c=page.get_by_role('region',name='Szerződés-előkészítés állapota')
   print(ROLE,'WON card compact', await c.count(), (await c.first.inner_text())[:300].replace('\n',' / ') if await c.count() else None)
   await page.screenshot(path=str(OUT/f'{ROLE}-won-card.png'))
  await go('/quotes/q-2'); await page.wait_for_timeout(3500)
  tab=page.get_by_role('tab',name=re.compile('Utánkövetés'))
  if await tab.count():
   await tab.first.click(); await page.wait_for_timeout(1500)
   c=page.get_by_role('region',name='Szerződés-előkészítés állapota')
   print(ROLE,'QUOTE compact', await c.count(), (await c.first.inner_text())[:300].replace('\n',' / ') if await c.count() else None)
   if await c.count():
    print(ROLE,'  quote links', await c.first.locator('a[href]').evaluate_all('els=>els.map(e=>e.getAttribute("href"))'))
    await c.first.scroll_into_view_if_needed()
   await page.screenshot(path=str(OUT/f'{ROLE}-quote.png'))
  else: print(ROLE,'QUOTE no status tab (role/kind)')
  print(ROLE,'server fns', sorted(set(fns)), '| WRITE attempts', writes, '| pageerrors', errors)
  await browser.close()
asyncio.run(main())
