# A hátralévő marketingmunka – közös állapot

A 17:01 UTC feltöltött kérés az eredeti 0–5. terv folytatása, nem új rendszerterv. Kész funkciók ismétlése nincs; megengedett kód/izolált teszt köztes STOP nélkül, éles adatok/jogosultság/küldés/publikálás kapui megmaradnak. E dokumentum a folytatás közös rövid jegyzete, nem teljes elfogadási jelentés.

## Elkészült kapcsolódások
- Az importellenőrzés a title mezőben mentett szál-UUID-t is megnyitja; kizárólag email_thread típusú tételnél, szigorú UUID-ellenőrzéssel. Meglévő levél–cég ellenőrzésre belépő, új felület/automatikus relink nélkül.
- Cégadatlap Kampányok részéből és kontaktadatlapról Owner/Marketing „Hozzáadás kampányhoz”: a meglévő kampány-előkészítést nyitja validált company/contact URL-azonosítóval. A kontakt csak a látható azonos céges jelöltek között lesz kijelölve, a mentett lista megmarad; nincs automatikus mentés vagy küldési jogosultság. Nem mentett kontaktváltozásnál az action tiltott.
- A kampány cégolvasási hibája nem jelenik meg üres/igazolt nulla listaként. Hiányzó/nem látható kiválasztott cégnél figyelmeztetés.

## Ellenőrzés
- Összevont Vitest: **719 PASS / 0 FAIL, 70 fájl**; AI acceptance **21 PASS / 0 hiba, 5 agent**. A 6 új szabályteszt konkrét szálazonosító-feloldást és explicit cég/kontaktkijelölést ellenőriz.
- Harness fordítás: build OK (17:04:28 UTC); a search-típus miatti átmeneti hibát optional return mezőkkel javítottuk, a meglévő Ma link változatlan.
- Elkülönített megjelenítés 1280×1800 és 390×844: mentett és adatlapról kijelölt kontakt egyszerre megmarad, nem mentett üzenetváltozásnál előellenőrzés tiltott; 0 pageerror és nincs mobil vízszintes túlcsordulás. Ez TESZT-cache-es megjelenítés, nem hitelesített mentési végigpróba. A valódi /campaign-list /auth-ra irányít; **hosted mentés és saját Gmail-próba NEM TESZTELT: external_unmanaged**.
- Nincs schema/RLS/üzleti adatírás, küldés vagy publikálás. Sales-pipeline, ajánlat, árazás, Timothy és központi modell forrása nem módosult.

## Fennmaradó tényleges hiányok
A roadmap egyetlen folyamatos nyitott listája követi: kontakt nélküli tartós kampánycélcég; cégszintű tiltás; marketinges adatkapcsolati munkasor naplózott és visszaállítható döntéssel; saját Gmail Drafts olvasás/proveniencia; ütemezett dispatch; napi/Sales/Scarlet kapcsolódások; közös HTML/aláírás; utolsó közös használhatóság; teljes üzleti integrációs és szerepkörös végigpróbák.

Friss policy-olvasás: import_review_items és relink reader Owner-only, kampány Owner vagy saját Marketing; company/contact meglévő üzleti szerepkörökkel látható. A marketinges review-hozzáférés nem oldható meg pusztán linkkel vagy szerver-admin kerülőúttal. A 39+8 bizonytalan szál változatlan, kézi döntés hiányzik. A contact_id NOT NULL kampánytábla nem tárolhat kontakt nélküli célcéget a mostani mentőúton; **ez még nincs megvalósítva**.

Ügyfélkampány, automatikus küldés és publikálás nincs aktiválva. Teljes CRM-készség nem állítható. A commitot a platform kezeli, végleges commitazonosító ebben a körben nem igazolt.

## Jóváhagyott cégszintű marketingtiltás – 17:10–17:17 UTC
- A jóváhagyott minimális migráció alkalmazva: nullable companies tiltás/indok/felelős/idő/revízió mezők. Meglévő policy és üzleti adat nem változott; 664 cégből 0 tiltási állapotsor, 0 company_marketing_block aktivitás az éles readbackben. Nincs backfill vagy tesztcég az éles adatbázisban.
- Védett user-RLS RPC, row lock/revízióellenőrzés, csak Owner oldhat fel; trigger védi a közvetlen INSERT/UPDATE mezőírást, szerveridő/felelős/revízió és visszaállításhoz előtte/utána activities audit egy tranzakcióban. Hitelesített szerverfunkció a pontos user-visible cégreadbackkel igazolja a mentést. Anon execute=false, authenticated=true; szerepellenőrzés mindkét rétegen. Normál üzleti levélküldés változatlan.
- Meglévő közös cégösszefoglalóba CompanyBlockControl, indok/állapot/idő és szerepfüggő művelet. Kampány-előellenőrzés minden aktuális kontakt látható szülőcégének tiltását olvassa; cégolvasási hiány blocking hiba, új kontakt is invalid „Cégszintű marketingtiltás”. Közös realtime újratölti a kampányelőellenőrzést is.
- SQL-javaslat: database/company_marketing_block_2026-11-06.sql; rollback: az RPC-írás visszavonása, mezők és audit megtartása. Aktív tiltást ignoráló küldőút nem állítható vissza.
- Izolált PostgreSQL szabályteszt: szerepek/RLS, direkt insert/update, kötelező indok, metadata, új kontakt, Owner-only feloldás, stale revízió, audit rollback, jegyzet megőrzése; párhuzamos azonos revízióból egy győztes. Vitest **724 PASS / 0 FAIL, 71 fájl**, AI **21 PASS**, harness build OK 17:13:36 UTC. Új Vitest: 4 tiltási szabály + 1 újkontakt/precheck eset.
- Desktop és mobil elkülönített cache-próba: tiltás/indok/Budapest-idő látható, Marketing feloldási gomb nincs; 0 pageerror, nincs mobil overflow. A tulajdonosi dialogpróbát nem igazolta a fixture munkamenete; **Owner/Marketing hosted mentés/RPC/readback és teljes bejelentkezett végigpróba továbbra NEM TESZTELT**. Nincs auth megkerülés éles fiókon, valódi küldés vagy publikálás.
- Migrációhoz kötődő új linterhiba nincs; **16 korábbi jelzés** (RLS policy nélküli tábla, keresésiút/grant figyelmeztetések, public extension, jelszószivárgás-védelem kikapcsolva) változatlan, nem ebben a körben módosítva.

A cégtiltás kód/séma/izolált szabály része elkészült, nem teljes CRM-lezárás. A későbbi valódi ütemezett küldés claimjében is frissen ellenőrizni kell a cégtiltást; scheduler még nincs. A kontakt nélküli célcég, marketing-review jog, Gmail Drafts/HTML és teljes napi/Sales integráció nyitott függőségei a roadmapben maradnak.

## Kontakt nélküli tartós kampánycélcég – 17:17–17:20 UTC
- Minimális additive email_campaigns.target_company_ids mező, új párhuzamos tagságtábla nélkül. A címzett contact_id továbbra kötelező; a célcég **nem címzett és nem küldési engedély**. Meglévő RLS változatlan.
- User-RLS campaign_add_target_company sorzárral, ismételt add azonos eredménnyel, friss kampányrevízióval, Owner/saját Marketing scope, látható cég és nem archivált kampány; védett trigger és atomic activities audit. Kizárólag hozzáadás: nincs tömeges csere vagy törlés. 2000 cégkorlát. Saját visszaolvasás igazolja tagságot.
- Az adatlapról érkező cég a meglévő tervezet kiválasztása után „Kiválasztott cég mentése kampánycélként” művelettel menthető kontakt nélkül; a tervezet és közös CompanyCampaigns a tartós listából mutatja, keresőszűrő nem törli. Nem mentett üzenetmódosítás mellett célcégmentés tiltott.
- SQL + rollback: database/campaign_target_companies_2026-11-06.sql és rollback párja. Rollback execute visszavonás, mentett célcégek/audit megőrzése. Nincs backfill; friss éles SELECT **1 kampány / 0 target állapot**.
- Izolált SQL: kontakt nélküli tagság, 0 kontakt/0 címzett létrehozás, szerepek/RLS, közvetlen mezőírás tiltás, stale mentés, replay 1 tagság/1 audit, archiválás tiltás PASS. Vitest **724/724**, AI **21/21**, build OK 17:18:54 UTC. Desktop/mobil mentési gomb megjelenítése és mentett kontaktok megőrzése PASS (cache-fixture, nem hosted mentés).
- Éles szerepkörös mentés és teljes marketing→kampány lánc **NEM TESZTELT**, külső Supabase munkamenet nem elérhető. Nincs ügyfélküldés, automatikus küldés vagy publikálás. 16 korábbi biztonsági jelzés továbbra megmaradt; külön célzott javításban kezelhető.

Az előző állapotjegyzet kontakt nélküli célcég- és cégtiltás-hiányát e két rész felülírja. Még nyitott: marketinges review-jog és auditált visszaállítható relink (kockázatos jogosultsági kapu), saját Gmail Drafts/HTML megőrzés, ütemezett küldési infrastruktúra, teljes napi/Sales/Scarlet lánc, HTML/aláírás és végső használhatóság. Ezek nem késznek jelentett funkciók. Teljes CRM-készség nem igazolt. Utolsó megfigyelt HEAD: `6b2277d`, nem teljes lezárási commit.