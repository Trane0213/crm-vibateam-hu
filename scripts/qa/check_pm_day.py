import asyncio,json,base64,re
from pathlib import Path
from playwright.async_api import async_playwright
OUT=Path('/tmp/browser/pm/shots'); OUT.mkdir(parents=True, exist_ok=True)
# Izolált TESZT-próba: kitalált TESZT-sorok, minden írás 403-mal blokkolva; nem éles munkamenet.
import urllib.request
_src=urllib.request.urlopen('http://localhost:8080/src/components/today/pm-home.tsx').read().decode()
_rt=urllib.request.urlopen('http://localhost:8080/src/router.tsx').read().decode()
def _u(pat,src): return re.search(r'"(/node_modules/[^"]*'+pat+r'[^"]*)"',src).group(1)
REACT=_u(r'\.vite/deps/react\.js',_src); RQ=_u('tanstack_react-query',_rt); RR=_u('react-router/dist/esm/index.dev.js',_rt)
RDC=REACT.replace('react.js','react-dom_client.js')
P1='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; P2='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'; A1='cccccccc-cccc-4ccc-8ccc-cccccccccccc'
PROJECTS=[
 {'id':P1,'title':'TESZT Árnyas utca felújítás','status':'kivitelezes','company_id':'TESZT-company','address':'TESZT cím 1.','deadline':'2026-11-18','start_date':'2026-11-01','project_manager_user_id':'TESZT-user','handoff_payload':None,'lead_id':None},
 {'id':P2,'title':'TESZT Lépcsőház átadás','status':'muszaki_atadas','company_id':'TESZT-company','address':None,'deadline':None,'start_date':None,'project_manager_user_id':'TESZT-user','handoff_payload':None,'lead_id':None},
]
TASKS=[
 {'id':'t1','title':'TESZT lejárt villanyszerelés','status':'open','priority':'high','due_date':'2026-11-12T09:00:00Z','project_id':P1,'assigned_user':'TESZT-profile'},
 {'id':'t2','title':'TESZT anyag: kábeltálca','status':'blocked','priority':'normal','due_date':None,'project_id':P1,'assigned_user':None},
 {'id':'t3','title':'TESZT mai bejárás','status':'in_progress','priority':'normal','due_date':'2026-11-14T15:00:00Z','project_id':P2,'assigned_user':'TESZT-profile'},
]
DOCS=[{'id':'d1','project_id':P1,'document_type':'photo','name':'TESZT fotó.jpg','file_url':'k','created_at':'2026-11-10T10:00:00Z','uploaded_by':None},{'id':'d2','project_id':P2,'document_type':'technical','name':'TESZT műszaki.pdf','file_url':'k2','created_at':'2026-11-10T10:00:00Z','uploaded_by':None}]
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True)
  page=await browser.new_page(viewport={'width':1280,'height':1800})
  errors=[]; page.on('pageerror',lambda e:errors.append(str(e)[:300]))
  writes=[]
  await page.goto('http://localhost:8080/auth',wait_until='networkidle')
  await page.evaluate(f'''async()=>{{const {{toCrossJSON}}=await import('/node_modules/seroval/dist/dev/index.js'); window.encodeRpc=x=>JSON.stringify(toCrossJSON({{result:x,error:undefined,context:{{}}}}));}}''')
  enc={'attP':await page.evaluate('(x)=>window.encodeRpc(x)',{'rows':[{'id':A1,'name':'TESZT árnyas utca felújítás','is_active':True}]}),
       'attE':await page.evaluate('(x)=>window.encodeRpc(x)',{'rows':[{'id':'e1','project_id':A1,'worker_id':'w1','work_date':'2026-11-14','attendance_projects':{'name':'TESZT árnyas utca felújítás'}},{'id':'e2','project_id':A1,'worker_id':'w2','work_date':'2026-11-14','attendance_projects':{'name':'TESZT árnyas utca felújítás'}}]})}
  async def intercept(route):
   req=route.request;url=req.url
   if '/_serverFn/' in url:
    try: name=json.loads(base64.urlsafe_b64decode(url.split('/_serverFn/')[1].split('?')[0]+'===')).get('export','')
    except Exception: name='unknown'
    if 'listProjects' in name: return await route.fulfill(status=200,content_type='application/json',headers={'x-tss-serialized':'true'},body=enc['attP'])
    if 'listEntries' in name: return await route.fulfill(status=200,content_type='application/json',headers={'x-tss-serialized':'true'},body=enc['attE'])
    return await route.fulfill(status=503,content_type='text/plain',body='Isolated test: read unavailable')
   if '/rest/v1/' in url:
    if req.method in ['POST','PATCH','PUT','DELETE'] and '/rpc/' not in url:
     writes.append(req.method+' '+url.split('/rest/v1/')[1][:60]); return await route.fulfill(status=403,content_type='application/json',body=json.dumps({'message':'Isolated test: writes blocked'}))
    table=url.split('/rest/v1/')[1].split('?')[0]; body=[]
    single='application/vnd.pgrst.object' in req.headers.get('accept','')
    if table=='users_profile': body=[{'id':'TESZT-profile','auth_user_id':'TESZT-user','full_name':'TESZT Projektvezető','email':'test@example.invalid','role_id':'TESZT-role','roles':{'name':'project_manager'}}]
    elif table=='users_profile_lookup': body=[{'id':'TESZT-profile','full_name':'TESZT Projektvezető'}]
    elif table=='agent_role_access': body=[{'agent_id':'pm','can_view':True}]
    elif table=='projects':
     body=PROJECTS
     if 'id=eq.'+P1 in url: body=[PROJECTS[0]]
     if 'id=eq.'+P2 in url: body=[PROJECTS[1]]
    elif table=='tasks':
     body=TASKS
     if 'project_id=eq.'+P1 in url: body=[t for t in TASKS if t['project_id']==P1]+[{'id':'t9','title':'TESZT lezárt','status':'done','priority':'low','due_date':None,'project_id':P1,'assigned_user':None}]
    elif table=='project_documents':
     body=DOCS
     if 'project_id=eq.'+P1 in url: body=[DOCS[0]]
    elif table=='project_notes': body=[]
    elif table=='companies': body=[{'id':'TESZT-company','name':'TESZT Társasház','company_type':'tarsashaz'}]
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
   await page.evaluate('(p)=>window.goTest(p)','/today'); await page.wait_for_timeout(2500)
   txt=await page.locator('body').inner_text()
   print(tag,'TODAY has focus', 'MOST EZZEL KEZDJ' in txt.upper(), '| first focus lejárt', 'lejárt feladat rendezése' in txt, '| jelenlét 2 fő', '2 fő' in txt, '| Boss', 'Boss segít' in txt, '| overflow', await page.evaluate('document.documentElement.scrollWidth>innerWidth'))
   await shot('today-'+tag)
   await page.evaluate('(p)=>window.goTest(p)',f'/projects/{P1}?tab=tasks'); await page.wait_for_timeout(2500)
   txt=await page.locator('body').inner_text()
   print(tag,'PROJECT tasks: next action', 'KÖVETKEZŐ TEENDŐ' in txt.upper(), '| blocked badge', 'Akadályozott' in txt, '| responsible', 'TESZT Projektvezető' in txt, '| no-owner', 'nincs kijelölve' in txt, '| overflow', await page.evaluate('document.documentElement.scrollWidth>innerWidth'))
   await shot('project-tasks-'+tag)
   await page.evaluate('(p)=>window.goTest(p)',f'/projects/{P1}?tab=handover'); await page.wait_for_timeout(2000)
   txt=await page.locator('body').inner_text()
   print(tag,'HANDOVER: list', 'Átadás / teljesítésigazolás előkészítése' in txt, '| missing', 'kötelező hiányzik' in txt, '| TIG note', 'nem készül' in txt)
   await shot('project-handover-'+tag)
   await page.evaluate('(p)=>window.goTest(p)',f'/projects/{P1}'); await page.wait_for_timeout(2000)
   txt=await page.locator('body').inner_text()
   print(tag,'OVERVIEW: napi lap', 'Napi lap' in txt, '| attendance name match', 'név szerinti egyezés' in txt)
   await shot('project-overview-'+tag)
  # Kész gomb: a write blokkolva, a hiba visszajelzés megjelenik, állapot nem változik
  await page.set_viewport_size({'width':1280,'height':1800})
  await page.evaluate('(p)=>window.goTest(p)',f'/projects/{P1}?tab=tasks'); await page.wait_for_timeout(2000)
  b=page.get_by_role('button',name='Kész',exact=True); print('Kész buttons',await b.count()); await b.first.click(); await page.wait_for_timeout(1200)
  print('WRITE attempts (blocked):',writes, '| error toast', 'Mentési hiba' in await page.locator('body').inner_text())
  # Következő teendő gomb fülváltás
  await page.evaluate('(p)=>window.goTest(p)',f'/projects/{P1}'); await page.wait_for_timeout(1500)
  await page.get_by_role('button',name='Feladatok megnyitása').click(); await page.wait_for_timeout(500)
  print('Next action opens tasks tab:', await page.get_by_role('tab',name='Feladatok',exact=False).get_attribute('data-state'))
  print('pageerrors',errors)
  await browser.close()
asyncio.run(main())
