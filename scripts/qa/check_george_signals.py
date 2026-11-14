import asyncio,json,base64,re
from pathlib import Path
from playwright.async_api import async_playwright
OUT=Path('/tmp/browser/george/shots'); OUT.mkdir(parents=True, exist_ok=True)
# Izolált TESZT-próba (George szervezeti jelzések): kitalált TESZT-sorok, minden írás 403-mal blokkolva; nem éles munkamenet, nem valódi RLS.
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

import json as _j
ORG=_j.load(open('/tmp/browser/george/fixture.json'))
REVIEW={'config':{'id':1,'enabled':False,'daily_review_limit':6,'daily_token_limit':1500000,'max_reviews_per_run':1,'paused_reason':None,'paused_at':None,'approved_by':None,'approved_at':None,'updated_at':'2026-11-13T20:00:00Z'},'usage':{'reviewsToday':0,'tokensToday':0},'runs':[],'signals':[],'perModel':{}}
I2='cccccccc-cccc-4ccc-8ccc-cccccccccc02'
ISSUES={'rows':[{'id':I2,'reporter_id':'TESZT-pm','reporter_role':'project_manager','created_at':'2026-11-12T10:00:00Z','page_path':'/quotes/x','category':'ux','description':'TESZT nehezen található gomb','expected_result':'TESZT','actual_result':'TESZT','technical_code':'','status':'new','owner_note':'','updated_at':'2026-11-12T10:00:00Z','ai_specialist':None,'ai_analysis':None,'ai_evidence':None,'ai_analyzed_at':None,'ai_run_count':0,'reporter_verdict':None,'reporter_feedback':None,'reporter_verdict_at':None}],'total':1,'owner':True,'me':'TESZT-user'}
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True)
  page=await browser.new_page(viewport={'width':1280,'height':1800})
  errors=[]; page.on('pageerror',lambda e:errors.append(str(e)[:300]))
  writes=[]; fns=[]
  await page.goto('http://localhost:8080/auth',wait_until='networkidle')
  await page.evaluate(f'''async()=>{{const {{toCrossJSON}}=await import('/node_modules/seroval/dist/dev/index.js'); window.encodeRpc=x=>JSON.stringify(toCrossJSON({{result:x,error:undefined,context:{{}}}}));}}''')
  enc={'facts':await page.evaluate('(x)=>window.encodeRpc(x)',FACTS),'org':await page.evaluate('(x)=>window.encodeRpc(x)',ORG),'review':await page.evaluate('(x)=>window.encodeRpc(x)',REVIEW),'issues':await page.evaluate('(x)=>window.encodeRpc(x)',ISSUES),'findings':await page.evaluate('(x)=>window.encodeRpc(x)',[])}
  async def intercept(route):
   req=route.request;url=req.url
   if '/_serverFn/' in url:
    try: name=json.loads(base64.urlsafe_b64decode(url.split('/_serverFn/')[1].split('?')[0]+'===')).get('export','')
    except Exception: name='unknown'
    fns.append(name)
    H={'x-tss-serialized':'true'}
    for key,fn in [('facts','ownerReportOverview'),('org','georgeOrgSignals'),('review','aiReviewOverview'),('issues','listIssues'),('findings','listIssueFindings')]:
     if fn in name: return await route.fulfill(status=200,content_type='application/json',headers=H,body=enc[key])
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
  async def shot(name): await page.screenshot(path=str(OUT/(name+'.png')))
  for w,h,tag in [(1280,1800,'desktop'),(390,844,'mobile')]:
   await page.set_viewport_size({'width':w,'height':h})
   await page.evaluate('(p)=>window.goTest(p)','/settings/ai-review'); await page.wait_for_timeout(3000)
   txt=await page.locator('body').inner_text()
   card=page.locator('#george-jelzesek')
   print(tag,'panel', await card.count(), '| summary', 'Nyitott: 5' in txt and 'Ellenőrizendő: 3' in txt and 'Súlyos nyitott: 1' in txt, '| 0 AI', 'AI-hívás: 0 · írás: 0' in txt)
   lst=await page.get_by_role('list',name='George szervezeti jelzései').inner_text() if await card.count() else ''
   order=[x for x in ['TESZT ajánlat bizonyíték nélkül','Hiányos Sales→PM átadás: TESZT Árnyas utca','Hiányos projekt-alapadatok: TESZT Lépcsőház','Sales-ügy teendője elmaradt','Lejárt projektteendő: TESZT Lépcsőház','Ismétlődő UX-panasz: /quotes/:id','14 bizonytalan cégegyezés','39 vitatott levélszál','működési hiba: /tasks'] if x in lst]
   print(tag,'items', len(order),'/9 | order ok', [lst.index(x) for x in order]==sorted(lst.index(x) for x in order))
   print(tag,'evidence labels', 'Tény (forrásrekord igazolja)' in lst, 'Dolgozói jelzés — nem igazolt' in lst, 'Javítandó hiba (tulajdonosi besorolás)' in lst, '| names', 'TESZT Projektvezető' in lst and 'TESZT Értékesítő' in lst, '| next action', lst.upper().count('KÖVETKEZŐ TEENDŐ'))
   print(tag,'overflow', await page.evaluate('document.documentElement.scrollWidth>innerWidth'))
   await shot('ai-review-'+tag)
   if tag=='mobile':
    await card.scroll_into_view_if_needed(); await page.evaluate("document.getElementById('george-jelzesek').scrollIntoView()"); await page.wait_for_timeout(300); await shot('ai-review-mobile-panel')
  await page.set_viewport_size({'width':1280,'height':1800})
  await page.evaluate('(p)=>window.goTest(p)','/settings/ai-review'); await page.wait_for_timeout(2500)
  await page.get_by_role('group',name='Szűrés állapot szerint').get_by_role('button',name=re.compile('^Ellenőrizendő')).click(); await page.wait_for_timeout(500)
  lst=await page.get_by_role('list',name='George szervezeti jelzései').inner_text()
  print('filter verify only', 'Ismétlődő UX-panasz' in lst and 'TESZT ajánlat bizonyíték nélkül' not in lst)
  await page.get_by_role('group',name='Szűrés állapot szerint').get_by_role('button',name=re.compile('^Mind')).click(); await page.wait_for_timeout(300)
  first=page.get_by_role('list',name='George szervezeti jelzései').locator('li').filter(has_text='Sales-ügy teendője elmaradt').first
  await first.locator('summary').click(); await page.wait_for_timeout(300)
  t=await first.inner_text()
  print('merged lead item sources', 'leads:' in t and 'followups:' in t and 'ai_review_signals:' in t, '| 3x', '3×' in t, '| test hint', 'Ellenőrzési / tesztjavaslat' in t)
  await first.screenshot(path=str(OUT/'lead-item.png'))
  links=await page.eval_on_selector_all('#george-jelzesek a[href]','els=>els.map(e=>e.getAttribute("href"))')
  print('links: handover tab', any('/projects/aaaaaaaa' in l and 'tab=handover' in l for l in links), '| quote', '/quotes/q-unproven' in links, '| issue deeplink', any(l.startswith('/help?') and 'issue=' in l for l in links), '| import', '/import-review' in links)
  cov=page.locator('#george-jelzesek details').filter(has_text='Forráslefedettség').last
  await cov.locator('summary').first.click(); await page.wait_for_timeout(300); ct=await cov.inner_text()
  print('coverage NINCS ADAT', 'NINCS ADAT' in ct and 'Billingo' in ct and 'TIG' in ct, '| collector off', 'KIKAPCSOLVA' in ct)
  await page.evaluate('(p)=>window.goTest(p)','/help?issue='+I2); await page.wait_for_timeout(2500)
  op=await page.evaluate("(id)=>{const d=document.getElementById('issue-'+id);return d?d.open:null}", I2)
  print('HELP deeplink open', op)
  await shot('help-deeplink')
  await page.evaluate('(p)=>window.goTest(p)','/today'); await page.wait_for_timeout(3000)
  g=await page.get_by_role('region',name='George').inner_text() if await page.get_by_role('region',name='George').count() else ''
  print('TODAY George line', 'Szervezeti jelzések: 5 nyitott, 3 ellenőrizendő' in g, '| handoff', '2 hiányos Sales→PM átadás' in g)
  await page.get_by_role('region',name='George').screenshot(path=str(OUT/'today-george.png'))
  print('server fns', sorted(set(fns)), '| WRITE attempts', writes, '| pageerrors', errors)
  await browser.close()
asyncio.run(main())
