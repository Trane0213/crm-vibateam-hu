# Kampányok: HTML-aláírás és közös CRM–Gmail piszkozatok

## Eredmény
A meglévő kampánylistában Gmail-szerű, formázott levelet lehet előkészíteni, végén HTML-aláírással. A kijelölt, ellenőrzött címzetteknek külön **valódi piszkozat** készül a bejelentkezett felhasználó saját aktív céges Gmail-fiókjában. Ezek a CRM-ből megnyithatók, frissen visszaolvashatók és szerkeszthetők; a Gmailben végzett módosításokat nem írjuk felül észrevétlenül.

A csatolt kép megjelenítési referencia. Nem készül belőle levélbe illesztett képernyőkép, és a személyes aláírásadatokat nem találjuk ki.

## Meglévő kampánylista bővítése
- Formázott levélszerkesztés, tárgy, címzettenkénti előnézet, meglévő ellenőrzött név/cég behelyettesítés.
- Külön aláírásrész: formázott beillesztés a Gmailből **és** HTML-kód beillesztése, biztonságos előnézettel. Az aláírás a levél végére egyszer kerül; módosítása nem halmozza a korábbi változatokat.
- A kampányban külön mentett aláírás és formázott tartalom; az importált Gmail-forrás védelme megmarad. Már aláírt importnál nem illesztünk új aláírást automatikusan: a hozzáadás külön tudatos választás.
- „Gmail-piszkozatok létrehozása” a mentett, ellenőrzött címzettekre; előtte fiók, címzettlista, darabszám és teljes levél ellenőrizhető.
- Címzettenként állapot és Gmail-megnyitás; tényleges visszaolvasás nélkül nincs sikerjelzés.

## CRM és Gmail együtt használva
- Csak a meglévő, saját aktív céges Gmail-kapcsolat használható. Kolléga fiókjára nem váltunk, nem csatlakoztatunk újra fiókot.
- Kijelölt címzettenként egy levél készül; nincs közös To/CC/BCC tömeglevél.
- A cégtiltás, címtiltás, hibás cím, bizonytalan előzmény, pontos kontakt/cég kapcsolat és névellenőrzés a meglévő előellenőrzésből származik, létrehozáskor frissen ellenőrizve. Tiltott/bizonytalan címzett kimarad, látható indokkal.
- Tartós foglalás védi a dupla kattintást, párhuzamos kérést és újratöltést. Bizonytalan Gmail-eredménynél megállás és ellenőrzés, nem vak újrapróbálás.
- Frissítéskor az aktuális Gmail-piszkozatot olvassuk. Külső szerkesztés esetén összehasonlítás és megerősítés szükséges a CRM-ből történő módosítás előtt.
- Eltűnt piszkozat nem tekinthető elküldöttnek. Küldés kizárólag saját Gmail SENT-bizonyítékkal minősíthető; nem keletkezik automatikusan Sales-lead vagy marketing-megkeresésjelölés.
- Nincs folyamatos kétirányú szinkron ígéret: ebben a körben explicit frissítés és mentés biztosítja az együttműködést, a meglévő levélszinkron mellett.
- A napi **40 elküldött kampánylevél/fiók, Budapest szerint** változatlan. Piszkozat nem elküldött levél, ezért nem fogyaszt küldési keretet. Legfeljebb 40 címzett dolgozható fel egy előkészítési körben, kisebb részletekben. A Gmail saját felületén történő közvetlen küldést a CRM nem tudja megakadályozni; a CRM-korlát nem állítható Gmail-szintű korlátnak.
- Mellékletes forrás nem importálható veszteségesen; a jelenlegi elutasítás megmarad, amíg a teljes mellékletkezelés külön elkészül.

## Technikai változtatás és jóváhagyási kapu
A jelenlegi kampány- és címzetttáblák megmaradnak. A használaton kívüli `email_drafts` táblára nem építünk: jelenleg minden bejelentkezett felhasználóra teljes hozzáférésű szabálya van; ennek jogosultságait ebben a körben nem módosítjuk.

**Tervezett, adatmegőrző migráció:**
1. `email_campaigns`: nullable `signature_html text`, `signature_text text`. A formázott tartalom továbbra a meglévő `message_html` mezőben marad. Védett mentés, hosszkorlátok, változáskor előellenőrzés érvénytelenítése; saját kampány/Owner, revízióellenőrzés és audit. A meglévő importproveniencia csak explicit leválasztással változhat.
2. Egy technikai kapcsolattábla: `campaign_gmail_drafts`, nem új CRM-modul. Mezők: `id uuid`, `campaign_id uuid`, `contact_id uuid`, `user_id uuid`, `mailbox text`, `recipient_email text`, `campaign_revision timestamptz`, `content_hash text`, `gmail_draft_id text nullable`, `gmail_message_id text nullable`, `state text`, `claim_token uuid`, `created_at/updated_at/checked_at timestamptz`. Egyedi kulcs `(campaign_id,contact_id,user_id)`; kampány-előellenőrzés címzettsorainak újramentése nem törölheti a kapcsolatot.
3. A kapcsolattábla csak a szerver által írható/olvasható: explicit `service_role` grant, RLS bekapcsolva, nincs anon/authenticated grant vagy közvetlen olvasási policy. A hitelesített szerverfunkció előbb a felhasználó RLS-es kampány/kontakt-hozzáférését és saját fiókját ellenőrzi, utána olvassa a saját kapcsolatot. Owner sem kap más fiókjának élő Gmail-tartalmához új jogot.
4. Service-only, sorzárolt claim/finish RPC: állapotok `creating`, `ready`, `changed`, `missing`, `uncertain`; immutable tulajdonos/fiók/címzett, metadata-only audit. Foglalás után bizonytalan eredmény nem indíthat új Gmail-create-ot. Friss módosítás külön hash-ellenőrzött foglalást igényel.
5. A Gmail API meglévő saját OAuth-útjának drafts.create/update/get bővítése; nincs új connector, transport vagy OAuth-rendszer. A már megadott jogosultságot nem tekintjük automatikusan működőnek: szolgáltatói hibát bizonyíték alapján kezelünk, újracsatlakoztatás nélkül.

**Hatás:** nincs régi adat feltöltése/átírása, cégegyesítés, levelek törlése, szerepkörbővítés vagy küldési engedély. Az új mezők üresek maradnak használatig. Gmail-műveletet fejlesztés közben nem indítunk.

**Visszaállítás:** új RPC-k végrehajtási jogának visszavonása és az új vezérlők kikapcsolása; minden mentett aláírás, kapcsolatsor, audit és Gmail-piszkozat megmarad. Nem törlünk adatot visszaállításkor, nem törlünk Gmail-piszkozatot automatikusan.

## Ellenőrzés
Egy összevont célzott tesztkör: HTML-biztonság és egyszeri aláírás, ellenőrzött név, szerepkör/saját fiók, friss tiltások, párhuzamos claim, timeout és részleges hiba, külső Gmail-szerkesztés/hash-ütközés, újraellenőrzés után megmaradó kapcsolat. Izolált SQL és Gmail-választesztek; asztali/mobil megjelenítés; AI acceptance regresszió.

A külső Supabase miatt a bejelentkezett saját Gmail végigpróbája jelenleg nem hozzáférhető az automatizált böngészőből; ez nem nevezhető sikeresnek. Valódi TESZT-piszkozat létrehozása és visszaolvasása a megfelelő bejelentkezett fiókból szükséges az elfogadáshoz.

**Nincs levélküldés, ügyfélkampány-aktiválás vagy publikálás.** A jóváhagyás a fenti célzott sémabővítésre és megvalósításra vonatkozik, nem éles tömeges piszkozatgenerálásra.
