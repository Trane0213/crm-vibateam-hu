# 1. szakasz – Marketing→Sales folyamat, 19:21 UTC

## Meglévő működés ellenőrzése
- MarketingWorkspace: companies/contacts/leads/users_profile olvasás; új leads sor `status=new`, választott `assigned_to`; mentett azonosság visszaolvasása, majd meglévő hitelesített company_set_marketing_status és cég-visszaolvasás.
- canSubmitHandoff: összefoglaló, csatorna és felelős kötelező; nyitott ügy mellett külön projektlehetőség megerősítése, mentés közben tiltás. Checklist vizuális sorrend, nem új DB-feltétel.
- Átadás nem teljes lead+cég atomikus tranzakció; a korábbi részleges eredmény a meglévő komponensben megtartott leadet ellenőrzi újra. Ezt nem változtattuk; tartós receipt korábbi hiánya megmarad.

## Tényleges UI-változás
- WorkNavigation: mindkét szerepkörben összecsukható, háromlépéses meglévő munkafolyamat és meglévő oldalakra mutató linkek.
- Marketing sorrend: ügyfél/kontakt → csatorna/összefoglaló/előzmények → nyitott ügyek és felelős ellenőrzése → megerősített átadás.
- Sales sorrend: saját átvett ügy → aktivitás/határidős következő lépés → külön Pipeline-léptetés → ajánlat/utánkövetés.
- Átadás ellenőrzése gomb nem ment és nem küld. Megerősítés új értékesítési ügyet hoz létre a felelősnek, nem ajánlatot/projektet, nem automatikus Pipeline-t.
- Marketing-workflow korábbi téves „átkerült a sales pipeline-ba” szövege javítva. Ügyfélbetöltés státusz, hiba/hiány és Újrapróbálás; átadási hiba az ablakban marad.
- Fájlok: work-navigation.tsx, marketing-workflow.ts, workflow-checklist.tsx, marketing-workspace.tsx; marketing/AGENTS szabály.

## Teszt és korlát
- 779/779 Vitest, 78 fájl PASS; változatlan handoff-guard regresszió; harness build OK.
- Eredeti útvonalak elkülönített TESZT-válaszokkal, külső írás blokkolva: korábbi marketinges emails/calls/contacts/customers/campaign-list/leads és Sales emails regresszió PASS; új Marketing/Sales folyamat nyitása 1440/390 PASS, képernyőképek ellenőrizve, nincs pageerror/oldaltúlfutás.
- Valódi hitelesített átadás/CRM/Gmail/R2 és visszaolvasás **NEM TESZTELT** (`external_unmanaged`). Az új átadási ablak teljes UI-próbája és minden oldal teljes visszajelzésleltára nem készült el; 1. szakasz RÉSZBEN KÉSZ.
- Üzleti szabály/DB/RLS/Sales/AI/küldés változatlan; nincs éles adatírás/import/küldés/publikálás. STOP.