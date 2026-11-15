# Izolált TESZT-végigpróba az új Sales/Marketing munkaterületen (/munka).
# Kitalált TESZT-adatok, szimulált Supabase- és szerverválaszok; minden írás, Gmail-küldés és
# külső hívás tiltott (403) — nem éles munkamenet és nem valódi RLS. Futtatás: python3 check_workspace_v2.py sales|marketing|owner
import asyncio, json, base64, re, sys, urllib.parse, urllib.request
from pathlib import Path
from playwright.async_api import async_playwright
ROLE = sys.argv[1] if len(sys.argv) > 1 else 'sales'
MOBILE = len(sys.argv) > 2 and sys.argv[2] == 'mobile'
OUT = Path('/tmp/browser/ws2/shots'); OUT.mkdir(parents=True, exist_ok=True)
_src = urllib.request.urlopen('http://localhost:8080/src/components/today/pm-home.tsx').read().decode()
_rt = urllib.request.urlopen('http://localhost:8080/src/router.tsx').read().decode()
def _u(pat, src): return re.search(r'"((?:/@fs/[^"]*)?/node_modules/[^"]*' + pat + r'[^"]*)"', src).group(1)
REACT = _u(r'\.vite/deps/react\.js', _src); RQ = _u('tanstack_react-query', _rt); RR = _u('react-router/dist/esm/index.dev.js', _rt)
RDC = REACT.replace('react.js', 'react-dom_client.js'); SEROVAL = REACT.replace('react.js', 'seroval.js')
UID = {'owner': 'TESZT-owner', 'sales': 'TESZT-sales', 'marketing': 'TESZT-mkt'}[ROLE]
C1 = 'c0c0c0c0-0000-4000-8000-000000000001'; K1 = 'c0c0c0c0-0000-4000-8000-000000000002'
L1 = 'c0c0c0c0-0000-4000-8000-000000000003'; L2 = 'c0c0c0c0-0000-4000-8000-000000000004'
Q1 = 'c0c0c0c0-0000-4000-8000-000000000005'; P1 = 'c0c0c0c0-0000-4000-8000-000000000006'
W1 = 'c0c0c0c0-0000-4000-8000-000000000007'; CA1 = 'c0c0c0c0-0000-4000-8000-000000000008'
T1 = 'c0c0c0c0-0000-4000-8000-000000000009'; TK1 = 'c0c0c0c0-0000-4000-8000-00000000000a'
NOW = '2026-11-15T09:00:00Z'
DB = {
 'companies': [{'id': C1, 'name': 'TESZT Villamos Kft', 'company_type': 'company', 'tax_number': None, 'website': 'https://example.invalid', 'notes': None, 'marketing_status': 'contacted', 'marketing_status_changed_at': NOW, 'marketing_status_changed_by': UID, 'marketing_status_source': 'manual', 'marketing_handoff_lead_id': None, 'marketing_blocked': False, 'created_at': NOW, 'email': None, 'phone': None, 'city': None}],
 'contacts': [{'id': K1, 'name': 'TESZT Elek', 'email': 'teszt.elek@example.invalid', 'phone': '+36000000', 'position': 'ügyvezető', 'company_id': C1, 'email_invalid': False, 'verification_state': 'unverified', 'created_at': NOW}],
 'leads': [
  {'id': L1, 'status': 'quote_sent', 'summary': 'TESZT csarnok villamos felújítás', 'company_id': C1, 'contact_id': K1, 'assigned_to': UID, 'source': 'manual', 'pipeline_entered_at': '2026-11-10T09:00:00Z', 'next_step_type': 'call', 'next_step_due_at': '2026-11-14T09:00:00Z', 'next_step_note': 'TESZT visszahívás', 'created_at': '2026-11-01T09:00:00Z', 'updated_at': NOW, 'won_at': None, 'lost_at': None, 'companies': {'name': 'TESZT Villamos Kft'}},
  {'id': L2, 'status': 'new', 'summary': 'TESZT új érdeklődés – társasház', 'company_id': C1, 'contact_id': K1, 'assigned_to': UID, 'source': 'manual', 'pipeline_entered_at': None, 'next_step_type': 'call', 'next_step_due_at': '2026-11-15T10:00:00Z', 'next_step_note': None, 'created_at': '2026-11-12T09:00:00Z', 'updated_at': NOW, 'won_at': None, 'lost_at': None, 'companies': {'name': 'TESZT Villamos Kft'}}],
 'quotes': [{'id': Q1, 'title': 'TESZT csarnok ajánlat', 'status': 'draft', 'quote_kind': 'received_budget', 'scope_type': 'labor_only', 'contact_id': K1, 'lead_id': L1, 'project_id': None, 'version': 1, 'is_current': True, 'group_id': Q1, 'alternative_key': 'A', 'created_at': NOW, 'created_by': UID, 'responsible_user_id': UID, 'tax_percent': 27, 'discount_percent': 0, 'manual_net_amount': None, 'total_amount': 0, 'locked_at': None, 'valid_until': None, 'notes': None, 'sent_at': None}],
 'projects': [{'id': P1, 'title': 'TESZT korábbi projekt', 'status': 'in_progress', 'deadline': '2026-12-20', 'start_date': '2026-11-01', 'address': None, 'handoff_at': None, 'company_id': C1, 'lead_id': None, 'project_manager_user_id': None, 'created_at': NOW, 'companies': {'name': 'TESZT Villamos Kft'}}],
 'email_threads': [{'id': T1, 'subject': 'TESZT ajánlatkérés csarnok', 'company_id': C1, 'project_id': None, 'lead_id': L1, 'last_message_at': NOW, 'created_at': NOW}],
 'emails': [{'id': 'e1', 'thread_id': T1, 'subject': 'TESZT ajánlatkérés csarnok', 'from_email': 'teszt.elek@example.invalid', 'to_email': 'test@example.invalid', 'body_text': 'TESZT levél', 'sent_at': NOW, 'direction': 'inbound', 'created_at': NOW}],
 'tasks': [{'id': TK1, 'title': 'TESZT saját feladat', 'status': 'open', 'due_date': '2026-11-15', 'assigned_to': UID}],
}
def filt(table, qs):
  rows = list(DB.get(table, []))
  for k, vs in qs.items():
    if k in ('select', 'order', 'limit', 'offset', 'or', 'and', 'columns', 'on_conflict'): continue
    v = vs[0]
    if v.startswith('eq.'): rows = [r for r in rows if str(r.get(k)).lower() == v[3:].lower()]
    elif v == 'is.null': rows = [r for r in rows if r.get(k) is None]
    elif v.startswith('in.('): vals = v[4:-1].replace('"', '').split(','); rows = [r for r in rows if str(r.get(k)) in vals]
  return rows
FN = {
 'getMarketingDaily': {'partial': False, 'callbacks': [], 'tasks': [{'id': TK1, 'title': 'TESZT saját feladat', 'bucket': 'today', 'due_date': '2026-11-15'}], 'missing_contacts': [], 'to_contact': [{'id': C1, 'name': 'TESZT Villamos Kft', 'contact_state': {'email_available': True, 'phone_available': True}}], 'followups': [], 'reply_pending': [], 'awaiting_reply': [], 'qualified': [], 'contact_warnings': [], 'mail': {'rate': 0, 'replied': 0, 'contacted': 0}},
 'listCampaignDrafts': {'role': ROLE, 'userId': UID, 'campaigns': [{'id': CA1, 'name': 'TESZT őszi kampány', 'status': 'draft', 'updated_at': NOW, 'created_at': NOW, 'subject': None, 'body': None, 'prechecked_at': None, 'scheduled_at': None, 'archived_at': None, 'recipient_count': 0}]},
 'listQuoteRequests': [{'id': W1, 'name': 'TESZT Érdeklődő', 'email': 'teszt.erd@example.invalid', 'phone': None, 'project_type': 'lakossági', 'message': 'TESZT üzenet', 'attachment_url': None, 'created_at': NOW, 'form_type': 'general', 'property_type': None, 'budget': None, 'company_name': 'TESZT Társasház', 'apartment_count': None, 'consent': True, 'source_created_at': NOW}],
 'getMailboxes': [{'userId': UID, 'email': 'teszt-' + ROLE + '@example.invalid', 'name': 'TESZT', 'active': True, 'authError': False, 'lastSync': NOW}],
 'getMailboxPage': {'rows': [{'thread_id': T1, 'subject': 'TESZT ajánlatkérés csarnok', 'sort_date': NOW, 'from_email': 'teszt.elek@example.invalid', 'to_email': 'teszt@example.invalid', 'snippet': 'TESZT', 'outbound': False, 'unread': True, 'waiting': True, 'has_attachments': False, 'message_count': 1, 'company_name': 'TESZT Villamos Kft', 'project_name': None, 'unknown_labels': False, 'mailboxes': []}], 'total': 1, 'counts': {k: 1 for k in ['inbox', 'sent', 'waiting', 'auto', 'all', 'unread', 'unknown', 'messages']}},
 'getMonthlyTargets': {'canEdit': ROLE == 'owner', 'sales': None, 'marketing': None},
 'readWebsiteIntake': {'kind': 'uncertain', 'reason': 'TESZT: nincs mentett felvétel.'},
}
FN['getQuoteRequest'] = FN['listQuoteRequests'][0]
async def main():
  async with async_playwright() as p:
    browser = await p.chromium.launch(headless=True)
    ctx = await browser.new_context(viewport={'width': 1280, 'height': 1800})
    page = await ctx.new_page()
    errors, writes, fncalls, blocked = [], [], [], []
    page.on('pageerror', lambda e: errors.append(str(e)[:300]))
    async def intercept(route):
      req = route.request; url = req.url
      if '/api/gmail/send' in url: blocked.append('gmail'); return await route.fulfill(status=403, body='blocked')
      if '/_serverFn/' in url:
        try: name = json.loads(base64.urlsafe_b64decode(url.split('/_serverFn/')[1].split('?')[0] + '===')).get('export', '')
        except Exception: name = 'unknown'
        fncalls.append(name)
        key = next((k for k in FN if k in name), None)
        if key is None:
          short = name.split('_createServerFn')[0]
          if re.match(r'^(save|create|set|send|run|record|import|delete|update|mark|link|claim|finish|approve)', short, re.I): writes.append('fn ' + short)
          return await route.fulfill(status=503, content_type='text/plain', body='Isolated test: unavailable')
        body = await page.evaluate('(x)=>window.encodeRpc(x)', FN[key])
        return await route.fulfill(status=200, content_type='application/json', headers={'x-tss-serialized': 'true'}, body=body)
      if '/rest/v1/' in url:
        path = url.split('/rest/v1/')[1]; table = path.split('?')[0]
        if table.startswith('rpc/'):
          fn = table[4:]
          if not re.match(r'^(crm_role_of|is_|has_|can_|crm_record_search|crm_mailbox|current_profile_id|company_marketing_audit|crm_notification_source_visible|knowledge_search)', fn): writes.append('rpc ' + fn)
          val = ROLE if fn == 'crm_role_of' else (ROLE == 'owner') if fn in ('is_owner_role', 'has_role') else []
          return await route.fulfill(status=200, content_type='application/json', body=json.dumps(val))
        if req.method in ('POST', 'PATCH', 'PUT', 'DELETE'):
          writes.append(req.method + ' ' + table); return await route.fulfill(status=403, content_type='application/json', body=json.dumps({'message': 'Isolated test: writes blocked', 'code': '42501'}))
        qs = urllib.parse.parse_qs(urllib.parse.urlsplit(url).query)
        single = 'application/vnd.pgrst.object' in req.headers.get('accept', '')
        if table == 'users_profile': body = [{'id': UID + '-p', 'auth_user_id': UID, 'full_name': 'TESZT ' + ROLE, 'email': 'test@example.invalid', 'gmail_email': 'teszt-' + ROLE + '@example.invalid', 'active': True, 'role_id': 'r', 'roles': {'name': ROLE}}]
        elif table == 'agent_role_access': body = [{'agent_id': a, 'can_view': True} for a in ['crm', 'sales', 'pm', 'marketing']]
        else: body = filt(table, qs)
        n = len(body)
        if single: body = body[0] if body else None
        hdr = {'content-range': f'0-{max(n-1,0)}/{n}', 'access-control-expose-headers': 'content-range', 'access-control-allow-origin': '*'}
        if req.method == 'HEAD': return await route.fulfill(status=200, headers=hdr, body='')
        return await route.fulfill(status=200, content_type='application/json', headers=hdr, body=json.dumps(body))
      if 'supabase.co' in url: return await route.fulfill(status=403, body='blocked')
      await route.continue_()
    await page.route('**/*', intercept)
    await page.route('**/isolated-check', lambda r: r.fulfill(content_type='text/html', body='<html><head></head><body></body></html>'))
    await page.goto('http://localhost:8080/isolated-check', wait_until='domcontentloaded')
    await page.evaluate(f'''async()=>{{
      const {{toCrossJSON}}=await import('{SEROVAL}'); window.encodeRpc=x=>JSON.stringify(toCrossJSON({{result:x,error:undefined,context:{{}}}}));
      const RefreshRuntime=(await import('/@react-refresh')).default;RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{{}};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;
      const R=(await import('{REACT}')).default; const D=(await import('{RDC}')).default;
      const {{Outlet,RouterProvider}}=await import('{RR}');
      const {{supabase}}=await import('/src/integrations/supabase/client.ts');
      const session={{access_token:'TESZT.not-a-real.token',user:{{id:'{UID}',email:'test@example.invalid'}}}};
      supabase.auth.getSession=async()=>({{data:{{session}},error:null}});supabase.auth.getUser=async()=>({{data:{{user:session.user}},error:null}});supabase.auth.onAuthStateChange=()=>({{data:{{subscription:{{unsubscribe(){{}}}}}}}});
      supabase.channel=()=>({{on(){{return this}},subscribe(){{return this}},unsubscribe(){{}}}});supabase.removeChannel=()=>{{}};
      const {{getRouter}}=await import('/src/router.tsx');const {{QueryClientProvider}}=await import('{RQ}');
      window.history.replaceState(null,'','/munka');window.testRouter=getRouter();window.testRouter.routeTree.options.shellComponent=undefined;window.testRouter.routeTree.options.component=()=>R.createElement(QueryClientProvider,{{client:window.testRouter.options.context.queryClient}},R.createElement(Outlet));
      const link=document.createElement('link');link.rel='stylesheet';link.href='/src/styles.css';document.head.appendChild(link);
      window.testRouter.options.context.queryClient.setDefaultOptions({{queries:{{retry:false}}}});
      window.visited=[]; window.testRouter.subscribe('onResolved',(e)=>window.visited.push(e.toLocation.pathname));
      const host=document.createElement('div');document.body.replaceChildren(host);
      D.createRoot(host).render(R.createElement(RouterProvider,{{router:window.testRouter}}));
      window.goTest=async(path)=>{{await window.testRouter.navigate({{href:path}});}};
    }}''')
    await page.wait_for_timeout(3000)
    if MOBILE: await page.set_viewport_size({'width': 390, 'height': 844})
    path = lambda: page.evaluate('location.pathname + location.search')
    go = lambda p_: page.evaluate('(p)=>window.goTest(p)', p_)
    results = []
    def rec(step, ok, detail=''):
      results.append((step, ok, detail)); print(('PASS ' if ok else 'FAIL ') + ROLE + ' | ' + step + (' | ' + detail if detail else ''))
    async def legacy_links(label):
      hrefs = await page.evaluate("""[...document.querySelectorAll('a[href]')].filter(a=>!a.closest('[aria-label="Felület váltása"]')).map(a=>[a.getAttribute('href'),(a.innerText||a.getAttribute('aria-label')||'').trim().slice(0,40)])""")
      bad = [h for h in hrefs if h[0].startswith('/') and not h[0].startswith('/munka') and '/print' not in h[0]]
      rec(f'{label}: nincs régi felületre mutató hivatkozás', not bad, json.dumps(bad, ensure_ascii=False)[:300] if bad else '')
    async def shell_check(label):
      legacy = await (page.get_by_role('button', name='Továbbiak') if MOBILE else page.locator('[data-sidebar="sidebar"]')).count()
      navs = await page.get_by_role('navigation', name='Munkaterület').count()
      ovf = await page.evaluate('document.documentElement.scrollWidth>innerWidth')
      rec(f'{label}: önálló keret, régi menü nélkül' + (' (mobil, nincs vízszintes kilógás)' if MOBILE else ''), legacy == 0 and navs >= 1 and not (MOBILE and ovf), f'régi oldalsáv={legacy}, munkaterület-menü={navs}, kilógás={ovf}')
    async def click_and_expect(locator, expect_prefix, label, wait=2500):
      if await locator.count() == 0: rec(label, False, 'elem nem található'); return False
      await locator.first.click(); await page.wait_for_timeout(wait)
      cur = await path(); ok = cur.startswith(expect_prefix); rec(label, ok, cur); return ok
    async def assistant(label, agent_name):
      btns = page.get_by_role('region', name=f'{agent_name} segítsége').get_by_role('button')
      if await btns.count() == 0: rec(f'{label}: {agent_name} az ügyön belül', False, 'nincs ügyön belüli asszisztens'); return
      await btns.first.click(); await page.wait_for_timeout(1200); await page.screenshot(path=str(OUT / f'{ROLE}{"-m" if MOBILE else ""}-ai-{label[:6]}.png'))
      val = await page.evaluate("[...document.querySelectorAll('textarea')].map(t=>t.value).join('')")
      rec(f'{label}: {agent_name} az ügyön belül, előtöltött kéréssel, a képernyő elhagyása nélkül', len(val) > 10 and (await path()).startswith('/munka'), (await path()))
      close = page.get_by_role('button', name='Bezárás')
      if await close.count(): await close.first.click(); await page.wait_for_timeout(300)

    start = await path()
    if ROLE in ('sales', 'owner'):
      rec('Belépés: /munka → Sales Ma', start.startswith('/munka/sales/ma'), start)
      await shell_check('Sales Ma'); await page.screenshot(path=str(OUT / f'{ROLE}{"-m" if MOBILE else ""}-1-ma.png'))
      await legacy_links('Sales Ma')
      await click_and_expect(page.locator('main a[href^="/munka/ugy/"]'), '/munka/ugy/', 'Sales Ma teendő → ügy munkalapja')
      await page.screenshot(path=str(OUT / f'{ROLE}{"-m" if MOBILE else ""}-2-ugy.png'))
      await legacy_links('Ügy munkalap'); await assistant('Ügy', 'Timothy')
      await click_and_expect(page.locator('main a[href^="/munka/sales/ajanlat/"]'), '/munka/sales/ajanlat/', 'Ügy → ajánlat megnyitása')
      await page.wait_for_timeout(1500); await page.screenshot(path=str(OUT / f'{ROLE}{"-m" if MOBILE else ""}-3-ajanlat.png'))
      await legacy_links('Ajánlat')
      # Egy nézet, négy lépés; a kiküldés ablakában válasz/új levél és kötelező utánkövetés.
      tabs = await page.get_by_role('tab').all_inner_texts()
      rec('Ajánlat: egy nézet, négy lépés', [t.strip() for t in tabs][:4] == ['1. Ügyfél és dokumentumok', '2. Árazás', '3. Ügyfélnek szóló ajánlat', '4. Kiküldés és utánkövetés'], json.dumps(tabs, ensure_ascii=False))
      rec('Ajánlat: nincs nézetváltó gomb', await page.get_by_role('button', name=re.compile('Egyszerűsített nézet|Részletes nézet')).count() == 0)
      for i, t in enumerate(['2. Árazás', '3. Ügyfélnek szóló ajánlat', '4. Kiküldés és utánkövetés']):
        await page.get_by_role('tab', name=t).click(); await page.wait_for_timeout(700)
        await page.screenshot(path=str(OUT / f'{ROLE}{"-m" if MOBILE else ""}-3{"bcd"[i]}-ajanlat.png'))
      send_btn = page.get_by_role('button', name='Küldés CRM-ből')
      if await send_btn.count() and await send_btn.first.is_enabled():
        await send_btn.first.click(); await page.wait_for_timeout(1500)
        dlg = page.get_by_role('dialog')
        rec('Kiküldés: választható válasz a szálban / új levél', await dlg.get_by_text('Válasz az ügyfél eredeti levélszálában').count() == 1 and await dlg.get_by_text('Új e-mail').count() == 1)
        rec('Kiküldés: utánkövetés nélkül a Küldés gomb tiltott', await dlg.get_by_role('button', name='Küldés', exact=True).is_disabled())
        await page.screenshot(path=str(OUT / f'{ROLE}{"-m" if MOBILE else ""}-3e-kuldes.png'))
        await page.keyboard.press('Escape'); await page.wait_for_timeout(300)
      else: rec('Kiküldés: párbeszéd megnyitható', False, 'nincs saját Gmail a tesztfiókban vagy a gomb hiányzik')
      await page.get_by_role('tab', name='1. Ügyfél és dokumentumok').click(); await page.wait_for_timeout(300)
      await click_and_expect(page.locator('main a[href^="/munka/ugyfel/"]'), '/munka/ugyfel/', 'Ajánlat → ügyféladatlap')
      await page.screenshot(path=str(OUT / f'{ROLE}{"-m" if MOBILE else ""}-4-ugyfel.png'))
      await legacy_links('Ügyféladatlap'); await assistant('Ügyféladatlap', 'Timothy')
      await go('/munka/sales/pipeline'); await page.wait_for_timeout(2500)
      await shell_check('Pipeline'); await legacy_links('Pipeline')
      if MOBILE:
        tab = page.get_by_role('tab', name=re.compile('Ajánlat kiadva'))
        if await tab.count(): await tab.first.click(); await page.wait_for_timeout(400)
      card = page.locator('main [data-lead]:visible > *')
      await click_and_expect(card, '/munka/ugy/', 'Pipeline kártya → ügy munkalapja')
      await go('/munka/sales/ajanlatok'); await page.wait_for_timeout(2000); await legacy_links('Ajánlatok')
      await click_and_expect(page.locator('main a[href^="/munka/sales/ajanlat/"]'), '/munka/sales/ajanlat/', 'Ajánlatlista → ajánlat')
    if ROLE in ('marketing', 'owner'):
      if ROLE == 'marketing': rec('Belépés: /munka → Marketing Ma', start.startswith('/munka/marketing/ma'), start)
      await go('/munka/marketing/ma'); await page.wait_for_timeout(2500)
      await shell_check('Marketing Ma'); await page.screenshot(path=str(OUT / f'{ROLE}{"-m" if MOBILE else ""}-5-mma.png')); await legacy_links('Marketing Ma')
      rec('Marketing Ma: saját feladat helyben zárható', await page.get_by_role('button', name='Kész').count() > 0)
      await click_and_expect(page.locator('main a[href^="/munka/ugyfel/"]'), '/munka/ugyfel/', 'Marketing teendő → ügyféladatlap')
      await page.wait_for_timeout(1500); await page.screenshot(path=str(OUT / f'{ROLE}{"-m" if MOBILE else ""}-6-mugyfel.png'))
      await legacy_links('Marketing ügyféladatlap')
      if ROLE == 'marketing': await assistant('Marketing ügyféladatlap', 'Scarlet')
      await go('/munka/marketing/erdeklodok'); await page.wait_for_timeout(2000); await legacy_links('Érdeklődők')
      await page.get_by_role('button', name='TESZT elrejtése').click(); await page.wait_for_timeout(300)
      await click_and_expect(page.locator('main a[href^="/munka/marketing/erdeklodo/"]'), '/munka/marketing/erdeklodo/', 'Érdeklődő → adatlap és CRM-be vétel')
      await page.screenshot(path=str(OUT / f'{ROLE}{"-m" if MOBILE else ""}-7-erdeklodo.png')); await legacy_links('Érdeklődő adatlap'); await assistant('Érdeklődő', 'Scarlet')
      await go('/munka/marketing/kampanyok'); await page.wait_for_timeout(2000); await legacy_links('Kampányok')
      await click_and_expect(page.locator('main a[href*="/munka/marketing/kampany?"]'), '/munka/marketing/kampany', 'Kampány → szerkesztő')
      await page.wait_for_timeout(1500); await page.screenshot(path=str(OUT / f'{ROLE}{"-m" if MOBILE else ""}-8-kampany.png')); await legacy_links('Kampányszerkesztő'); await assistant('Kampány', 'Scarlet')
    await go('/munka/levelezes'); await page.wait_for_timeout(2500); await shell_check('Levelezés'); await legacy_links('Levelezés')
    await click_and_expect(page.locator('main a[href^="/munka/levelezes/"]'), '/munka/levelezes/', 'Levelezés → levélszál')
    await page.screenshot(path=str(OUT / f'{ROLE}{"-m" if MOBILE else ""}-9-level.png')); await legacy_links('Levélszál')
    visited = await page.evaluate('window.visited')
    # Felületváltó: a menü tetején, Fő CRM ↔ Új munkafelület (szándékos kilépés, a fenti bejárás után).
    sw = page.get_by_role('group', name='Felület váltása').filter(visible=True)
    rec('Felületváltó látható a menü tetején', await sw.count() > 0)
    if await sw.count():
      box = await sw.first.bounding_box(); rec('Felületváltó a felső részen', box is not None and box['y'] < 200, str(box and round(box['y'])))
      await sw.first.get_by_role('link', name='Fő CRM').click(); await page.wait_for_timeout(3000)
      cur = await path(); flag = await page.evaluate("Object.entries(localStorage).filter(([k])=>k.startsWith('viba.workspace-v2.')).map(([,v])=>v).join(',')")
      legacy = await (page.get_by_role('button', name='Továbbiak') if MOBILE else page.locator('[data-sidebar="sidebar"]')).count()
      rec('Fő CRM gomb → teljes régi CRM, régi menüvel', cur.startswith('/today') and legacy > 0 and flag == '0', f'{cur} oldalsáv={legacy} választás={flag}')
      await page.screenshot(path=str(OUT / f'{ROLE}{"-m" if MOBILE else ""}-10-focrm.png'))
      sw2 = page.get_by_role('group', name='Felület váltása').filter(visible=True)
      rec('Régi CRM menüjének tetején is ott a váltó', await sw2.count() > 0)
      if await sw2.count():
        await sw2.first.get_by_role('link', name='Új munkafelület').click(); await page.wait_for_timeout(3000)
        cur = await path(); flag = await page.evaluate("Object.entries(localStorage).filter(([k])=>k.startsWith('viba.workspace-v2.')).map(([,v])=>v).join(',')")
        rec('Új munkafelület gomb → vissza az egyszerűsített felületre', cur.startswith('/munka/') and flag == '1', f'{cur} választás={flag}')
      # A régi Sales Ma saját, meglévő napi összefoglaló-indítása (runDailyBriefing) nem a váltó műve.
      writes_after = [w for w in writes if 'runDailyBriefing' not in w]
      rec('A váltás nem írt adatot', not writes_after, json.dumps(writes_after)[:200])
    outside = sorted({v for v in visited if not v.startswith('/munka')})  # a felületváltó előtti bejárás
    rec('Végig az új munkaterületen maradt (egyetlen régi oldal sem nyílt meg)', not outside, ', '.join(outside))
    rec('Nem történt adatírás, küldés az új felületen', not [w for w in writes if 'runDailyBriefing' not in w] and not blocked, json.dumps(writes + blocked)[:200])
    rec('Nincs oldalhiba', not errors, ' || '.join(errors[:3]))
    json.dump({'role': ROLE, 'results': results, 'visited': visited, 'fn': sorted(set(fncalls))}, open(f'/tmp/browser/ws2/{ROLE}{"-m" if MOBILE else ""}.json', 'w'), ensure_ascii=False, indent=1)
    await browser.close()
asyncio.run(main())
