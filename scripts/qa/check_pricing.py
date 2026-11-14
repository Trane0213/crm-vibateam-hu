import asyncio,json,base64,re,sys,urllib.parse
from pathlib import Path
from playwright.async_api import async_playwright
OUT=Path('/tmp/browser/pricing/shots'); OUT.mkdir(parents=True, exist_ok=True)
# Izolált TESZT-próba (P3 Költségvetés árazása panel: valódi motorral számolt TESZT-eredmény, szimulált szerver): kitalált TESZT-sorok, minden írás 403-mal blokkolva,
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
PAYLOAD=json.load(open('/tmp/browser/pricing/payload.json'))
DB={'quotes':[{'id':Q,'title':'TESZT kapott költségvetés','status':'draft','quote_kind':'received_budget','scope_type':'material_labor','lead_id':None,'project_id':None,'version':1,'is_current':True,'group_id':Q,'alternative_key':None,'created_at':'2026-11-14T10:00:00Z','created_by':UID,'responsible_user_id':UID,'tax_percent':27,'discount_percent':0,'manual_net_amount':None,'total_amount':0,'locked_at':None,'valid_until':None,'notes':None}],
 'quote_documents':[{'id':D,'quote_id':Q,'name':'TESZT_arazatlan.xlsx','file_url':'quote-documents/'+Q+'/unpriced_budget/1-TESZT.xlsx','document_type':'unpriced_budget','mime_type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','size_bytes':20000,'created_at':'2026-11-14T10:01:00Z','uploaded_by':UID}]}
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
 if 'priceReceivedBudget' in name: return await ok(PAYLOAD)
 if 'listDocumentPackages' in name: return await ok({'available':True,'packages':[]})
 if 'r2GetStatus' in name: return await ok({'ok':True})
 return await ok(None)

async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True)
  ctx=await browser.new_context(viewport={'width':1280,'height':1800}, user_agent=None if MODE!='mobile' else 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1')
  page=await ctx.new_page()
  errors=[]; page.on('pageerror',lambda e:errors.append(str(e)[:300])); page.on('console',lambda m: CONS.append(m) if m.type in ('error','warning') else None)
  writes=[]; log=[]; global CONS; CONS=[]
  await page.goto('http://localhost:8080/auth',wait_until='networkidle')
  async def intercept(route):
   req=route.request;url=req.url
   if False:
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
  if MODE=='mobile': await page.set_viewport_size({'width':390,'height':844})
  await go(f'/quotes/{Q}'); await page.wait_for_timeout(3000)
  await page.get_by_role('tab',name=re.compile('Összeg és megjegyzések')).click(); await page.wait_for_timeout(1200)
  panel=page.get_by_role('region',name='Költségvetés árazása')
  print(ROLE,MODE,'panel',await panel.count())
  if await panel.count():
   await panel.screenshot(path=str(OUT/f'{ROLE}-{MODE}-1-form.png'))
   await panel.get_by_role('button',name='Számítás').click(); await page.wait_for_timeout(2000)
   print(ROLE,MODE,'fn calls',[c for c in CALLS if 'price' in c.lower()],'| verified',await panel.get_by_text('Árazott TERVEZET elkészült').count(),'| download',await panel.get_by_role('button',name=re.compile('Árazott Excel')).count(),'| rows',await panel.locator('tbody tr').count(),'| overflow',await ovf())
   await panel.screenshot(path=str(OUT/f'{ROLE}-{MODE}-2-result.png'))
   await panel.get_by_role('tab',name=re.compile('Nincs forrás')).click(); await page.wait_for_timeout(400)
   print(ROLE,MODE,'missing rows',await panel.locator('tbody tr').count())
   await panel.get_by_role('tab',name=re.compile('Árazva')).click(); await page.wait_for_timeout(400)
   await panel.locator('tbody tr').first.click(); await page.wait_for_timeout(400)
   print(ROLE,MODE,'trace',(await panel.locator('tbody tr').nth(1).inner_text())[:300].replace('\n',' | '))
   await panel.screenshot(path=str(OUT/f'{ROLE}-{MODE}-3-trace.png'))
   async with page.expect_download() as dl:
    await panel.get_by_role('button',name=re.compile('Árazott Excel')).click()
   d=await dl.value; p=f'/tmp/browser/pricing/{ROLE}-{MODE}-'+d.suggested_filename; await d.save_as(p); print(ROLE,MODE,'downloaded',d.suggested_filename,os.path.getsize(p))
   await panel.get_by_role('button',name=re.compile('Nettó átvétele')).click(); await page.wait_for_timeout(500)
   net=page.locator('input[id*="manual"], input[name*="manual"]')
   print(ROLE,MODE,'net field',[await net.nth(i).input_value() for i in range(await net.count())],'| expected',PAYLOAD['summary']['totals']['netHuf'])
  print(ROLE,MODE,'writes',writes,'| errors',errors[:3])
  await browser.close()
asyncio.run(main())
