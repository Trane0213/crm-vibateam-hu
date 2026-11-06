import asyncio,json
from pathlib import Path
from playwright.async_api import async_playwright
OUT=Path('/tmp/browser/ui1')
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True)
  page=await browser.new_page(viewport={'width':1440,'height':1800})
  errors=[]; page.on('pageerror',lambda e:errors.append(str(e)))
  for path in ['/emails','/today','/dashboard','/projects','/leads','/campaign-list']:
   response=await page.goto('http://localhost:8080'+path,wait_until='networkidle')
   print('REAL SIGNED OUT',path,'status',response.status,'final',page.url,'pageerrors',len(errors))
  await page.evaluate('''async()=>{
   const {toCrossJSON}=await import('/node_modules/.vite/deps/seroval.js'); window.encodeRpc=x=>JSON.stringify(toCrossJSON({result:x,error:undefined,context:{}}));
  }''')
  boxes=[{'userId':'TESZT-user','email':'test@example.invalid','name':'TESZT','active':True,'authError':False,'lastSync':None}]
  counts={k:0 for k in ['inbox','sent','waiting','auto','all','unread','unknown','messages']}
  daily={'partial':False,'callbacks':[],'tasks':[],'missing_contacts':[],'to_contact':[],'followups':[],'reply_pending':[],'awaiting_reply':[],'contact_warnings':[],'mail':{'rate':0,'replied':0,'contacted':0}}
  encoded={k:await page.evaluate('(x)=>window.encodeRpc(x)',v) for k,v in {'boxes':boxes,'page':{'rows':[],'total':0,'counts':counts},'daily':daily,'empty':[]}.items()}
  mode={'value':'success'}; role={'value':'marketing'}; requests=[]
  async def intercept(route):
   req=route.request;url=req.url
   if '/_serverFn/' in url:
    import base64
    try: info=json.loads(base64.urlsafe_b64decode(url.split('/_serverFn/')[1].split('?')[0]+'===')); name=info.get('export','')
    except: name='unknown'
    requests.append(name)
    if 'getMailboxes' in name:
     if mode['value']=='401': return await route.fulfill(status=401,content_type='text/plain',body='Unauthorized: invalid token')
     payload=encoded['boxes']
    elif 'getMailboxPage' in name: payload=encoded['page']
    elif 'getMarketingDaily' in name: payload=encoded['daily']
    else: return await route.fulfill(status=503,content_type='text/plain',body='Isolated test: read unavailable')
    return await route.fulfill(status=200,content_type='application/json',headers={'x-tss-serialized':'true'},body=payload)
   if '/rest/v1/' in url:
    table=url.split('/rest/v1/')[1].split('?')[0]; body=[]
    if table=='users_profile':
     body=[{'id':'TESZT-profile','auth_user_id':'TESZT-user','full_name':'TESZT Munkatárs','gmail_email':'test@example.invalid','active':True,'roles':{'name':role['value']}}]
     if 'application/vnd.pgrst.object' in req.headers.get('accept',''): body=body[0]
    if table=='companies':
     if mode['value']=='marketing-error': return await route.fulfill(status=503,content_type='application/json',body=json.dumps({'message':'TESZT company read failure'}))
     body=[{'id':'TESZT-company','name':'TESZT Villamos Kft.','company_type':'general','notes':None,'created_at':'2026-11-06T10:00:00Z'},{'id':'TESZT-person','name':'TESZT Magánszemély','company_type':'maganszemely','created_at':'2026-11-06T10:00:00Z'}]
     await asyncio.sleep(.15)
    if table=='leads':
     body=[{'id':'TESZT-'+str(i),'assigned_to':'TESZT-user','status':status,'summary':'TESZT helyszíni egyeztetés '+str(i),'company_id':'TESZT-company','contact_id':'TESZT-contact','created_at':'2026-11-06T10:00:00Z','next_step_type':'phone','next_step_due_at':'2026-11-07T10:00:00Z','pipeline_entered_at':'2026-11-06T10:00:00Z'} for i,status in enumerate(['contacted','quote_prep','quote_sent','contract'])]
    if table=='projects': body=[{'id':'TESZT-project','title':'TESZT kivitelezési projekt','status':'atadas','project_manager_user_id':None}]
    if table=='tasks': body=[{'id':'TESZT-task','title':'TESZT egyeztetés','status':'open','due_date':'2026-11-07T10:00:00Z','project_id':'TESZT-project'}]
    if table=='email_campaigns': body=[{'id':'TESZT-campaign','name':'TESZT kampány','status':'draft','created_at':'2026-11-06T10:00:00Z'}]
    return await route.fulfill(status=200,content_type='application/json',headers={'content-range':'0-0/1','access-control-expose-headers':'content-range','access-control-allow-origin':'*'},body=json.dumps(body))
   if req.method in ['POST','PUT','PATCH','DELETE'] or 'supabase.co' in url: return await route.fulfill(status=403,body='Isolated test: writes and external services blocked')
   await route.continue_()
  await page.route('**/*',intercept)
  await page.route('**/isolated-check',lambda route:route.fulfill(content_type='text/html',body='<html><head></head><body></body></html>'));await page.goto('http://localhost:8080/isolated-check',wait_until='domcontentloaded')
  await page.evaluate('''async()=>{
   const RefreshRuntime=(await import('/@react-refresh')).default;RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true; const R=(await import('/node_modules/.vite/deps/react.js?v=2873d7c1')).default;
   const D=(await import('/node_modules/.vite/deps/react-dom_client.js?v=2873d7c1')).default;
   const {RouterProvider,Outlet}=await import('/node_modules/@tanstack/react-router/dist/esm/index.dev.js?v=2873d7c1');
   const {supabase}=await import('/src/integrations/supabase/client.ts');
   const session={access_token:'TESZT.not-a-real.token',user:{id:'TESZT-user',email:'test@example.invalid'}};
   supabase.auth.getSession=async()=>({data:{session},error:null});supabase.auth.onAuthStateChange=()=>({data:{subscription:{unsubscribe(){}}}});
   const {getRouter}=await import('/src/router.tsx');const {QueryClientProvider}=await import('/node_modules/.vite/deps/@tanstack_react-query.js?v=2873d7c1');window.history.replaceState(null,'','/emails');window.testRouter=getRouter();window.testRouter.routeTree.options.shellComponent=undefined;window.testRouter.routeTree.options.component=()=>R.createElement(QueryClientProvider,{client:window.testRouter.options.context.queryClient},R.createElement(Outlet));const link=document.createElement('link');link.rel='stylesheet';link.href='/src/styles.css';document.head.appendChild(link);
   await window.testRouter.navigate({to:'/emails'});window.testRouter.options.context.queryClient.setDefaultOptions({queries:{retry:false}});
   const host=document.createElement('div');document.body.replaceChildren(host);
   D.createRoot(host).render(R.createElement(RouterProvider,{router:window.testRouter}));
   window.goTest=async(path,role)=>{await window.testRouter.navigate({to:'/auth'});const qc=window.testRouter.options.context.queryClient;qc.clear();qc.setQueryData(['users_profile','me','TESZT-user'],{id:'TESZT-profile',auth_user_id:'TESZT-user',full_name:'TESZT Munkatárs',gmail_email:'test@example.invalid',roles:{name:role}});await window.testRouter.navigate({to:path});await window.testRouter.invalidate();};
  }''')
  for path,r in [('/today','sales'),('/today','owner'),('/dashboard','owner')]:
   mode['value']='success';role['value']=r;errors.clear()
   await page.set_viewport_size({'width':1440,'height':1100})
   await page.evaluate('([path,r])=>window.goTest(path,r)',[path,r]);await page.wait_for_timeout(2200)
   text=await page.locator('body').inner_text()
   print('UI1',path,r,'crash','Az oldal nem töltődött be' in text,'errors',errors,'overflow',await page.evaluate('document.documentElement.scrollWidth>innerWidth'))
   assert not errors and 'Az oldal nem töltődött be' not in text
   await page.screenshot(path=str(OUT/(r+'-'+path.strip('/')+'-desktop.png')))
   if path=='/dashboard':
    await page.get_by_role('combobox',name='Áttekintés időszaka').click();await page.get_by_role('option',name='Utolsó 7 nap',exact=True).click();await page.wait_for_timeout(500)
    print('Period URL',page.url);assert 'Utolsó 7 nap' in await page.get_by_role('combobox',name='Áttekintés időszaka').inner_text()
   if r=='owner' and path=='/today':
    await page.get_by_role('button',name='Új ajánlat',exact=True).click();await page.get_by_role('dialog').wait_for();print('Existing quote dialog opened without write');await page.keyboard.press('Escape')
    await page.get_by_role('button',name='Továbbiak',exact=True).click();await page.get_by_role('button',name='Ügyfelek',exact=True).click();print('Sidebar group expanded',await page.get_by_role('button',name='Ügyfelek',exact=True).get_attribute('aria-expanded'));await page.get_by_role('button',name='Továbbiak',exact=True).click()
   if r=='sales':
    await page.get_by_role('link',name='TESZT Villamos Kft.').first.click();await page.wait_for_timeout(300);print('Opened lead',page.url);assert 'lead=TESZT' in page.url
    await page.evaluate('([path,r])=>window.goTest(path,r)',[path,r]);await page.wait_for_timeout(800)
   await page.set_viewport_size({'width':390,'height':844});await page.wait_for_timeout(300)
   print('MOBILE',path,r,'overflow',await page.evaluate('document.documentElement.scrollWidth>innerWidth'))
   assert not await page.evaluate('document.documentElement.scrollWidth>innerWidth')
   await page.screenshot(path=str(OUT/(r+'-'+path.strip('/')+'-mobile.png')))
  print('Mailbox calls through real transport',sum('getMailboxes' in n for n in requests),'page calls',sum('getMailboxPage' in n for n in requests))
  await browser.close()
asyncio.run(main())
