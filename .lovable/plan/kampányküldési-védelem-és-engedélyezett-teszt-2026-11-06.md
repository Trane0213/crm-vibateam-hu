# Kampányküldési védelem és engedélyezett TESZT

## E kör határa
A meglévő kampány és Gmail-küldés kap tartós ismétlésvédelmet, napi **40 kampánylevél/fiók** korlátot Budapest-nap szerint, és igazolt marketingtiltás-nyilvántartást. **Ügyfélküldés és automatikus/időzített indítás nem aktiválódik.** Az indítás módjára nem érkezett választás; ebből nem következtetünk automatikus engedélyre.

Egyedi TESZT-küldés csak **viktor.csotai@gmail.com** vagy **info@vibateam.hu** címre engedélyezett, a bejelentkezett felhasználó saját, aktív céges Gmail-fiókjából. Nem kapcsolunk át másik fiókra és nem csatlakoztatunk újra fiókot. Ha az ellenőrzéshez nincs biztonságos saját munkamenet, a valódi küldés elmarad és NEM TESZTELT marad.

## Mit építünk a meglévő rendszerbe?
- A kontakt meglévő szerkesztési helyein igazolt „Marketingküldés tiltott” állapot és kötelező hivatkozás; Owner/Marketing mentheti, szerveridő és ellenőrző, friss előállapot-védelem és aktivitásnapló. Nem használjuk erre a hibás email jelölését vagy a cég elutasított státuszát. Nincs automatikus levélértelmezés vagy visszamenőleges tiltás.
- Tiltás az adott rögzített email-címhez kötött; emailváltozás nem mossa át másik címre és nem engedi elfelejteni az eredetit. Ugyanaz a normalizált cím több kontakt esetén is tiltott. Tiltásfeloldás csak Owner, kifejezett hivatkozással. Nincs tömeges adatírás.
- A kampánytervezetben külön TESZT-címzett választó és megerősítés; mentett tárgy/szöveg kötelező, TESZT tárgyjelölés, nincs CC/BCC/melléklet/ügyfélkapcsolat vagy Sales-lead létrehozás. A mentett kampányszöveget próbáljuk, nem küldünk automatikusan a kijelölt ügyfeleknek. Céges/személynév-helyettesítéshez csak egyértelmű TESZT-értékek.
- Egy jóváhagyott kampányverzió + TESZT-cím + saját fiók kombináció csak egyszer indítható. Párhuzamos kérés, gombismétlés, időtúllépés és bizonytalan Gmail-eredmény nem okozhat újraküldést.
- Napi 40-es keret atomikusan, tényleges fiókazonosító és Budapest-nap szerint; a foglalt és bizonytalan küldés is fogyasztja a keretet. A TESZT is beleszámít. Ez CRM-kampánykorlát, nem Gmail általános napi kvótája és nem vonatkozik a működő ajánlatküldésre.
- Siker csak élő saját Gmail SENT-ellenőrzés és pontos CRM-visszaolvasás után. Külön „nem indult”, „eredmény bizonytalan”, „igazoltan elküldött” állapot; bizonytalan eredményt nem mutatunk sikerként.

## Műszaki hatás és visszaállítás
- Friss SELECT baseline: 664 cég, 701 kontakt, 8 lead, 1 kampánytervezet, 0 címzett. Nincs meglévő tiltólista vagy kampányküldési napló.
- Meglévő kontaktmunkafolyamat + minimális, címhez kötött tiltási bizonyíték és egy tartós kampányküldési audit. A küldési audit nem helyettesíthető a címzettlistával, mert az újraellenőrzéskor cserélődik. Nincs új CRM-modul vagy második levéltároló; maga a levél továbbra is az `emails` táblába kerül a meglévő Gmail-küldőn át.
- Szűk Owner/saját Marketing olvasási jogok, csak szerver írhat küldési claimet/eredményt; Sales/PM és anon nem kap jogosultságot. Metadatahamisítás és auditátírás tiltott. Új táblán explicit jogosultságok, RLS, szűk házirendek ugyanabban a migrációban.
- TESZT-szerverfüggvény hitelesít és kampányjogot ellenőriz, újraolvassa a mentett változatot/saját fiókot. A meglévő `handleGmailSend` szerveroldali `beforeSend`/`verifySent` pontjait használja; AI OS/P0 és ajánlatküldés változatlan. Nem használunk workspace Gmail-connectort másik feladóval.
- Migráció előtt mentjük az érintett szerkezetet/policykat/függvényeket. Visszaállítás letiltja az új végrehajtást, megőrzi a tiltási és küldési bizonyítékokat; nincs oszlop-/naplótörlés vagy jognyitás.

## Összevont ellenőrzés és STOP
TESZT-fixture és célzott szabálytesztek: engedélyezett két tesztcím, más cím tiltás; 40 foglalás után 41. tiltás, Budapest-napváltás; párhuzamos/ismételt claim; elavult kampány; Owner/saját Marketing/Sales/PM; tiltás címegyezés és feloldás; metadata/audit-védelem; timeout és részleges Gmail/CRM-bizonyíték. Asztali/mobil felület, releváns regresszió és fordításellenőrzés.

Valódi TESZT-küldés csak saját hitelesített munkamenettel. Jelenleg external_unmanaged miatt ez nem áll rendelkezésre; nem kérünk jelszót és nem kerülünk meg jogosultságot. Rövid eredményjegyzetben elkülönítjük a tényleges, izolált és NEM TESZTELT eredményt.

E kör után STOP. Ügyfélkampány aktiválása, hiányos történet feloldása és bármilyen időzítés külön döntés; a „mehet tovább” nem jogosít fel ezek megkerülésére.