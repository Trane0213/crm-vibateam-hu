# Formázott Gmail-piszkozatok tartós kampánymentése

## Eredmény
A saját Gmail-piszkozat tárgya, teljes szöveges és HTML-változata, valamint eredeti forrásazonosítója a meglévő kampányban megőrizhető. Az eredeti Gmail-piszkozat és a címzettlista változatlan marad.

## Megvalósítás
- Explicit átvétel csak mentett, nem archivált, nem módosított kampányba; friss saját Gmail-olvasás után. Módosult kampány vagy piszkozat esetén új ellenőrzés, nincs vak ismétlés.
- Owner a jogosult kampányokat, Marketing kizárólag saját kampányát és saját aktív céges Gmail-fiókját használhatja.
- Teljes HTML és szöveg külön mentése; eredeti draft/message/fiók/idő/felelős és tartalomhash visszakereshető. Mellékletes, hiányos vagy túlméretes piszkozat továbbra elutasítva, nem veszteséges import.
- Mentett HTML biztonságos előnézete; formázott forrás nem törlődhet sima szöveg szerkesztésével. Külön megerősített szövegesre váltás, naplózva.
- A meglévő TESZT-küldő Gmail-út használja a mentett HTML-t; változatlan napi 40/fiók, két engedélyezett TESZT-cím, saját fiók és igazolt Gmail+CRM bizonyíték. Ebben a körben valódi küldés nem indul.

## Adatvédelmi kapu és technikai részletek
Friss olvasás: egy kampány, mentett üzenet nélkül; jelenlegi szerep- és RLS-szabályok megmaradnak. A szükséges migráció két nullable mezőt ad az **email_campaigns** táblához: `message_html`, `gmail_draft_source`. Új CRM-modul, tagságtábla, backfill, jogosultságbővítés nincs.

A pontos SQL-javaslat: `database/campaign_gmail_source_2026-11-06.sql`. Védett trigger és service-only, sorzárolt, revízióellenőrzött importeljárás; a szerver előtte a felhasználó jogosultságával olvas, friss saját Gmail-tartalmat ellenőriz, utána pontos mentést olvas vissza. Import és tartalommentes aktivitásnapló egy tranzakcióban.

Visszaállítás: az új importengedély visszavonása, mentett HTML/forrás/audit megőrzése; oszlopokat és üzleti sorokat nem törlünk. Formázott kampányra régi, csak szöveges küldést nem állítunk vissza. A migráció csak jóváhagyás után alkalmazható; most nincs éles séma- vagy adatírás.

## Ellenőrzés és határok
Izolált SQL-próba: szerepek, idegen kampány/fiók, párhuzamos és elavult mentés, hiányos forrás, közvetlen mezőírás, teljes visszagörgetés naplóhiba esetén. Célzott HTML/szöveg/hash/küldési regresszió és asztali/mobil megjelenítés.

Hitelesített saját Gmail–kampány mentési végigpróba továbbra nem elérhető a külső Supabase-munkamenet hiányában; nem jelenthető sikeresnek. Ütemezés, ügyfélküldés, publikálás, levélszál-átkötés, Sales/ajánlat/Timothy módosítás nem része ennek a kapunak.