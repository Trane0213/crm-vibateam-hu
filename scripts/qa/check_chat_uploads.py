import asyncio,json,base64,re,sys,urllib.parse
from pathlib import Path
from playwright.async_api import async_playwright
OUT=Path('/tmp/browser/chat-uploads/shots'); OUT.mkdir(parents=True, exist_ok=True)
# Izolált TESZT-próba (AI chat-feltöltések szerepköri mappákban): kitalált TESZT-sorok, minden írás 403-mal blokkolva,
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
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True)
  page=await browser.new_page(viewport={'width':1280,'height':1800})
  errors=[]; page.on('pageerror',lambda e:errors.append(str(e)[:300]))
  writes=[]; fns=[]; uploads=[]; fnbodies=[]
  await page.goto('http://localhost:8080/auth',wait_until='networkidle')
  async def intercept(route):
   req=route.request;url=req.url
   if url.endswith('/api/r2-upload'):
    pd=req.post_data_buffer or b''
    fields={k:(k.encode() in pd) for k in ['linkKind','linkId','agentId']}
    fields['purpose_chat']=b'chat' in pd; fields['project_link']=b'project' in pd
    uploads.append(fields)
    folder={'owner':'owner','sales':'sales','marketing':'marketing','project_manager':'pm'}[ROLE]
    return await route.fulfill(status=200,content_type='application/json',body=json.dumps({'ok':True,'upload':{'id':'99999999-9999-4999-8999-999999999999','name':'teszt-kezirasos.jpg','folder':folder,'file_url':f'ai-chat-uploads/{folder}/{UID}/x-teszt.jpg','mime_type':'image/jpeg','size_bytes':164385,'link':({'table':'project_documents','document_id':'x','parent_id':P2} if fields['linkKind'] else None)}}))
   if '/_serverFn/' in url:
    if req.post_data: fnbodies.append(req.post_data[:6000])
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
    elif table=='agent_role_access': body=[{'agent_id':a,'can_view':True} for a in ['crm','sales','pm','marketing']]
    elif table=='ai_chat_uploads':
     own={'owner':None,'sales':'sales','marketing':'marketing','project_manager':'pm'}[ROLE]
     body=[r for r in filt(table,qs) if own is None or r['folder']==own]
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
   localStorage.setItem('viba.ai.panel.open','1');window.history.replaceState(null,'','/today');window.testRouter=getRouter();window.testRouter.routeTree.options.shellComponent=undefined;window.testRouter.routeTree.options.component=()=>R.createElement(QueryClientProvider,{{client:window.testRouter.options.context.queryClient}},R.createElement(Outlet));
   const link=document.createElement('link');link.rel='stylesheet';link.href='/src/styles.css';document.head.appendChild(link);
   window.testRouter.options.context.queryClient.setDefaultOptions({{queries:{{retry:false}}}});
   const host=document.createElement('div');document.body.replaceChildren(host);
   D.createRoot(host).render(R.createElement(RouterProvider,{{router:window.testRouter}}));
   window.goTest=async(path)=>{{await window.testRouter.navigate({{href:path}});}};
  }}''')
  await page.wait_for_timeout(2500)
  go=lambda path: page.evaluate('(p)=>window.goTest(p)',path)
  ovf=lambda: page.evaluate('document.documentElement.scrollWidth>innerWidth')
  for w,h,tag in [(1280,1800,'desktop'),(390,844,'mobile')]:
   await page.set_viewport_size({'width':w,'height':h})
   await go(f'/projects/{P2}'); await page.wait_for_timeout(3000)
   if tag=='mobile':
    # mobilon a panel nem nyílik magától: a teljes oldalas chatet nézzük
    await go('/ai-assistant'); await page.wait_for_timeout(2500)
   clip=page.get_by_role('button',name='Fájl vagy kép csatolása')
   print(ROLE,tag,'attach button',await clip.count())
   await page.get_by_role('button',name='Feltöltött fájlok (mappák)').first.click(); await page.wait_for_timeout(2000)
   sheet=page.get_by_role('dialog')
   names=await sheet.locator('ul[aria-label="Feltöltött fájlok"] li .font-medium').all_inner_texts()
   tabs=await sheet.get_by_role('tab').all_inner_texts()
   print(ROLE,tag,'FOLDER rows',names,'| tabs',tabs,'| delete btns',await sheet.get_by_role('button',name='Törlés a mappából').count(),'| overflow',await ovf())
   await page.screenshot(path=str(OUT/f'{ROLE}-folders-{tag}.png'))
   await page.keyboard.press('Escape'); await page.wait_for_timeout(600)
   await page.locator('input[type=file]').first.set_input_files('/tmp/ocr-trial/teszt-kezirasos.jpg'); await page.wait_for_timeout(1200)
   ask=page.get_by_role('dialog',name='Hova mentsem a fájlt?')
   print(ROLE,tag,'link question shown',await ask.count())
   if await ask.count():
    await page.screenshot(path=str(OUT/f'{ROLE}-link-question-{tag}.png'))
    await ask.get_by_role('button',name='Mappába és az ügyhöz is').click(); await page.wait_for_timeout(1200)
   chips=await page.locator('[aria-label="Csatolt fájlok"] span').all_inner_texts()
   print(ROLE,tag,'pending chips',chips,'| upload request',uploads[-1] if uploads else None)
   await page.get_by_role('button',name='Küldés').first.click(); await page.wait_for_timeout(2500)
   sent=[b for b in fnbodies if 'document_id=99999999' in b]
   print(ROLE,tag,'model got attachment id',bool(sent),'| key leaked to model',any('ai-chat-uploads/' in b and 'Csatolt' in b for b in sent),'| bubble chip',await page.get_by_role('button',name=re.compile('teszt-kezirasos')).count(),'| overflow',await ovf())
   await page.screenshot(path=str(OUT/f'{ROLE}-sent-{tag}.png'))
  if ROLE in ('owner','project_manager'):
   await page.set_viewport_size({'width':1280,'height':1800})
   await go('/documents?nezet=chat'); await page.wait_for_timeout(2500)
   print(ROLE,'DOCUMENTS chat tab rows',await page.locator('ul[aria-label="Feltöltött fájlok"] li').count())
   await page.screenshot(path=str(OUT/f'{ROLE}-documents-chat.png'))
  print(ROLE,'errors',errors[:3],'| writes',writes[:5])
  await browser.close()
asyncio.run(main())
