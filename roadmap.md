# Roadmap – UI/UX és AI megújítás (jóváhagyott terv, lépésenként jóváhagyással)
## Egységes marketing- és Sales-előkészítő működés — 2026-11-06
- [ ] 17:01 UTC feltöltött véglegesítési kérés: a meglévő 0–5. terv hiányainak folyamatos lezárása, kész feladatok ismétlése nélkül. Sorrend: adatkapcsolati munkasor → kampány-adatlap kapcsolódás/piszkozat/ütemezés → cégtiltás → napi munka és releváns Sales-átadás → Scarlet → közös HTML/aláírás → közös használhatóság → integrációs ellenőrzés és egyetlen zárójelentés. Engedélyezett kód/izolált teszt nem igényel köztes STOP; éles adat/jogosultsági/küldési/publikálási kapuk és hitelesített hozzáférési akadályok megmaradnak.
- [x] Véglegesítés első kapcsolódásai: import-review title UUID levélmegnyitás, meglévő levélreview belépő; Owner/Marketing cég- és kontaktadatlapról kampány-előkészítés, látható azonos céges kontakt explicit kijelölése, mentett kontaktok megőrzése; listahiba nem üres lista. 719/719 teszt, AI 21/21, build OK; izolált desktop/mobil PASS, hosted mentés NEM TESZTELT.
- [x] Tartós kontakt nélküli célcég-kampánytagság: meglévő email_campaigns.target_company_ids nullable mező, user-RLS atomic/idempotent add RPC és aktivitásaudit; cég nélküli kontakt nem készül, címzett/jogosultság nem keletkezik. Kampány-előkészítés és közös cégadatlap megjeleníti a mentett célcéget; keresőtől független. Izolált SQL PASS, 724/724 teszt, build OK, desktop/mobil megjelenítés PASS; éles 1 kampány/0 target állapot, hosted mentés NEM TESZTELT. Rollback írás felfüggesztése, sor/audit megőrzés.
- [x] Jóváhagyott cégszintű marketingtiltás: nullable cégmezők, user-RLS védett RPC, Owner-only feloldás, szerveridő/revision és atomic activities audit; közvetlen módosítás tiltva, cégadatlap és új kontaktokra is érvényes precheck. Izolált SQL PASS, 724/724 Vitest, AI 21/21, build OK. 664 éles cég/0 tiltási adat/0 új tiltásaudit; nincs backfill/küldés/publikálás. Hosted mentés/readback NEM TESZTELT, későbbi scheduler claim még hiányzik; 16 korábbi biztonsági jelzés megmaradt.
- [ ] Adatkapcsolati munkasor marketinges hozzáférése és naplózott visszaállítható döntés: import_review_items és relink reader jelenleg Owner-only; meglévő thread-link írás nem teljes szál+üzenet audittranzakció. Jogosultsági/kapcsolati változás külön célzott kapu; 39+8 változatlan.
- [x] Saját Gmail-piszkozat olvasás: drafts.list/get, Owner/Marketing aktív saját céges fiók + live azonosság, 20-as lapozás, tárgy/metaadat, teljes UTF8 text/HTML és forrásazonosító; meglévő kampányba explicit nem mentett szöveges átvétel friss olvasással, címzettek változatlanok. Melléklet/HTML-only/hiányos/túlméretes forrás nem másolható veszteséggel. 740/740 teszt, AI 21/21, build OK; desktop/mobil és signed-out tiltás PASS, hosted Gmail/read/copy/save NEM TESZTELT: external_unmanaged.
- [ ] Gmail HTML/proveniencia tartós kampánymentése és mellékletek: jelenlegi kampány-szövegút nem tárol formátumot/forrásazonosítót/mellékletet; eredeti HTML csak változatlan inert forrásnézetben, nem veszteséges automatikus import. Minimális tárolási terv és a közös HTML-küldőút szükséges; nincs automatikus migráció vagy küldés.
  - 17:27 UTC: pontos additive HTML/forrás-séma, service-only import/szövegesre váltás és adatmegőrző rollback javaslat elkészült; jóváhagyási kapu előtt nincs alkalmazva, alkalmazáskód és izolált SQL-teszt még nem készült hozzá.
- [ ] Ütemezett kampány infrastruktúra: jelenleg csak TESZT-claim; címzettenkénti időzítés/jóváhagyott snapshot/stop-pause/tartós dispatch/fresh tiltás-ellenőrzés hiányzik. Tranzakciós claim és izolált párhuzamos teszt szükséges; ügyfélaktiválás külön kapu.
- [ ] Napi munkasor, releváns előzményes Sales-átvétel és Scarlet kampányolvasás lezárása: a fenti tárolt állapotok után; célzott idegen levéljogok nem bővíthetők általánosan, teljes authenticated E2E nem elérhető.
- [ ] Közös HTML/aláírás, végső használhatóság és teljes két üzleti integrációs lánc: működési függőségek elkészülte után; jelenlegi composerben vizuális HTML van, kampányban plain text, aláírás/piszkozatmentés még nincs. Teljes CRM-készség nem igazolt.
- [x] Jóváhagyott levélszál-áttekintés: 4543 Viba-szál, három fiók saját üzenet-metaadata; 168 promóció/körlevélgyanús ID és 8 szigorúan előszűrt kézi jelölt. 3910 mentett szálkontakt, nyolc jelölt üzenete is Viba-company_id; régi 1625 „biztosan javítható” minősítés nem végrehajtási alap. 24 célteszt PASS, írás/átkötés nélkül. docs/system-map/levelszal-dry-run-2026-11-06.md; STOP.
- [ ] Levélkapcsolatok tételes kézi döntése és esetleges javítás: tulajdonos 16:54 UTC válasza „Még kézzel ellenőrzöm”; minden kapcsolat változatlan marad. Owner-előzményvizsgálat és kifejezett írási jóváhagyás hiányzik; friss szál+üzenet/kapcsolat snapshot és változásvédett rollback kötelező, listák önmagukban nem engedély.
- [x] Nyolc jelölt tételes második SELECT-ellenőrzése: három egyező tárolt levélcsoport (Szabó-Galambos 3, Petrov 3, KÉSZ 2); hat belső feladós CC-példány nem ügyfélválasz. Két Ramon SENT bizonyíték, KÉSZ küldése a két jelöltben nem igazolt. Öt reklámgyanús ID-minta: három mentett kontakt, minden üzenet company_id-s; nincs leválasztás. Az auditban megnyitható szállinkek, továbbra írás nélkül, STOP.
- [x] 39 vitatott szál azonosítása SELECT-tel: mind a 39 title létező egyedi thread UUID; a régi „nincs azonosító” jelentés helyesbítve. 11 Viba/25 más cég/3 kapcsolatlan, 29 info/1 Pretor/9 cégesfiók-hozzáférés nélkül; tételes auditlista, semmilyen lezárás vagy átkötés nincs. Kézi döntés és hosted előzményvizsgálat továbbra nyitott.
- [x] 39 vitatott szál friss, pontos cím-egyezés szerinti előszűrése: 21 eltérő/hiányzó mentett cég, 3 egyező, 1 többcéges, 5 egyezés nélküli, 9 saját cégesfiókos üzenet nélkül. Két szálnál összesen három üzenet–szál company_id eltérés; tartalommentes prioritási CSV és közös audit frissítve. Nincs automatikus lezárás/átkötés/küldés/publikálás; owner kézi döntés és hosted tartalmi próba továbbra hiányzik, STOP.
- [x] Feltöltött követelmények rögzítése és meglévő alapok összevetése; közös, jóváhagyásos végrehajtási terv előkészítése.
- [x] 0–1. kör: frissített térkép és 487 Excel-sor/203 jelölés tételes SELECT-audit. 82 külső SENT, 120 csak DRAFT, 1 TESZT/belső jelölés; 32 teszt PASS, belső bejelentkezett próba NEM TESZTELT. Jelentés: docs/system-map/marketing-egysegesites-01-2026-11-06.md; adat/kód/RLS/küldés változatlan, STOP.
- [x] Jóváhagyott célzott hitelességi kódjavítás: SENT/DRAFT-védelem, három céges fiók, azonos szálbeli válasz, hiányos történet és 1001 üzenetes olvasóteszt. 655 teszt PASS, build OK; docs/system-map/marketing-hitelessegi-javitas-2026-11-06.md, STOP.
- [x] Jóváhagyott 120 DRAFT és 1 TESZT/belső megkeresésjelölés célzott helyesbítése: friss SENT-ellenőrzés, pontos régi/új snapshot és változásvédő rollback; 121 teljes jegyzet visszaolvasva egyezik, 82 jelölés megmaradt, 664 cég/701 kontakt/8 lead. 22 teszt PASS, jelentés: docs/system-map/marketing-jeloles-helyesbites-2026-11-06.md; STOP.
- [ ] Belső owner/marketing/sales/PM és kampány CRUD próba: external_unmanaged, nincs átadható biztonságos munkamenet, NEM TESZTELT.
- [x] 2. kör megjelenítési része: közös marketingösszefoglaló és mentett kampánytagság a cégoldalon, marketing utánkövetések, idővonal SENT/DRAFT-védelem. 658 teszt PASS, build OK; jelentés docs/system-map/marketing-kozos-cegadatlap-2026-11-06.md, adat/küldés/publikálás nélkül.
- [x] 2. kör strukturált marketingállapot: jóváhagyott nullable companies mezők, user-RLS zárolt mentés/metadata/audit, legacy-marker írásvédelem, közös olvasók és Gmail SENT-bizonyíték út. 669 teszt PASS, izolált SQL PASS, build OK; 664/701/8 és teljes jegyzethash változatlan, backfill/küldés/publikálás nélkül. Jelentés: docs/system-map/marketing-strukturalt-allapot-2026-11-06.md; STOP.
- [ ] Strukturált állapot hitelesített owner/Marketing/Sales/PM mentési végigpróba: external_unmanaged munkamenet hiánya; NEM TESZTELT.
- [x] 2. kör kontaktforrás és személy/gyűjtőcím/ismeretlen ellenőrzöttség: jóváhagyott nullable contacts mezők, owner/Marketing user-RLS/audit, identity-változás érvénytelenít, közös meglévő editor/összefoglaló. 673 teszt PASS, izolált SQL és desktop/mobil TESZT-megjelenítés PASS, build OK; 701 kontakt és eredeti teljes sorhash változatlan, backfill/küldés/publikálás nélkül. Jelentés docs/system-map/kontakt-ellenorzottseg-2026-11-06.md; STOP.
- [ ] Kontaktellenőrzöttség hosted owner/Marketing/Sales/PM mentés/readback végigpróba: external_unmanaged, nincs átadható biztonságos munkamenet; NEM TESZTELT.
- [x] 3. kör kampány-előkészítés: jóváhagyott meglévő táblabővítés, explicit cég/kontakt, mentett üzenet/verified-name előnézet, timestamp-védett mentés és atomikus címzettcsere. 681 teszt/izolált SQL/desktop+mobil TESZT-megjelenítés PASS; éles 664/701/8 és 1 tervezet/0 címzett változatlan. Jelentés docs/system-map/kontrollalt-kampany-elokeszites-2026-11-06.md; küldés/publikálás nélkül, STOP.
- [ ] Kampány hosted Owner/Marketing mentés/readback és szerepkörös E2E: external_unmanaged munkamenet nem elérhető; NEM TESZTELT.
- [x] 3. kör küldési védelem: jóváhagyott címhez kötött igazolt tiltás + service-only audit/claim, napi 40/fiók Budapest, két engedélyezett TESZT-cím és shared Gmail pontos proof. 696 teszt, izolált concurrent SQL, desktop/mobil TESZT-megjelenítés/build PASS; éles audit/tiltás 0, ügyfélküldés/publikálás nincs. Jelentés docs/system-map/kampanykuldes-vedelem-2026-11-06.md; STOP.
- [ ] Engedélyezett valódi TESZT-küldés és hosted kampány/tiltás E2E: external_unmanaged saját munkamenet hiányzik, kampány mentett szövege üres; NEM TESZTELT. Nincs másik feladóval kerülőút.
- [ ] Ügyfélküldés és időzítés aktiválás: külön tulajdonosi kapu; hiányos történet feloldása és indításmód nincs jóváhagyva.
- [x] 4–5. kör célzott javítás: jóváhagyott részleges webes felvétel ismétlésvédelme/friss egyezés; átadás közös frissítés; Scarlet DRAFT/mentett marketingállapot/kontaktproveniencia; napi tiltás/hibás email/telefon és közös callback elkülönítés. 706 teszt, AI 21 scenario, desktop/mobil TESZT-megjelenítés/build PASS; nincs migráció/éles írás/küldés/publikálás. Jelentés docs/system-map/napi-marketing-scarlet-javitas-2026-11-06.md; STOP.
- [ ] 4–5. kör teljes elfogadás: hitelesített munkanap/átadás/readback és Scarlet modellválasz external_unmanaged miatt nem elérhető; webes tartós konkurens idempotencia elkészült, hosted próba alább nyitott. Teljes kampány/válasz/Sales-átvétel NEM TESZTELT.
- [x] Webes tartós felvétel: jóváhagyott négy nullable receipt mező és service-only tranzakció; saját RLS-es cég/kontakt/audit readback, ID-only szerverút, legacy kliensinsert kivezetve. Izolált concurrent/rollback/role SQL és 707 teszt/AI 21/build/TESZT-megjelenítés PASS; 18 igény/0 receipt és 664/701/8 változatlan. Jelentés docs/system-map/webes-tartos-felvetel-2026-11-06.md; STOP.
- [ ] Webes tartós felvétel hosted Owner/Marketing mentés/readback és teljes szerepkörpróba: external_unmanaged munkamenet hiányzik; NEM TESZTELT.
- [x] Marketing vezetői ellenőrzés, csak olvasás: éles 664 cég/701 kontakt/8 lead/18 igény/0 receipt/1 kampány; 31 célteszt PASS. Ma és dashboard böngészőből /auth, hitelesített próba NEM TESZTELT. A marketing Ma 500/1000 soros számlálókorlátja és eltérő átadási nevező célzott javítási tervre vár; jelentés: docs/system-map/marketing-mutato-audit-2026-11-06.md.
- [x] Marketing Ma mutatók jóváhagyott célzott javítása: stabil lapozott cégolvasás / pontos email count, hiba nem nulla; átadási darabszám és forráshű megkeresés/válasz felirat. Minden új cég beszámítása megmaradt. 713 teszt / 68 fájl PASS, build OK, elkülönített 1001 cég/1501 email desktop+mobil kijelzés PASS; hosted szerepkörös próba továbbra NEM TESZTELT. Nincs scope/RLS/adat/küldés/publikálás-változás, STOP.
## Marketing és Scarlet — első összevont kör (2026-11-06)
- [x] Gmail-szinkron pontos kontakt→cég kapcsolattal, domain-találgatás nélkül; történeti kapcsolat érintetlen, eltérés kézi ellenőrzés. Kézi szál-cégválasztó RLS-sel; küldés előtti kapcsolati ellenőrzés.
- [x] Marketing Ma közös napi adatforrás, saját külső válaszmutató, visszahívás és utánkövetés; minden cég keresése külön a kampánytól, cégazonosító szerinti küldés-visszajelzés.
- [x] Scarlet közös napi/aktivitás és fiókspecifikus tárolt levélolvasás; központi modell változatlan, nincs íróművelet vagy önálló küldés.
- [x] 47 célzott teszt és 21 AI acceptance sikeres; olvasási DB-ellenőrzés: 446 cég, 213 kontakt-cégeltérés, 2426 kapcsolatlan szál. Üzleti adat/küldés/publikálás nélkül.
- [ ] Hitelesített Marketing→Gmail→CRM→Ramon végigpróba és Scarlet modellválasz: nincs használható böngészős munkamenet (external_unmanaged); nem tesztelt. Marketing önálló followup-írás jelenlegi RLS szerint tiltott, nem bővítettük; hívás callback_date használható.
## Timothy kockázatalapú minőségbiztosítás és segítőkész működés
- [x] Közös terv és teljes lánc kockázattérkép; 300 változatos katalóguseset előre rögzített elvárással: docs/qa/timothy-risk-catalog.json.
- [x] Közös ID/cégkapcsolat/állapot/idő/válaszvédelmek, saját auditfutás állapotjelzés mindkét chatben; P0/RLS és memóriajog változatlan. 242 érintett teszt/21 AI acceptance/build OK.
- [x] Rövid mért jelentés docs/qa/timothy-risk-summary.md: 145 determinisztikus PASS, külön 12 izolált valódi modellminta 9 PASS/3 FAIL (75%, nem valós Sales-megbízhatóság). Nincs üzleti írás/küldés/publikálás, STOP.
- [ ] 155 nem automatizált katalóguseset és hitelesített két-chat/műveleti próba: kontrollált TESZT fixtures és használható munkamenet hiányzik; 95% tény/feladat cél nem igazolt, modellmintában 3 hiba maradt.
## Timothy célzott stabilizálás — 2026-11-03
- [x] Viktor újonnan engedélyezett bejelentkezésével 15 valódi chatpróba: 8 PASS / 7 FAIL, elírások 3 PASS / 1 FAIL; eszköz/adat/válasz összevetve, 0 böngészőhiba/approval, üzleti írás/küldés/publikálás nélkül. Rövid táblázat a célzott jelentés végén; kritikus modellhibák továbbra is nyitva.
- [x] Aktuális ajánlatlista és forráshű linkek; állapot/időzóna, szerepkör és hiányos CRM/Gmail-adatok célzott javítása, séma/RLS/UI változtatás nélkül. 62 célzott teszt/21 AI acceptance/build OK, rövid jelentés: docs/system-map/timothy-celzott-stabilizalas-2026-11-03.md.
- [ ] Korábbi FAIL lezárása: 8 pontosan dokumentált forgatókönyv hitelesítve, 2 teljes PASS / 6 FAIL; külön nyitott ajánlatlista PASS. Az eredeti kilencedik FAIL nem azonosított. Cég/kontakt UUID, completed/időzóna, Gmail-hiány, Owner magyarázat és kitalált ok továbbra is hibás; új javítás nem indult, STOP.
## Timothy végső gyors ellenőrzés
- [x] Viktor ismételt hitelesített végigpróbája: 20 valós chatkérdés/eszköznapló/adateredmény, 11 PASS / 9 FAIL, pageerror=0; új fejlesztés, regresszióismétlés, üzleti írás/küldés nélkül. Rövid eredménytábla az éles chat-audit végén.
- [x] 18 ellenőrzési eset összevont értékelése a közvetlenül előző hitelesített chatpróbák és izolált tesztek alapján; nincs ismételt teljes tesztcsomag, fejlesztés vagy publikálás. Kritikus modellértelmezési hibák miatt teljes éles lezárás nem PASS; az alábbi nyitott auditfeladatok maradnak.
## Timothy éles működési audit — 2026-11-03
- [x] Eredeti hibás futások és Viktor bejelentkezett két-chat próbája; me-feloldás, lapozás, gyorskérdés és olvasási hibaválasz célzott javítása; 417 teszt/21 AI scenario/build OK. Jelentés: docs/system-map/timothy-eles-chat-audit-2026-11-03.md. Nincs üzleti írás/küldés/publikálás.
- [ ] Modellminőségi lezárás: a célzott adatoldali javítások elkészültek; kritikus hibák tényleges chatválaszokból való megszűnése a hitelesített visszateszt hiányában nem igazolt.
- [ ] Owner/Ramon hitelesített próba és valós Gmail-küldés nélküli teljes dokumentum/P0 végigpróba: csak hozzáférhető szerepkörrel és elkülönített TESZT-adatokkal.
## Timothy V3.1 — értékesítési intelligencia
- [x] Három képesség alapja: közös case-review + existing Gmail/history értelmezés, dokumentált lead/quote eredmény, user-RLS történeti nettó egységárkeresés. 18 célzott/406 teljes teszt, AI 21 forgatókönyv/build PASS; nincs UI/írás/publikálás. Rövid jelentés: docs/system-map/timothy-v31-rovid-jelentes.md.
- [ ] V3.1 hitelesített két-chat/modell/Gmail és valódi PostgREST egységárkeresés TESZT-próba: external_unmanaged munkamenet nem átadható; felhasználói ellenőrzés szükséges. Anyag/munkadíj és konkrét nyertes quote-verzió nincs tárolva, ezért nem becsültük.
## Timothy Sales AI V3.0 (2026-11-03)
- [x] V3 lezáró kör: P3 kód/specifikáció ellenőrzés; P4 saját ügyek szabályalapú metaadatjelzései meglévő Ma/dosszié/két-chat felületen; P5 388/388 regresszió, AI 21 forgatókönyv, izolált nézet PASS, build OK. Üzleti adat, Gmail és publikálás érintetlen.
- [ ] V3 bevezetési kapu: hitelesített két-chat→P0→CRM/Gmail/R2, több szerepkör és modellminőség TESZT-végigpróba; external_unmanaged, nincs átadható biztonságos munkamenet. Felhasználó saját TESZT-próbája szükséges.
- [ ] V3 teljes specifikáció szerinti lezárás még nem állítható: nagy fájl feldolgozó folyamat nincs; P4 tartalmi sürgősség/hiánypótlás csak kezdeményezett chatolvasás, nem automatikus osztályozás; teljes történeti levélfigyelés és P5 hatékonysági mérőszámok nem igazoltak. Külön kapu a bevezetési TESZT eredménye és a nagyfájl-feldolgozási erőforrás/működési keret, nem indult párhuzamos feldolgozó.
- [x] Feltöltött specifikáció feldolgozása; meglévő kapcsolódások olvasásos ellenőrzése és szakaszos terv előkészítése.
- [x] P1/A célzott CRM-adatértelmezés: cégszűrés, lapozás, forrásos leadelőzmény, hibajelzés; 170/170 regresszió, AI 13 forgatókönyv, build PASS; jelentés és STOP.
- [ ] P1/A hitelesített Timothy/több-szerepkörös végigpróba: external_unmanaged Supabase, nincs átadható biztonságos munkamenet.
- [x] P1/B tárolt Gmail-tartalom: fiókhoz kötött olvasás, szinkronhiány, források és tartalomvédelem; 185/185 regresszió, AI 14 forgatókönyv, build PASS; jelentés/STOP.
- [ ] P1/B hitelesített két-chat levélértelmezés és modellminőségi/adversarial próba: external_unmanaged Supabase, nincs átadható munkamenet.
- [x] P1/C ajánlatértelmezés: nettó, verziók/alternatívák, küldési bizonyíték, utánkövetések, összehasonlítás; 204/204 regresszió, AI 15 forgatókönyv, build PASS; jelentés és STOP.
- [ ] P1/C hitelesített két-chat/valós RLS és modellminőségi próba: external_unmanaged Supabase, nincs átadható biztonságos munkamenet.
- [x] P1/D korlátozott dokumentumértelmezés: RLS-es fájlazonosítás, PDF/XLSX/DOCX/szöveg, forrás/verzió/hash és részlegesség; 224/224 regresszió, AI 16 forgatókönyv, build PASS; jelentés és STOP.
- [ ] P1/D hitelesített R2/két-chat/Worker végrehajtás és modellminőség: external_unmanaged Supabase, nincs átadható munkamenet; nagy fájl háttérfeldolgozása nincs megvalósítva.
- [x] P2 előkészítés: eredeti specifikáció, közös napi logika és ismétlődő briefing vizsgálata; élő ai_memory constraint/RLS ellenőrzés, előzetes terv.
- [x] P2 megvalósítás: kompakt Timothy-kártya, közös napi adatok, tartós napi futásvédelem, frissesség; regresszió/AI acceptance/izolált SQL és böngésző; jelentés és STOP, publikálás nélkül.
- [ ] P2 hitelesített Sales/owner napi kvóta, kézi frissítés és modellminőség végigpróba: external_unmanaged Supabase, nincs átadható biztonságos munkamenet. Korábbi P1 és P0 végigpróbák továbbra is nyitva.
- [x] P3 előkészítés: CRM/Gmail meglévő útjainak ellenőrzése; P3/A terv és hatás/rollback jóváhagyva.
- [x] P3/A jóváhagyott Hívás/E-mail aktivitás: existing followups, P0 action UUID idempotencia, audittranzakció, szerveridő; 234 teszt és AI 17 forgatókönyv PASS, izolált SQL/kártya PASS; STOP.
- [x] P3/B1 következő lépés: terv jóváhagyva, három existing mező transactional mentése, stale context/before tiltás, action audit; 261 teszt, AI 18 scenario, build és izolált SQL/kártya PASS; jelentés/STOP, nem publikált.
- [x] P3 folytatás: jóváhagyott lead-utánkövetés existing táblába, nyitott ismétlésvédelemmel; egy összevont kör 273 teszt/AI/build/izolált SQL/kártya PASS, rövid közös jegyzet; nem publikált.
- [x] P3 kapcsolattartó: existing azonos céges személy nyitott leaden, régi/új P0 kontextus; 287 teszt/AI/build/izolált SQL/kártya PASS, más rekordadat/ajánlati kontakt változatlan; nem publikált.
- [x] P3 felelős-átadás: owner-only P0, meglévő lapozott átvevőkereső, aktív Sales cél, nyitott lead, kontextus/audit/readback; 309 teszt/AI/build/izolált SQL/kártya PASS, migráció sikeres, éles action=0; nem publikált.
- [x] P3 nyitott Pipeline-státusz: existing átmenetek/P0, frozen next-step/lead, atomi audit/readback; 344 teszt/AI/build/izolált SQL/kártya PASS, migráció sikeres, nincs éles írás/publikálás.
- [x] P3 küldés vizsgálata: meglévő Gmail-út és P0 ellenőrizve; sima levélnél nincs tartós küldési ismétlésvédelem. Aktuális read-only DB: 0 approval sor, 0 küldőtool-sor, 2 quote_sends sor.
- [x] P3 jóváhagyott levélküldés: meglévő Gmail-service, exact message/file P0, service-only dispatch, Gmail SENT + CRM readback; 373 teszt/AI 21 scenario/build/izolált SQL/actual dangerous kártya PASS, migráció sikeres, email action=0. Éles küldés/publikálás nélkül.
- [ ] P3 hitelesített két-chat/valódi Gmail/R2/RLS és modellpróba: external_unmanaged munkamenetkorlát; bevezetési akadály. P4 alapfigyelés és P5 automatikus ellenőrzés a lezáró körben elkészült, teljes bevezetés nem igazolt.

## AI OS P0 – jóváhagyás és végrehajtás (2026-11-03)
- [x] Tartós szerveroldali jóváhagyás, idempotencia, migrációs hatáselemzés és visszaállítás megtervezése; jóváhagyásra megállás.
- [x] Jóváhagyott terv alapján a közös AI OS és a két meglévő chatfelület célzott javítása; üzleti modulok változatlanok.
- [x] Izolált kötelező hibaforgatókönyvek, 155/155 regresszió, AI acceptance 12/12 és PASS/FAIL jelentés; publikálás nélkül.
- [ ] Hitelesített teljes két-chat végigpróba és valós szerepkörös Timothy/Michael TESZT végrehajtás: external_unmanaged Supabase, nincs átadható munkamenet; éles üzleti írás nélkül kell megszervezni.

## Ajánlatkészítő két munkafolyamat (2026-11-03)
- [x] Indítási munkamódválasztó; meglévő típus nélküli ajánlat választása adatvesztés nélkül.
- [x] Négy lépés, kapott Excelnél sablon/tételárazó rejtve, saját ajánlatnál közös szerkesztés/előnézet.
- [x] Mindkét munkamód elkülönített böngészős ellenőrzése; 130/130 teszt, AI 12/12, build PASS; jelentés és STOP, publikálás nélkül.
- [ ] Hitelesített TESZT indítás/mentés/fájl/PDF/Gmail/utánkövetés: external_unmanaged Supabase, nincs átadható munkamenet.

## Ajánlatkezelő V2.1/C (2026-11-03)
- [x] Tulajdonosi sablonalapok a meglévő settings tárolóban, szerveroldali jogosultság és validálás; meglévő ajánlatok változatlanok.
- [x] Közös nyomtatási dokumentum és élő A4-előnézet, ajánlatspecifikus feltételek megtartásával.
- [x] Regresszió 126/126, AI 12/12, build és elkülönített előnézet PASS; kézikönyv és jelentés; STOP, publikálás nélkül.
- [ ] Hitelesített owner/Sales sablonmentés és teljes TESZT ajánlat/PDF/Gmail végigpróba: external_unmanaged Supabase, átadható munkamenet nincs.

## Ajánlatkezelő V2.1/B (2026-11-03)
- [x] Hat munkaterület a meglévő ajánlatpanelekből, állandó összefoglaló fejléc; rejtett panelek csatolva maradnak.
- [x] Teljes regresszió 121/121, AI 12/12, build PASS; ellenőrzési jelentés; STOP, C és publikálás nélkül.
- [ ] Hitelesített munkaterületváltás és mentési végigpróba: external_unmanaged Supabase, átadható munkamenet nincs; felhasználói ellenőrzés szükséges.

## Ajánlatkezelő V2.1/A (2026-11-03)
- [x] Igazolt kiküldéshez kötött rögzítés; hatáselemzés, visszaállítás és célzott tesztek.
- [x] Verzió és alternatíva a kiválasztott forrás sablonját, helyszínét és feltételeit örökli.
- [x] PDF az ajánlat kapcsolattartóját használja; mellékletre hivatkozó levél melléklet nélkül blokkolt.
- [x] Regresszió és PASS/FAIL jelentés: 22/22 ajánlatteszt, SQL PASS, teljes regresszió 120/121 (korábbi menüteszt FAIL); STOP, B/C nem indult.
- [ ] Hitelesített PDF és mellékletes küldés végigpróba: külső Supabase-munkamenet nem átadható, felhasználói próba szükséges.

## S8 Gmail-küldési teszt folytatása (2026-11-03)
- [x] Felhasználó által végzett TESZT-küldés olvasásos ellenőrzése: 2026-11-03 14:36:47 UTC, ajánlat 71a68ee4-c214-4980-9e68-a1204e32957f, napló 54f11904-a3c3-489e-b034-406d1932233d, címzett info@vibateam.hu, tárolt küldő Info@nexohabit.com; sent állapot és zárolás igazolt.
- [ ] Ajánlat-PDF mellékletes végigpróba: a tesztlevélben 0 melléklet, az ajánlaton 0 dokumentum; jelenlegi küldés nem generál automatikus PDF-et. Külső Supabase miatt saját hitelesített böngészős munkamenet nem érhető el. Új küldés vagy javítás ebben a vizsgálatban nem történt.

## Sales Ma végleges elrendezés (2026-11-03)
- [x] Négy saját értékesítési KPI és négy napi fókuszkártya, meglévő adatforrásokkal.
- [x] Kompakt, prioritás szerint egyszer megjelenő napi ügylista és gyorsbelépők; más szerepkörök változatlanok.
- [x] Célzott/regressziós tesztek és asztali/mobil mesterséges TESZT-ellenőrzés, publikálás nélkül.
- [ ] Élő, bejelentkezett Sales számlálók ellenőrzése: külső Supabase, nincs használható biztonságos munkamenet.

## Jóváhagyott Sales S1–S2 véglegesítés (2026-11-03)
- [x] Ma és felső sáv közös saját/csapat adatai, Budapest-nap, hibajelzés, ügyre mutató linkek.
- [x] Sales-előkészítő: csak megtörtént Hívás/E-mail, szerveroldali időpont, következő lépés változatlan.
- [x] Pontosan három jóváhagyott hibás aktivitás azonosítása, mentése, törlése és változatlanság-ellenőrzés.
- [x] Célzott tesztek és jelentés, publikálás nélkül.
- [ ] Bejelentkezett Sales/owner TESZT ügy végigpróba: külső Supabase, nincs biztonságos munkamenet; felhasználói ellenőrzés szükséges.

## Elsőbbségi postafiók-javítás
- [x] Fiókazonosító és szinkron-hozzárendelés vizsgálata; Laci történeti levelei és jogosultsága.
- [x] Szerveroldali postafiók-szűrés, számlálók, keresés és lapozás.
- [x] Fiókjelölések, biztonságos küldőazonosság és regressziós tesztek.
- [x] Konkrét postafiókonkénti eredmények és ellenőrzési jelentés.
- [ ] Belső felületi végigteszt: külső Supabase mellett nincs biztonságos böngészős session; felhasználói ellenőrzés szükséges.
- [ ] Megosztott szálak hiányzó fiókspecifikus Gmail-címkéinek igazolása: a meglévő adatmodell csak egy üzenettulajdonost tárol; külön Gmail-adatellenőrzés nélkül nem bizonyítható.

## Kereshető rekordválasztók
- [x] Közös, szerveroldali keresés, lapozás és kiválasztott rekord lekérése, meglévő jogosultságokkal.
- [x] Kapcsolódó rekordválasztók és nagy listás szűrők átvezetése.
- [x] 5000 mesterséges rekordos teszt: elkülönített PostgreSQL 250 lap/RLS; valódi keresőelem asztali és mobil mock próbája.
- [ ] Élő mentési próba: biztonságos bejelentkezési session szükséges, jelszó nélkül.
- [ ] Éles szerepkörös keresőlekérdezés: a read-only adatbázis-szerep nem hívhatja az authenticated keresőfüggvényt; a felhasználó saját bejelentkezése szükséges.

## UI megújítás (külön jóváhagyással folytatható)
- [x] 1. Designrendszer (színek, betűk, kártya, gomb)
- [x] 2. Keret: oldalsáv, felső sáv, mobil alsó navigáció (belső oldalak vizuális ellenőrzése a felhasználónál)
- [x] 3. Állandó AI-panel (felületi ellenőrzés a felhasználónál)
- [ ] 4. Tulajdonosi nézetváltó
- [ ] 5. „Ma” oldalak egységesítése
- [ ] 6. Listák és táblázatok, mobil kártyanézet
- [ ] 7. Adatlapok
- [ ] 8. Végső teljes körű teszt és jelentés
