# 2. szakasz – meglévő kampánykezelés befejezése

## Már ellenőrzött célzott javítás
A mentett HTML címzettenkénti előnézete megőrzi a formázást és biztonságosan helyettesíti be a cég/ellenőrzött személy nevét. A TESZT-küldés azonos kampányváltozat/címzett esetén meglévő kísérlet, bizonytalan válasz vagy olvasási hiba mellett zárolva marad. 80 kampányteszt PASS, AI acceptance 21 PASS, fordítás OK; elkülönített asztali/mobil HTML-próba PASS. Bejelentkezett Gmail-próba továbbra NEM TESZTELT.

## Ebben a szakaszban elkészül
- A meglévő CRM-levélíró formázó részének közösítése a kampánnyal, nem második levélíró. A kampány a CRM-ben nulláról megírható, Gmail-import nélkül.
- Mentett tárgy, szöveg és HTML; cég/ellenőrzött név személyre szabás, címzettenkénti előnézet. A kért HTML-aláírás külön rész, formázott paste és HTML-kód; pontosan egyszer a végére kerül. Importált, már aláírt levélhez nincs automatikus duplázás. A közös navigáció és teljes levélíró-átalakítás az 5. szakaszban marad.
- Jóváhagyás a pontos mentett üzenetre és kijelölt címzettlistára; saját aktív céges fiók, címzettenkénti ütemezés, szüneteltetés/leállítás és tartós hibajelzés.
- A meglévő Gmail-küldési út újrahasználata, nem új levélszállítás. A napi 40/fiók keret a TESZT- és későbbi ügyfélküldési foglalások közös összege, Budapest-nap szerint. Bizonytalan eredmény nem próbálható újra automatikusan.
- Valós állapotszámok: várakozó, foglalt, igazoltan elküldött, bizonytalan, tiltott, leállított. Válaszadat csak pontos saját Gmail/CRM-bizonyítékból; nem piszkozatból.

## Adatmegőrző sémabővítés – jóváhagyási kapu
**Meglévő email_campaigns:** nullable `signature_html text`, `signature_text text`, `delivery_state text`, `approved_revision timestamptz`, `approved_by uuid`, `approved_at timestamptz`. A levél HTML-je továbbra a meglévő `message_html`; nem új kampányadatbázis. Védett, revízióellenőrzött mentés és audit; importproveniencia megőrzése vagy explicit leválasztása. Tartalom/célzás változás érvényteleníti az engedélyt, régi foglalás soha nem indul új tartalommal. A delivery állapot elkülönül a meglévő draft/prechecked/archived státusztól; prechecked továbbra nem küldési engedély.

**Egy technikai küldési munkasor a meglévő kampányhoz**, `campaign_delivery_items`: `id uuid`, `campaign_id uuid`, `campaign_revision timestamptz`, `contact_id uuid nullable`, `company_id uuid nullable`, `user_id uuid`, `mailbox text`, `recipient_email text`, `mode text`, `scheduled_at timestamptz`, `snapshot jsonb`, `snapshot_hash text`, `state text`, `claim_token uuid nullable`, `claimed_at/finished_at timestamptz nullable`, `budapest_day date nullable`, `gmail_message_id text nullable`, `email_id uuid nullable`, `reason text nullable`, `created_at timestamptz`. TESZT-módban csak a két engedélyezett cím, ügyfélmódban pontos kontakt/cég szükséges. Snapshot = jóváhagyott tárgy/szöveg/HTML és azonosítók, credential nélkül. Egyediség `(campaign_id,campaign_revision,mailbox,recipient_email)`; claim állapot nem állítható vissza várakozóra. A címzett-előellenőrzés sorainak újramentése nem törölheti a küldési előzményt.

**Hozzáférés:** service_role explicit grant, RLS bekapcsolva; nincs anon/authenticated közvetlen grant vagy policy az új munkasorra. Hitelesített szerverfunkció a felhasználó saját RLS-es kampány/kontakt jogait ellenőrzi, majd szűk szerverműveletet hív. Owner/Marketing jelenlegi scope és saját fiók megmarad; más kolléga Gmail-hozzáférése nem bővül. Minden új RPC service-only, security invoker; jogosult userId-t kizárólag hitelesített szerver adhatja.

**RPC-k:** védett tartalommentés; kampány jóváhagyása/ütemezése; pause/resume/stop; atomic claim; finish/readback. Claim sorzár + cím/mailbox advisory lock mellett ellenőrzi aktuális szerepet, kampányengedélyt és snapshotot, időpontot, saját aktív fiókot, jelenlegi kontakt/cégkapcsolatot, hibás címet, cím- és cégtiltást, közös napi keretet. A korábbi TESZT-claim is a közös keretet számolja; TESZT-címkorlát és bizonyítékfeltétele nem gyengül. Stop a még nem foglalt sorokat állítja le; már folyamatban lévő küldésről nem állítjuk, hogy azonnal visszavonható.

**Bizonytalan előzmény:** a jelenlegi előellenőrzés nem igazol teljes Gmail-történetet. Ezt nem alakítjuk át „kész” állapottá. Ügyfélmódban csak biztonságosan engedélyezhető sor ütemezhető; bizonytalan eset blokkolt marad. A teljes lánc izolált TESZT-adattal igazolható, de ez nem engedély ügyfélküldésre.

**Hatás:** régi sorokhoz nincs backfill, nincs ügyfél/email átírás, relink vagy Sales-lead. Az új mezők üresek maradnak használatig. Jogosultságok csak az új technikai út szűk szerverhatárát kapják.

**Visszaállítás:** új RPC execute jog visszavonása és vezérlők kikapcsolása; mezők, munkasor, audit és Gmail-bizonyítékok megmaradnak. Nincs adat- vagy levéltörlés. A régi TESZT-út napi keretéből nem hagyhatók ki a már létező új foglalások.

## Ütemezés aktiválása és külső függőség
A külső Supabase mellé Lovable nem biztosít automatikusan időzített HTTP-hívást. Nem hozunk létre kézzel pg_cron/pg_net HTTP-hívó rendszert. A biztonságos, hitelesített feldolgozó elkészülhet, de böngészőbezárás után futó időzítéshez külön külső ütemező bekötése szükséges, az aktiválás előtt egyeztetve. Addig a felület világosan jelzi az inaktív feldolgozást, nem ígér automatikus küldést. Nem tárolunk felhasználói munkamenet-tokent a munkasorban.

A kétirányú valódi Gmail-piszkozatírás a korábbi kérés része marad, de nem építünk hozzá önálló levelezőrendszert; a közös szerkesztő és tartós foglalási modell elkészülte után kezelhető. Nem aktiválunk most tömeges Gmail-piszkozatgenerálást.

## Egy összevont ellenőrzés, majd STOP
Izolált PostgreSQL: scope, revízió, párhuzamos claim, napi 40 közös keret, friss tiltás, pause/stop, immutable snapshot és auditrollback. Gépi teljes lánc: kampány → szerkesztés → ellenőrzés → jóváhagyás → időzítés → szimulált Gmail/CRM igazolás → napló. HTML-aláírás és személyre szabás teszt; meglévő kampány/Gmail/AI regresszió; desktop/mobil.

Valódi saját Gmail-küldést nem indítunk. Bejelentkezett szerepkörös végigpróba jelenleg **NEM TESZTELT** (external_unmanaged); a 2. szakasz teljes készsége csak tényleges elfogadási eredmény alapján állítható.

A jóváhagyás a célzott sémabővítésre és megvalósításra vonatkozik; **nem** éles ügyfélkampányra, külső ütemező aktiválására vagy publikálásra. A 3. szakasz csak új „Mehet” után indul.
