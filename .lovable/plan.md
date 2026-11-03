# Timothy V3.0 — P2 napi munkaszervezés

## Eredmény
- Kompakt Timothy-kártya a meglévő Sales „Ma” oldalon, az áttekintés és munkalista átrendezése nélkül. A feltöltött P2/A ezt kifejezetten kéri; más szerepkör napi oldala nem kap új kártyát.
- Legfeljebb öt legfontosabb ügy, tényszerű prioritási indoklás, első teendőre javaslat és közvetlen ügymegnyitás.
- A lejárt, mai, új, ajánlatra váró és hiányos ügyek számai a meglévő napi listával egyeznek. Holnapi/későbbi/határidő nélküli állapot külön jelzett.
- Felhasználónként budapesti naponként legfeljebb egy automatikus Sales AI-helyzetkép, ismételt oldalnyitáskor újrafelhasználva. Külön kézi frissítés, készítési idő és megváltozott napi adatok jelzése.

## Megőrzött határok
Sales „Ma” meglévő sorrendje és üzleti számításai, Pipeline, ajánlatkezelés, Gmail, felelősök, P0 jóváhagyások és asszisztensjogosultságok változatlanok. Nincs levélküldés, ügyféladat-írás vagy automatikus publikálás. P3–P5 nem indul.

## Ellenőrzött kiindulás
- A `DailyBriefing` jelenleg minden új csatoláskor automatikus Sales-futást indít; módváltás is újragenerál. A komponensállapot nem véd több böngésző vagy egyidejű kérés ellen.
- A Sales snapshot külön, korlátozott táblalistákat olvas; a hibákat üres listává alakítja. Ez nem egyezik a Sales „Ma” forrásával.
- Nincs napi briefing tárolótábla. Az élő `ai_memory` rendelkezik egyedi tárgy/felhasználó/kulcs-korláttal és privát, létrehozó szerinti olvasással, de a tulajdonosának jelenleg törölhető/írható. Védelem nélkül nem garantál napi egyszeri futást.

## Megvalósítás
1. A napi adatlekérdezést böngésző- és szerveroldalon használható, közös RLS-es betöltőbe emelni; a meglévő `useDailyWork`, `dailyWork`, `salesFocusSections` marad a hiteles forrás. Minden oldalt és ID-köteget stabilan végigolvasni. Hiba esetén hiba, nem nulla. Owner csapatszámítás változatlan, a Timothy-kártya saját ügyeket használ.
2. A kompakt kártya strukturált, ellenőrzött CRM-ügyeket és linkeket jelenít meg, nem szabad modellválasz alapján számol. A modell kizárólag elkülönített rövid javaslatot adhat, nem rendezheti át a napi listát. Mentett szöveg és cégnevek titokszűrés után kerülhetnek a modellhez.
3. A meglévő Sales briefing útvonal napi védelmét közösíteni a kártyával: egy automatikus kvóta ugyanazon felhasználónak a Sales „Ma”, owner Ma és dashboard Sales-helyzetképére együtt. Régi Sales módváltás gyorsítótárból olvas; csak Frissítés indíthat új kézi futást. PM feldolgozás/számítás nem változik.
4. A szerver a saját RLS-klienssel ellenőriz Timothy-hozzáférést és szerepkört, a jogosultságot minden gyorsítótár-olvasáskor ismét ellenőrzi. A korábbi tárolt ügyek hozzáférését újraellenőrzi; elvett ügy tartalmát nem jeleníti meg. A generálás továbbra is a meglévő AI OS `runAgent`, OpenAI `gpt-4o-mini` útvonalán fut; nincs párhuzamos AI-réteg.

## Technikai részletek — előzetes adatbázis-hatás és visszaállítás
**Új üzleti tábla helyett** a meglévő `ai_memory` elkülönített rendszerkulcsai tárolják a napi futás állapotát és privát eredményét. Ez rendszer-gyorsítótár, nem Timothy `memory_write` képessége. A runtime általános memóriaolvasásából e rendszerkulcsokat kizárni, hogy más agent automatikusan ne kapjon régi napi kontextust.

Javasolt migráció, végrehajtás előtt pontos SQL-lel dokumentálva:
- A fenntartott `system:daily-sales:` kulcsnévtér csak service_role szerveroldali írással módosítható; szűk trigger védi INSERT/UPDATE/DELETE során, a régi és új kulcsot is vizsgálva. A többi memória és minden meglévő RLS-szabály változatlan. Rendszersorok csak `private`, saját user tárggyal és azonos created_by értékkel tárolhatók.
- Három csak service_role számára futtatható RPC: `ai_os_daily_sales_claim`, `ai_os_daily_sales_finish`, `ai_os_daily_sales_read`. Felhasználó és Europe/Budapest nap szerinti atomikus foglalás; napot/időt az adatbázis állapítja meg, a böngésző nem adhatja meg.
- Automatikus próbálkozás a modellhívás előtt tartósan elfogyasztja a napi kvótát, sikertelen/ismeretlen kimenetel után sem ismételhető automatikusan. Kézi frissítés külön intent, egyidejű futásoknál egy foglalás, futási tokennel védett lezárás. Beragadt foglalás lejárhat, de a napi automatikus kvótát nem oldja fel; ismeretlen kimenetel után frissítés csak kifejezett felhasználói művelet.
- Tárolt eredmény: korlátozott szöveg, készítési idő, forráslenyomat, státusz és meglévő agent_run azonosító; nincs levéltartalom, fájltartalom, titok vagy aláírt URL. Hozzáférésvesztéskor régi szöveg rejtve marad.
- A `ai_memory` régi adatait nem átírni, nem törölni; alkalmazás közben nincs üzleti tesztadat-írás.

**Visszaállítás:** először a P2 hívófelületek és rendszerkulcs-szűrés visszaállítása, majd csak a P2 három RPC és névtérvédő trigger/függvény eltávolítása. A meglévő memória, AI audit és üzleti rekordok érintetlenek; rendszereredmények megmaradnak, amíg külön döntés nem születik róluk. Éles törlés nincs a rollbackben.

## Ellenőrzés és lezárási kapu
- Konkrét tesztek: közös számlálók és sorrend, legfeljebb öt ügy, deduplikáció, határidő nélküli ügy, Budapest napváltás/téli-nyári idő, adathiba nem nulla, lenyomatváltozás.
- Izolált PostgreSQL: párhuzamos automatikus kérésekből egy foglalás; két user izolált; kézi frissítés és régi token tiltása; kvóta hiba és újranyitás után is megmarad; kliens nem törölheti/átnevezheti rendszerkulcsot; meglévő memóriaírás tovább működik; rollback próba.
- Célzott és teljes regresszió, `bun run ai:acceptance`, automatikus fordítási eredmény, izolált kártya és linkek böngészős ellenőrzése.
- Hitelesített Sales/owner végigpróba és tényleges modellminőség csak biztonságosan elérhető munkamenettel; jelenlegi external_unmanaged korlát mellett **NEM TESZTELT**, nem véglegesnek jelentett.
- Pontos PASS/FAIL/NEM TESZTELT jelentés, visszaállítási dokumentáció és meglévő kézikönyv/rendszertérkép frissítése; STOP, publikálás nélkül.

**Most csak a terv készült; kód, éles adat és adatbázis-védelem nem változott.**