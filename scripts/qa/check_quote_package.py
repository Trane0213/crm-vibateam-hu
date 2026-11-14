import asyncio,json,base64,re,sys,urllib.parse
from pathlib import Path
from playwright.async_api import async_playwright
OUT=Path('/tmp/browser/pkg/shots'); OUT.mkdir(parents=True, exist_ok=True)
# Izolált TESZT-próba (P5 Ajánlatcsomag: valódi csomagmotorral számolt TESZT-eredmény, szimulált szerver). Kitalált TESZT-adatok;
# a feltöltés és a quote_documents/quotes írás CSAK memóriában szimulált, a Gmail-küldés (/api/gmail/send) tiltott és nem kattintjuk;
# a szerepkör a TESZT-profilból jön; nem éles munkamenet és nem valódi RLS.
import urllib.request
_src=urllib.request.urlopen('http://localhost:8080/src/components/today/pm-home.tsx').read().decode()
_rt=urllib.request.urlopen('http://localhost:8080/src/router.tsx').read().decode()
def _u(pat,src): return re.search(r'"((?:/@fs/[^"]*)?/node_modules/[^"]*'+pat+r'[^"]*)"',src).group(1)
REACT=_u(r'\.vite/deps/react\.js',_src); RQ=_u('tanstack_react-query',_rt); RR=_u('react-router/dist/esm/index.dev.js',_rt)
RDC=REACT.replace('react.js','react-dom_client.js')
ROLE=sys.argv[1] if len(sys.argv)>1 else 'sales'
MODE=sys.argv[2] if len(sys.argv)>2 else 'ui'
UID={'owner':'TESZT-owner','project_manager':'TESZT-pm','sales':'TESZT-sales','marketing':'TESZT-mkt'}[ROLE]
Q='abababab-abab-4bab-8bab-abababababab'; D='cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd'
PAYLOAD=json.load(open('/tmp/browser/pkg/payload.json'))
DB0={'quotes':[{'id':Q,'title':'TESZT csarnok villamos felújítás','status':'draft','quote_kind':'received_budget','scope_type':'labor_only','contact_id':'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1','lead_id':None,'project_id':None,'version':2,'is_current':True,'group_id':Q,'alternative_key':'A','created_at':'2026-11-14T10:00:00Z','created_by':UID,'responsible_user_id':UID,'tax_percent':27,'discount_percent':0,'manual_net_amount':None,'total_amount':0,'locked_at':None,'valid_until':None,'notes':None}],
 'quote_documents':[{'id':'efefefef-efef-4fef-8fef-efefefefefef','quote_id':Q,'name':'T-5_FE_foeloszto.pdf','file_url':'quote-documents/'+Q+'/technical_plan/1-T5.pdf','document_type':'technical_plan','mime_type':'application/pdf','size_bytes':200000,'created_at':'2026-11-14T10:02:00Z','uploaded_by':UID},{'id':D,'quote_id':Q,'name':'TESZT_arazatlan.xlsx','file_url':'quote-documents/'+Q+'/unpriced_budget/1-TESZT.xlsx','document_type':'unpriced_budget','mime_type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','size_bytes':20000,'created_at':'2026-11-14T10:01:00Z','uploaded_by':UID}]}
def filt(table,qs):
 rows=list(DB.get(table,[]))
 for k,vs in qs.items():
  if k in ('select','order','limit','offset','or','and'): continue
  v=vs[0]
  if v.startswith('eq.'): rows=[r for r in rows if str(r.get(k)).lower()==v[3:].lower()]
  elif v=='is.null': rows=[r for r in rows if r.get(k) is None]
 return rows
import os
CALLS=[]
def fn_name(url):
 try: return json.loads(base64.urlsafe_b64decode(url.split('/_serverFn/')[1].split('?')[0]+'===')).get('export','')
 except Exception: return 'unknown'
async def handle_fn(route, req, log):
 name=fn_name(req.url); CALLS.append(name)
 ok=lambda o: route.fulfill(status=200,content_type='application/json',body=json.dumps({'result':o,'context':{}}))
 if 'prepareQuotePackage' in name: return await ok(PAYLOAD)
 if 'reviewPlans' in name or 'priceReceivedBudget' in name: return await ok({'ok':False,'error':'nem része a próbának'})
 if 'listDocumentPackages' in name: return await ok({'available':True,'packages':[]})
 if 'r2GetStatus' in name: return await ok({'ok':True})
 return await ok(None)

DB0['contacts']=[{'id':'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1','name':'TESZT Elek','email':'teszt.elek@example.invalid','company_id':None}]
DB0['quote_sends']=[]
DB=DB0
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True)
  ctx=await browser.new_context(viewport={'width':1280,'height':1800}, user_agent=None if MODE!='mobile' else 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1')
  page=await ctx.new_page()
  errors=[]; page.on('pageerror',lambda e:errors.append(str(e)[:300])); page.on('console',lambda m: CONS.append(m) if m.type in ('error','warning') else None)
  writes=[]; log=[]; global CONS; CONS=[]
  global SIM, GMAIL; SIM=[]; GMAIL=[]
  await page.goto('http://localhost:8080/auth',wait_until='networkidle')
  async def intercept(route):
   req=route.request;url=req.url
   if False:
    _,_,_,fid,n=url.split('/')[:5]
    data=req.post_data_buffer or b''
    f=next(x for x in ST['files'].values() if x['id']==fid)
    f['etag'][n]=hashlib.md5(data).hexdigest(); ST['puts']+=1; ST['put_bytes']+=len(data); save_state()
    return await route.fulfill(status=200,headers={'access-control-allow-origin':'*'},body='')
   if url.endswith('/api/r2-upload'):
    SIM.append('R2 upload (szimulált)'); return await route.fulfill(status=200,content_type='application/json',body=json.dumps({'key':'quote-documents/%s/sim/%d'%(Q,len(SIM))}))
   if '/api/gmail/send' in url:
    GMAIL.append(url); return await route.fulfill(status=403,content_type='application/json',body=json.dumps({'ok':False,'error':'Isolated test: send blocked'}))
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
    if req.method=='POST' and table=='quote_documents':
     row=json.loads(req.post_data); row.update({'id':'%08d-0000-4000-8000-000000000000'%len(DB['quote_documents']),'created_at':'2026-11-15T09:00:00Z','uploaded_by':UID}); DB['quote_documents'].insert(0,row); SIM.append('INSERT quote_documents '+row['document_type']+' '+row['name'])
     return await route.fulfill(status=201,content_type='application/json',body='')
    if req.method=='PATCH' and table=='quotes':
     patch=json.loads(req.post_data); DB['quotes'][0].update(patch); SIM.append('UPDATE quotes '+json.dumps(patch))
     return await route.fulfill(status=200,content_type='application/json',body=json.dumps([{'id':Q}]))
    if req.method in ['POST','PATCH','PUT','DELETE']:
     writes.append(req.method+' '+path[:70]+' body='+(req.post_data or '')[:120]); return await route.fulfill(status=403,content_type='application/json',body=json.dumps({'message':'Isolated test: writes blocked','code':'42501'}))
    qs=urllib.parse.parse_qs(urllib.parse.urlsplit(url).query)
    single='application/vnd.pgrst.object' in req.headers.get('accept','')
    if table=='users_profile': body=[{'id':UID+'-profile','auth_user_id':UID,'full_name':'TESZT '+ROLE,'email':'test@example.invalid','gmail_email':'teszt-'+ROLE+'@example.invalid','role_id':'TESZT-role','roles':{'name':ROLE}}]
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
  if MODE=='mobile': await page.set_viewport_size({'width':390,'height':844})
  await go(f'/quotes/{Q}'); await page.wait_for_timeout(3000)
  await page.get_by_role('tab',name=re.compile('Ellenőrzés és kiküldés')).click(); await page.wait_for_timeout(1200)
  panel=page.get_by_role('region',name=re.compile('Ajánlatcsomag'))
  print(ROLE,MODE,'panel',await panel.count())
  if await panel.count():
   await panel.get_by_role('button',name='Ajánlatcsomag összeállítása').click(); await page.wait_for_timeout(2000)
   await panel.screenshot(path=str(OUT/f'{ROLE}-{MODE}-1-built.png'))
   print(ROLE,MODE,'ready',await panel.get_by_text('A csomag tartalmilag jóváhagyásra kész').count(),'| overflow',await ovf())
   handoff=panel.get_by_role('button',name='Átadás a kiküldéshez')
   print(ROLE,MODE,'handoff disabled before',await handoff.is_disabled())
   await panel.get_by_role('button',name='Fájlok mentése az ajánlathoz').click(); await page.wait_for_timeout(1500)
   await panel.get_by_role('button',name='Nettó átvétele és mentése').click(); await page.wait_for_timeout(1500)
   await panel.get_by_role('button',name='Belső jóváhagyás-előkészítés').click(); await page.wait_for_timeout(500)
   dlg=page.get_by_role('dialog')
   await dlg.get_by_role('button',name='Előkészítem').click(); await page.wait_for_timeout(400)
   print(ROLE,MODE,'approval without acks blocked',await panel.get_by_text('Belső jóváhagyás előkészítve:').count()==0)
   for cb in await dlg.get_by_role('checkbox').all(): await cb.click()
   await dlg.screenshot(path=str(OUT/f'{ROLE}-{MODE}-2-approval.png'))
   await dlg.get_by_role('button',name='Előkészítem').click(); await page.wait_for_timeout(600)
   print(ROLE,MODE,'approved',await panel.get_by_text('Belső jóváhagyás előkészítve:').count(),'| handoff enabled',not await handoff.is_disabled())
   await panel.get_by_role('tab',name='Változások').click(); await page.wait_for_timeout(300)
   await panel.screenshot(path=str(OUT/f'{ROLE}-{MODE}-3-gates.png'))
   await handoff.click(); await page.wait_for_timeout(1200)
   send=page.get_by_role('dialog')
   txt=await send.inner_text()
   print(ROLE,MODE,'send dialog from package',('Ajánlatcsomagból előkészítve' in txt),'| to',await send.get_by_role('textbox',name='Címzett').input_value(),'| subject',await send.get_by_role('textbox',name='Tárgy').input_value())
   checked=[await c.is_checked() for c in await send.get_by_role('checkbox').all()]
   print(ROLE,MODE,'attachments checked',checked,'| send disabled w/o confirm',await send.get_by_role('button',name='Küldés',exact=True).is_disabled())
   await send.screenshot(path=str(OUT/f'{ROLE}-{MODE}-4-send.png'))
  print(ROLE,MODE,'SIM writes',SIM,'| other writes',writes,'| gmail send calls',GMAIL,'| page errors',errors[:3])
  await browser.close()
asyncio.run(main())
