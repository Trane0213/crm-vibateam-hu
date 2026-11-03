# Timothy — bejelentkezett chat és éles naplóaudit

## Bizonyított hibák és javítások
- Ramon 17:51:21 UTC (`715c74d2-de4d-4467-a918-7b1dc8670808`) és Viktor 17:54:30 UTC (`c867df61-a637-4af6-ae54-54691b103d2d`): `crm_list_followups assigned_to=me` közvetlenül UUID oszlophoz jutott. Később sikeres olvasás történt, de a runtime a teljes modellválaszt általános végrehajtási hibára cserélte.
- Viktor bejelentkezett preview-chatjében 18:03:35 UTC ugyanaz a hiba reprodukálva (`3a6a38da-b176-4866-8cb6-562e9e87832c`).
- Javítás: felhasználói szűrőben me → hitelesített userId; hibás név/UUID elutasítás a lekérdezés előtt. Lead és projektvezető szűrő ugyanazon feloldást használja.
- Utánkövetés, projekt, feladat, találkozó korábbi limit-only listái most közös lapozást és látható darabszámot adnak. Utánkövetés/találkozó időpont validált ISO időzónával.
- Olvasási hibánál a runtime megtartja a későbbi választ egy kötelező hiányossági figyelmeztetéssel. A futás továbbra is error: lazább későbbi szűrés nem bizonyít teljes helyreállítást. Tiltott/ismeretlen vagy sikertelen írás blokkoló marad; mutáló safe eszköz nem kap automatikus retryt.
- Öt Sales-gyorskérdés régi, nem regisztrált toolokat nevezett meg. A meglévő eszközökre átirányítva; napi kérdés ugyanazt a loadDailyWork/dailySalesPrompt forrást olvassa, mint a Ma, modell/háttérfutás nélkül.
- Valós modellpróba újabb hibát mutatott: `crm_list_quotes lead_id=me`. Ez rekordazonosító, nem felhasználó; célzott tiltás és helyreállítási instrukció, saját Sales-ajánlatok RLS alatt szűrő nélkül olvasandók.
- Ajánlati nyers total_amount=0 félrevezető volt tétel nélküli ajánlatnál: model-facing adatból eltávolítva, közös amounts.net és Nincs megadva címke megmaradt. Nem változott pénzügyi szabály vagy adat.

## Igazolt ellenőrzések
- Viktor fiók saját bejelentkezésével localhost preview, élő Supabase és OpenAI modell; jelszó nem került projektfájlba vagy jelentésbe.
- Teljes chat és állandó Timothy-panel: napi kérdés tényleges `crm_sales_daily_priorities` hívás, nulla saját kiemelt teendő; a Ma ugyanazokat a nulla értékeket mutatta. Modell időnként az indokoltnál tágabban fogalmaz: lásd kockázatok.
- Saját utánkövetés: `assigned_to=me` már sikeres olvasás; DB-ben Viktorhoz 0 nyitott utánkövetés tartozott. A modell egy próbában rosszul éjfélre szűrt most helyett; instrukció célzottan pontosítva, nem általános dátumértelmezési garancia.
- Ajánlatolvasás: javítás után tényleges sikeres lekérdezés, 5 látható verzió, 4 aktív; hiányzó érték végső próbában Nincs megadva, ismert nettó 12 000 000 Ft. Korábbi verzió és linkprobléma még fennáll.
- Postafiók: tényleges `crm_email_mailboxes`; saját hozzáférhető fiók és részleges/nem élő Gmail-lefedettség jelzése helyes. Nincs szinkronindítás vagy levélküldés.
- Ismeretlen lead a panelben: tényleges `crm_get_lead`, nincs rekordadat, nincs hamis siker; nem hozzáférhető és nem létező rekord között nem bizonyított különbség.
- 417/417 Vitest (45 fájl), AI acceptance 21 forgatókönyv, 0 hiba; preview build OK. Böngészőpróbában pageerror=0.

## Tényleges registry
Sales 40, Owner 44 eszköz. Mind a bootstrap → registry → domain/agent/role metszetből felsorolva; ez elérhetőségi ellenőrzés, nem mindegyik élő végigtesztje.

CRM: memory_read, crm_search, crm_list_companies, crm_company_overview, crm_get_company, crm_list_company_contacts, crm_get_lead, crm_list_leads, crm_lead_history, crm_sales_case_review, crm_historical_unit_prices, crm_list_quotes, crm_quote_context, crm_compare_quotes, crm_list_company_email_threads, crm_list_followups, crm_sales_daily_priorities, crm_sales_watch, crm_email_mailboxes, crm_read_email_thread, crm_list_documents, crm_read_document.

Jóváhagyásos: sales_change_pipeline_status, sales_set_lead_contact, sales_create_followup, sales_update_next_step, sales_record_prep_activity, sales_mark_won_with_project; sales_send_email dangerous. Owner-only: crm_sales_assignees, sales_reassign_lead.

Tudástár: kg_get_node, kg_find_related, website_search_pages, website_list_pages, website_get_page, website_get_summary, website_search_by_entity, website_list_entities, website_get_page_history, website_get_page_diff, website_list_media. Owner-only továbbá kg_stats, website_crawl_status.

Timothy nem kap közvetlen crm_get_project/crm_list_projects domaint; céges projektinformáció crm_company_overview és kapcsolt ajánlatadatból érhető el. Nem bővítettem jogosultságot.

## Fennmaradó hibák/korlátok — nem teljes éles lezárás
- Ajánlatkérdés modellválasza továbbra is a vibateam.hu címhez kapcsolja a helyes relatív CRM-linket; nyitott listában korábbi active=false verziót is felsorol. A forrás helyes, a modell interpretációja még nem elfogadható teljes lezáráshoz. Nem jelölöm javítottnak.
- Nulla napi fókuszból a modell esetenként általános „nincs nyitott ügyed” állítást tesz, forrásmegnevezése nem következetes. A napi számlálók egyezése igazolt, a teljes modellminőség nem.
- Owner/Ramon hitelesített böngésző NEM TESZTELT; Viktor aktív szerepe Sales, nem váltottam vagy emeltem jogosultságot. Ramon naplója csak olvasva.
- Valós levéltörzs/ügyfélválasz és dokumentum/P0 teljes végigpróba NEM TESZTELT. A meglévő izolált hozzáférési/approval tesztek sikeresek, nem helyettesítik ezeket.
- PDF szövegréteg, DOCX törzsszöveg, XLSX mentett cellák, TXT/CSV korlátozott kivonat támogatott; nincs OCR, képlet-újraszámítás vagy nagyfájl háttérfeldolgozó. Új feldolgozó nem készült.
- Összes legacy entity-ID paraméter központi UUID-validálása nem teljes; me-entitás konkrét hibája és felhasználói/dátum/lapozási kategória javítva, többi útvonal programhiba esetén további célzott ellenőrzést igényel.

## Ramon/Viktor következő próbája
1. Új Timothy-beszélgetés: „Mi a mai legfontosabb teendőm?”; összevetés saját Ma számlálókkal.
2. „Mutasd a saját lejárt utánkövetéseimet”; határidő/forrás/saját scope ellenőrzése.
3. „Listázd a saját nyitott ajánlataimat”; Nincs megadva, nettó, aktuális verzió és CRM-link külön ellenőrzendő.
4. Egy saját TESZT ajánlatnál kérj küldési bizonyítékot és dokumentumolvasást, kizárólag olvasási kérésként. Semmilyen küldést ne hagyj jóvá az audit során.

## Közzététel és adatvédelem
A javítások preview-ban ellenőrizve, a publikált alkalmazás külön telepítést igényel. Nem publikáltam. Séma/RLS/szerepkör/Gmail-hozzáférés és üzleti rekord változatlan; chatfutások meglévő auditnaplója keletkezett. A teljes audit nyitott a fenti hibák és hozzáférési korlátok miatt.