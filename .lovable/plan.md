# Webes igények tartós ismétlésvédelme

## Eredmény
A meglévő „Felvétel a CRM-be” művelet legyen egyetlen, teljes mentés: cég, kapcsolattartó és eseménynapló együtt. Ugyanarra az igényre két ablakból vagy újratöltés után sem készülhet újabb cég. Időtúllépés után a mentett eredmény ellenőrizhető legyen, ne kelljen találgatni vagy vakon újra felvenni.

## Frissen ellenőrzött alapok
- 18 webes igény, 664 cég, 701 kontakt, 8 lead.
- A weboldali szinkron csak új sort szúr be; ismételt source_lead_id esetén nem írja át a meglévő igényt. A felvételi eredmény mezői ezért nem sérülnek az ismételt webes beküldéstől.
- A webes igények továbbra sem érhetők el közvetlenül böngészőből; nincs rájuk kliensoldali olvasási szabály.
- A jelenlegi felvétel két külön kliensmentés és naplózás; ezt váltja fel az egyetlen tranzakció. A cég- és kontaktjogok, Marketing/Sales/PM működés nem változnak.

## Egy összevont megvalósítás
1. A meglévő igényhez mentett cég-/kontaktazonosító, felvevő és szerveridő kerül. Régi sorokon üres marad; nincs automatikus kitöltés vagy adatjavítás.
2. A szerver hitelesített Owner/Marketing felhasználót ellenőriz. A mentés csak a tárolt igény alapján dolgozik, nem fogad el kliensből nevet, emailt vagy másik cégazonosítót. A döntés és TESZT-besorolás ugyanazokat a meglévő szabályokat követi.
3. Az igény sorának zárolása és ismételt egyezésellenőrzés után egy tranzakció menti a céget, kontaktot, naplót és eredményazonosítókat. Bármely hiba mindent visszagörget. Azonos igény ismétlése a már mentett eredményt adja vissza, nem új sort.
4. Azonos normalizált email/név egyidejű felvétele ezen az úton sorba rendeződik; pontos egycéges email-egyezés csak megnyitási eredmény, nem összevonás. Név-, többcéges vagy régi részleges felvételi egyezés kézi ellenőrzés marad. Más modulból történő cégfelvétel teljes globális duplikációvédelmét nem ígérjük.
5. A meglévő igénykártya a szerver eredményét és felhasználói jogosultsággal visszaolvasott céget/kontaktot mutatja. Bizonytalan válasznál csak eredményellenőrzés; nincs automatikus újraküldés. A régi kétlépéses íróút kivezetése és közös adatfrissítés ugyanebben a körben történik.

## Hatás és visszaállítás – jóváhagyási kapu
- Tervezett séma: négy nullable mező a meglévő quote_requests táblán (intake_company_id, intake_contact_id, intake_by, intake_at), a cég/kontakt referenciák megőrzésével. Nincs új CRM-tábla vagy modul.
- Egy kizárólag service_role által hívható, security-invoker mentőeljárás; public/anon/authenticated végrehajtás tiltott. Az eljárás is ellenőrzi a megadott felhasználó Owner/Marketing szerepét. A szerver előtt ugyanez felhasználói jogosultsággal ellenőrzött; nincs általános admin CRUD út.
- quote_requests RLS továbbra aktív és klienspolicy nélkül; cégek/kontaktok/leadek meglévő RLS-je és triggerei változatlanok. Az új eljárás kizárólag erre az engedélyezett, tárolt igényből származó felvételre használ jogosított szerverírást.
- Nincs régi cég/kontakt átírás, összevonás, automatikus Sales-lead, Gmail-küldés, AI-módosítás vagy publikálás.
- Visszaállítás: új mentőeljárás végrehajtásának visszavonása és felvételi gomb letiltása; eredménymezők és audit megmaradnak. Nem állunk vissza a veszélyes kétlépéses írásra, és nem törlünk már mentett üzleti sort.

## Ellenőrzés és STOP
Egy összevont tesztkör: Owner/Marketing siker, Sales/PM/anon tiltás; két párhuzamos azonos igény; ismétlés és időtúllépés utáni visszaolvasás; kontakt/audithiba teljes rollback; többcéges és régi részleges egyezés tiltása; TESZT-jelölés; 0 automatikus lead; weboldali duplicate-szinkron változatlan. Elkülönített PostgreSQL és felületi TESZT-adatok, éles adatokon kizárólag olvasás. Hitelesített éles végigpróba továbbra hozzáférési korlát miatt NEM TESZTELT, ha a munkamenet nem elérhető.

Jóváhagyás után a pontos SQL és visszaállítási fájl elkészül, az adatbázis-módosítás külön migrációs jóváhagyással alkalmazható; utána rövid közös eredményjegyzet és STOP.