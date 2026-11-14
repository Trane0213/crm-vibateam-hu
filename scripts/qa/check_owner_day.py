import asyncio,json,base64,re
from pathlib import Path
from playwright.async_api import async_playwright
OUT=Path('/tmp/browser/owner/shots'); OUT.mkdir(parents=True, exist_ok=True)
# Izolált TESZT-próba (Owner): kitalált TESZT-sorok, minden írás 403-mal blokkolva; nem éles munkamenet, nem valódi RLS.
import urllib.request
_src=urllib.request.urlopen('http://localhost:8080/src/components/today/owner-home.tsx').read().decode()
_rt=urllib.request.urlopen('http://localhost:8080/src/router.tsx').read().decode()
def _u(pat,src): return re.search(r'"((?:/@fs/[^"]*)?/node_modules/[^"]*'+pat+r'[^"]*)"',src).group(1)
REACT=_u(r'\.vite/deps/react\.js',_src); RQ=_u('tanstack_react-query',_rt); RR=_u('react-router/dist/esm/index.dev.js',_rt)
RDC=REACT.replace('react.js','react-dom_client.js')
P1='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; P2='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
L1='11111111-1111-4111-8111-111111111111'; L2='22222222-2222-4222-8222-222222222222'; L3='33333333-3333-4333-8333-333333333333'
PROJECTS=[
 {'id':P1,'title':'TESZT Árnyas utca felújítás','status':'kivitelezes','company_id':'TESZT-company','deadline':'2026-11-10','project_manager_user_id':'TESZT-pm','handoff_payload':None},
 {'id':P2,'title':'TESZT Lépcsőház átadás','status':'atadas','company_id':'TESZT-company','deadline':None,'project_manager_user_id':None,'handoff_payload':None},
]
TASKS=[
 {'id':'t1','title':'TESZT lejárt villanyszerelés','status':'open','priority':'high','due_date':'2026-11-12T09:00:00Z','project_id':P1,'assigned_user':'TESZT-pm-profile'},
 {'id':'t2','title':'TESZT anyag: kábeltálca','status':'blocked','priority':'normal','due_date':None,'project_id':P1,'assigned_user':None},
]
LEADS=[
 {'id':L1,'status':'contract','summary':'TESZT szerződés','company_id':'TESZT-company','contact_id':None,'assigned_to':'TESZT-sales','next_step_due_at':'2026-11-12T09:00:00Z','pipeline_entered_at':'2026-11-01T00:00:00Z','created_at':'2026-11-01T00:00:00Z','source':None,'next_step_type':'phone'},
 {'id':L2,'status':'quote_sent','summary':'TESZT elfogadott','company_id':'TESZT-company2','contact_id':'k','assigned_to':'TESZT-sales','next_step_due_at':'2026-11-20T09:00:00Z','pipeline_entered_at':'2026-11-01T00:00:00Z','created_at':'2026-11-01T00:00:00Z','source':None,'next_step_type':'phone'},
 {'id':L3,'status':'quote_prep','summary':'TESZT kész ajánlat','company_id':None,'contact_id':None,'assigned_to':'TESZT-sales','next_step_due_at':None,'pipeline_entered_at':'2026-11-02T00:00:00Z','created_at':'2026-11-02T00:00:00Z','source':None,'next_step_type':None},
]
QUOTES=[
 {'id':'q-acc','lead_id':L2,'project_id':None,'title':'TESZT ajánlat A','status':'accepted','is_current':True,'updated_at':'2026-11-13T10:00:00Z','total_amount':1000000,'manual_net_amount':None,'tax_percent':27,'quote_items':[{'count':2}]},
 {'id':'q-rdy','lead_id':L3,'project_id':None,'title':'TESZT ajánlat B','status':'ready','is_current':True,'updated_at':'2026-11-13T11:00:00Z','total_amount':None,'manual_net_amount':None,'tax_percent':27,'quote_items':[{'count':0}]},
]
FACTS={'facts':{'kind':'daily','period':{'start':'2026-11-13T23:00:00.000Z','end':'2026-11-14T09:00:00.000Z','label':'2026. 11. 14.'},'sections':[
 {'key':'immediate','title':'Azonnali','total':1,'items':[{'id':'n1','type':'notification','label':'TESZT kritikus rendszerhiba','at':'2026-11-14T07:00:00Z','link':'/help','extra':{'severity':'critical','decision':False,'occurrences':3}}]},
 {'key':'new_issues','title':'Új','total':1,'items':[{'id':'i1','type':'issue','label':'Hiba · /quotes · Új','at':'2026-11-14T06:00:00Z','link':'/help','extra':{'reporter_role':'sales'}}]},
 {'key':'open_issues','title':'Nyitott','total':1,'items':[{'id':'i1','type':'issue','label':'Hiba · /quotes · Új','at':'2026-11-14T06:00:00Z','link':'/help'}]},
 {'key':'business','title':'Üzleti','total':1,'items':[{'id':'w1','type':'web_request','label':'Új webes ajánlatkérés (lakossagi)','at':'2026-11-14T05:00:00Z','link':'/web-quote-requests'}],'note':'x'},
 {'key':'processing','title':'Dok','total':0,'items':[]},
 {'key':'notifications','title':'Ért','total':0,'items':[]},
 {'key':'overdue','title':'Elmaradt','total':30,'items':[
   {'id':L1,'type':'lead','label':'Lejárt következő lépés (phone)','at':'2026-11-12T09:00:00Z','link':'/leads/'+L1},
   {'id':'t1','type':'task','label':'Lejárt feladat: TESZT lejárt villanyszerelés','at':'2026-11-12T09:00:00Z','link':'/projects/'+P1,'extra':{'project_id':P1}},
   {'id':'wr1','type':'web_request','label':'Feldolgozatlan webes ajánlatkérés (lakossagi)','at':'2026-11-11T09:00:00Z','link':'/web-quote-requests'}]},
 {'key':'ai_signals','title':'AI','total':1,'items':[{'id':'s1','type':'ai_signal','label':'TESZT ismétlődő eszközhiba · sales','at':'2026-11-14T04:00:00Z','link':'/settings/ai-review','extra':{'severity':'warning','occurrences':4}}]},
 {'key':'ai_usage','title':'AI','total':0,'items':[]},
]},'hash':'h-new','reports':[{'id':'r1','period_label':'x','status':'ok','report':None,'facts':{'sections':[]},'facts_hash':'h-old','tokens_used':1,'error':None,'created_at':'2026-11-13T18:00:00Z'}]}
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True)
  page=await browser.new_page(viewport={'width':1280,'height':1800})
  errors=[]; page.on('pageerror',lambda e:errors.append(str(e)[:300]))
  writes=[]; fns=[]
  await page.goto('http://localhost:8080/auth',wait_until='networkidle')
  await page.evaluate(f'''async()=>{{const {{toCrossJSON}}=await import('/node_modules/seroval/dist/dev/index.js'); window.encodeRpc=x=>JSON.stringify(toCrossJSON({{result:x,error:undefined,context:{{}}}}));}}''')
  enc={'facts':await page.evaluate('(x)=>window.encodeRpc(x)',FACTS)}
  async def intercept(route):
   req=route.request;url=req.url
   if '/_serverFn/' in url:
    try: name=json.loads(base64.urlsafe_b64decode(url.split('/_serverFn/')[1].split('?')[0]+'===')).get('export','')
    except Exception: name='unknown'
    fns.append(name)
    if 'ownerReportOverview' in name: return await route.fulfill(status=200,content_type='application/json',headers={'x-tss-serialized':'true'},body=enc['facts'])
    return await route.fulfill(status=503,content_type='text/plain',body='Isolated test: unavailable')
   if '/rest/v1/' in url:
    if req.method in ['POST','PATCH','PUT','DELETE'] and '/rpc/' not in url:
     writes.append(req.method+' '+url.split('/rest/v1/')[1][:60]); return await route.fulfill(status=403,content_type='application/json',body=json.dumps({'message':'Isolated test: writes blocked'}))
    table=url.split('/rest/v1/')[1].split('?')[0]; body=[]
    single='application/vnd.pgrst.object' in req.headers.get('accept','')
    if table=='users_profile': body=[{'id':'TESZT-owner-profile','auth_user_id':'TESZT-user','full_name':'TESZT Tulajdonos','email':'test@example.invalid','role_id':'TESZT-role','roles':{'name':'owner'}}]
    elif table=='users_profile_lookup': body=[{'id':'TESZT-pm-profile','auth_user_id':'TESZT-pm','full_name':'TESZT Projektvezető'},{'id':'TESZT-sales-profile','auth_user_id':'TESZT-sales','full_name':'TESZT Értékesítő'}]
    elif table=='agent_role_access': body=[{'agent_id':'crm','can_view':True}]
    elif table=='projects': body=PROJECTS
    elif table=='tasks': body=TASKS
    elif table=='leads': body=LEADS
    elif table=='quotes': body=[] if 'lead_id=is.null' in url else QUOTES
    elif table=='agent_run_steps': body=[{'id':'a1','tool_name':'sales_send_email','agent_id':'sales','approval_expires_at':'2099-01-01T00:00:00Z','created_at':'2026-11-14T08:00:00Z'}]
    elif table=='companies': body=[{'id':'TESZT-company','name':'TESZT Társasház','company_type':'tarsashaz'},{'id':'TESZT-company2','name':'TESZT Kft.','company_type':'ceg'}]
    elif '/rpc/' in url: body=[]
    if single: body=body[0] if body else None
    return await route.fulfill(status=200,content_type='application/json',headers={'content-range':'0-0/1','access-control-expose-headers':'content-range','access-control-allow-origin':'*'},body=json.dumps(body))
   if 'supabase.co' in url: return await route.fulfill(status=403,body='blocked')
   await route.continue_()
  await page.route('**/*',intercept)
  await page.route('**/isolated-check',lambda route:route.fulfill(content_type='text/html',body='<html><head></head><body></body></html>'))
  await page.goto('http://localhost:8080/isolated-check',wait_until='domcontentloaded')
  await page.evaluate(f'''async()=>{{
   const RefreshRuntime=(await import('/@react-refresh')).default;RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{{}};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;
   const R=(await import('{REACT}')).default;
   const D=(await import('{RDC}')).default;
   const {{Outlet}}=await import('{RR}');
   const {{RouterProvider}}=await import('{RR}');
   const {{supabase}}=await import('/src/integrations/supabase/client.ts');
   const session={{access_token:'TESZT.not-a-real.token',user:{{id:'TESZT-user',email:'test@example.invalid'}}}};
   supabase.auth.getSession=async()=>({{data:{{session}},error:null}});supabase.auth.getUser=async()=>({{data:{{user:session.user}},error:null}});supabase.auth.onAuthStateChange=()=>({{data:{{subscription:{{unsubscribe(){{}}}}}}}});
   const {{getRouter}}=await import('/src/router.tsx');const {{QueryClientProvider}}=await import('{RQ}');
   window.history.replaceState(null,'','/today');window.testRouter=getRouter();window.testRouter.routeTree.options.shellComponent=undefined;window.testRouter.routeTree.options.component=()=>R.createElement(QueryClientProvider,{{client:window.testRouter.options.context.queryClient}},R.createElement(Outlet));
   const link=document.createElement('link');link.rel='stylesheet';link.href='/src/styles.css';document.head.appendChild(link);
   window.testRouter.options.context.queryClient.setDefaultOptions({{queries:{{retry:false}}}});
   const host=document.createElement('div');document.body.replaceChildren(host);
   D.createRoot(host).render(R.createElement(RouterProvider,{{router:window.testRouter}}));
   window.goTest=async(path)=>{{await window.testRouter.navigate({{href:path}});}};
  }}''')
  await page.wait_for_timeout(3000)
  async def shot(name):
   await page.screenshot(path=str(OUT/(name+'.png')))
  for w,h,tag in [(1280,1800,'desktop'),(390,844,'mobile')]:
   await page.set_viewport_size({'width':w,'height':h})
   await page.evaluate('(p)=>window.goTest(p)','/today'); await page.wait_for_timeout(3000)
   txt=await page.locator('body').inner_text()
   lst=await page.locator('section', has=page.get_by_role('heading',name='Mai teendők prioritás szerint')).inner_text()
   order=[x for x in ['TESZT kritikus rendszerhiba','AI-művelet a döntésedre vár','Szerződés előkészítése: TESZT Társasház','Elfogadott ajánlat: TESZT Kft.','TESZT Árnyas utca felújítás — 1 lejárt feladat','Feldolgozatlan webes ajánlatkérés','Küldésre előkészítve: TESZT ajánlat B','Dolgozói jelzés: Hiba','AI-jelzés (gyanú)'] if x in lst]
   print(tag,'focus', 'MOST EZZEL KEZDJ' in txt.upper(), '| items found', len(order), '/9 | order ok', [lst.index(x) for x in order]==sorted(lst.index(x) for x in order), [lst.index(x) for x in order])
   print(tag,'dedupe: overdue task row absent', 'Lejárt feladat: TESZT lejárt villanyszerelés' not in txt, '| contract lead overdue absent', 'Lejárt következő lépés (phone)' not in txt, '| issue once', txt.count('Dolgozói jelzés: Hiba')==1)
   print(tag,'finance no-connection', 'Nincs adatkapcsolat.' in txt, '| e-sign note', 'e-aláírás a CRM-ben nincs' in txt, '| contract warning', 'Nincs kapcsolattartó' in txt, '| George status changed', 'a tények azóta változtak' in txt, '| partial note', 'Részleges' in txt, '| PM name', 'TESZT Projektvezető' in txt, '| Sales name', 'TESZT Értékesítő' in txt)
   print(tag,'overflow', await page.evaluate('document.documentElement.scrollWidth>innerWidth'))
   await shot('today-'+tag)
  await page.set_viewport_size({'width':1280,'height':1800})
  await page.evaluate('(p)=>window.goTest(p)','/today'); await page.wait_for_timeout(2000)
  await page.get_by_role('group',name='Szűrés munkaterület szerint').get_by_role('button',name=re.compile('^Kritikus projektek')).click(); await page.wait_for_timeout(800)
  txt=await page.locator('body').inner_text()
  print('lane filter url', await page.evaluate('location.search'), '| only projects', 'TESZT Lépcsőház átadás — nincs kijelölt projektvezető' in txt and 'Dolgozói jelzés: Hiba' not in txt)
  await shot('today-lane-projects')
  href=await page.get_by_role('link',name='Feladatok').first.get_attribute('href'); print('project row link', href)
  await page.evaluate('(p)=>window.goTest(p)','/today'); await page.wait_for_timeout(1500)
  links=await page.eval_on_selector_all('a[href]','els=>els.map(e=>e.getAttribute("href"))')
  print('contract link', any(l.startswith('/sales/leads?lead='+L1) for l in links), '| ready quote link', '/quotes/q-rdy' in links, '| handover tab link', any(l.startswith('/projects/'+P2) and 'handover' in l for l in links))
  await page.evaluate('(p)=>window.goTest(p)','/dashboard'); await page.wait_for_timeout(2500)
  links=await page.eval_on_selector_all('a[href]','els=>els.map(e=>e.getAttribute("href"))')
  print('DASHBOARD overdue task -> project tasks tab', any(l.startswith('/projects/'+P1) and 'tab=tasks' in l for l in links), '| handover tab', any(l.startswith('/projects/'+P2) and 'handover' in l for l in links), '| back', 'Mai vezetői munka' in await page.locator('body').inner_text())
  await shot('dashboard-desktop')
  await page.evaluate('(p)=>window.goTest(p)','/owner-report'); await page.wait_for_timeout(2500)
  txt=await page.locator('body').inner_text()
  print('OWNER-REPORT back link', 'Vissza: Mai vezetői munka' in txt, '| immediate', 'TESZT kritikus rendszerhiba' in txt)
  await page.evaluate('(p)=>window.goTest(p)','/help/owner'); await page.wait_for_timeout(2000)
  print('HELP owner new step', 'Mai vezetői munka · Most ezzel kezdj' in await page.locator('body').inner_text())
  print('server fns', sorted(set(fns)), '| WRITE attempts', writes, '| pageerrors', errors)
  await browser.close()
asyncio.run(main())
