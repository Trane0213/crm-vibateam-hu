# Timothy Sales AI V3.0 – szakaszos megvalósítás

## Cél és jelenlegi határ
Timothy a meglévő CRM-adatokból dolgozó, forrásokkal igazolt értékesítési asszisztenssé válik. Nem készül második AI-rendszer, új Sales-munkafolyamat vagy párhuzamos Gmail-/ajánlatkezelő.

**A terv jóváhagyása kizárólag P1/A megvalósítását indítja.** P1/B, P1/C, P1/D, majd P2–P5 külön ellenőrzési pont és tulajdonosi jóváhagyás után következnek. Minden rész végén STOP; nincs automatikus publikálás.

## Megőrzendő alapok
- P0 tartós jóváhagyás, eredeti paraméterek, egyszeri végrehajtás és eredmény-visszaellenőrzés változatlan.
- Sales „Ma”, napi besorolás, Budapest-határidők, Pipeline-feltételek, ajánlatértékek és projektátadás maradnak a hiteles üzleti források.
- Bejelentkezés, szerepkörök, Gmail-fiókok, R2-védelem és éles üzleti adatok megmaradnak.
- OpenAI `gpt-4o-mini` marad az alapértelmezés; nincs szolgáltatóváltás.

## P1/A – Cég, kapcsolattartó és lead helyzetképe
1. A tényleges táblák, kapcsolatok és olvasási jogosultságok ellenőrzése, írás nélkül.
2. A meglévő CRM-eszközök cégszűrésének célzott javítása. A forráskódban igazolt: a `crm_list_leads` leadlistán `lead_id` oszlopra szűr `company_id` helyett.
3. Megbízható lapozás a kapcsolódó listákon: stabil rendezés, teljes darabszám vagy egyértelmű részlegességjelzés, következő oldal lehetősége. Nem korlátlan letöltés és nem észrevétlen 25–30 soros csonkolás.
4. Cégadatok, kapcsolattartók, saját hozzáférésű leadek, kapcsolódó projektek, aktivitások, státusztörténet és következő lépés összekapcsolása a meglévő adapterben.
5. Timothy időrendi, rekordokra hivatkozó összefoglalója: aktuális helyzet, utolsó igazolt kapcsolat, dokumentált igények, nyitott kérdések, határidő és külön megjelölt javaslat.
6. Lekérdezési hiba nem alakulhat üres listává vagy hamis nullává. Nem hozzáférhető/hiányzó adatból nem készül állítás; a jogosult részhalmaz nem nevezhető a cég teljes történetének.

**Ellenőrzés:** konkrét cégszűrés; többoldalas, 30 feletti és 1000 feletti mesterséges adathalmaz; üres és hibás lekérdezés elkülönítése; időrend; forrásazonosítók; idegen Sales-lead kizárása. Célzott tesztek, teljes regresszió és AI acceptance. Éles cég csak olvasva; hitelesített AI-próba kizárólag rendelkezésre álló biztonságos hozzáféréssel.

**Átadás:** változáslista, PASS/FAIL/NEM TESZTELT jelentés, visszaállítási leírás és STOP. P1/A nem ad Gmail-küldést, CRM-írást vagy új napi kártyát.

## P1 további, külön jóváhagyandó részei
### P1/B – Levelezés értelmezése
- A meglévő postafiók-hozzáférés és szinkron-tulajdonlás alapján olvasható üzenettartalom; nem tárgy-/névegyezés alapján összekötött levelezés.
- Beérkezett/elküldött üzenet, utolsó ügyfélválasz, nyitott kérdés és választervezet. Hiányos szinkron külön jelölve.
- Levéltartalom csak adat, nem utasítás; titkok és felesleges személyes adatok nem kerülhetnek a modellhez vagy naplóba.
- Előzetes adatvédelmi és prompt-injection tesztek, fiókspecifikus hozzáférési próba.

### P1/C – Ajánlatok értelmezése
- Aktuális, régi verzió, alternatíva, kapott költségvetés és saját ajánlat megkülönböztetése.
- Nettó érték, kiküldési bizonyíték, érvényesség, utánkövetés és verziókülönbség a meglévő számításokból.
- Nincs új árképzés, önálló ár-/mennyiség-/feltételírás vagy régi verziók összeadása.

### P1/D – Dokumentumok értelmezése
- Meglévő, jogosultan elérhető R2-dokumentum és támogatott melléklet feldolgozása: PDF, XLSX, DOCX, szöveg.
- A használt feldolgozási megoldás és Worker-kompatibilitás külön műszaki ellenőrzést kap; nagy fájlokhoz igazolt állapot- és méretkorlát kell.
- Fájl/verzió/feldolgozási dátum visszakereshető; részleges vagy sikertelen feldolgozás nem teljes műszaki audit.
- Tartós feldolgozási állapothoz szükséges esetleges sémaváltozás csak külön hatáselemzés és rollback jóváhagyása után.

**P1 teljes lezárása:** valós, jogosultan olvasható ügy CRM-/Gmail-/ajánlat-/dokumentumforrásokra támaszkodó összefoglalója, éles írás nélkül.

## P2 – Napi munkaszervezés
- Kompakt Timothy-kártya a meglévő Sales „Ma” elrendezésében, 3–5 ügyhöz konkrét belépőkkel.
- Kizárólag a meglévő napi besorolás és deduplikálás: nincs második prioritásszámítás.
- Felhasználónként, Budapest-naponként legfeljebb egy automatikus AI-helyzetkép; gyorsítótár, külön kézi frissítés, frissességjelzés és hibakezelés.
- Régi automatikus `sales_briefing` futások célzott rendezése, más háttéragent érintése nélkül. Párhuzamos oldalnyitás és két chat sem kerülheti meg a korlátot.
- Lezárás: a kártya ügylistája és számai egyeznek a Sales „Ma” adataival; futásszám konkrétan tesztelt.

## P3 – Jóváhagyott CRM-adminisztráció
- Megtörtént Hívás/E-mail rögzítése a meglévő szerveridős szabály szerint; következő lépés, utánkövetés és megengedett státuszváltás előkészítése.
- Felelősmódosítás csak meglévő jogosultsággal; won csak `sales_mark_won_with_project` útvonalon.
- Szerkeszthető e-mail-tervezet és küldés a meglévő Gmail-küldési útvonalon, P0 jóváhagyáshoz kötve.
- Jóváhagyás tartalmazza a teljes üzenetet, fiókot, címzetteket, ügyet és pontos mellékletverziókat; csak igazolt Gmail-siker módosíthat kapcsolódó ajánlatstátuszt.
- Lezárás: TESZT/izolált adaton dupla kérés, elutasítás, lejárat, hozzáférésvesztés és eredmény-visszaolvasás; nincs automatikus bizonytalan újrapróbálás.

## P4 – Proaktív figyelés
- Meglévő Gmail-/CRM-események szabályalapú ellenőrzése, ügyfélválasz, ajánlat és határidő felismerése.
- Jogosult ügyek, stabil eseményazonosító, deduplikált javaslatok; már létező nyitott utánkövetéshez nem készül új automatikusan.
- AI csak tartalmi értelmezéshez, mérhető felhasználó-/funkciószintű tokenhasználattal és becsült költséggel.
- Megjelenítés a meglévő Ma, ügyadatlap, AI-panel és indokolt esetben értesítés felületein.

## P5 – Végső ellenőrzés és bevezetési kapu
- Owner, Sales, Marketing, PM és jogosulatlan szerep: adatolvasás, eszközjogosultság és írási védelem külön ellenőrizve.
- Valós adaton csak olvasás; írás, küldés és projektátadás TESZT/izolált környezetben, külön engedéllyel.
- Két meglévő chat teljes hitelesített P0-próbája kötelező a bevezetés előtt; az izolált teszt nem helyettesíti.
- Pontosság, hiányos adatok, források, napi egyezés, duplikációvédelem, mérés és költség ellenőrzése.
- Nem végzett teszt: **NEM TESZTELT**, nem PASS. Hitelesített hozzáférés hiánya esetén ezt nyitott akadályként rögzítjük; jelszót chatben nem kérünk.
- Kézikönyv és rendszertérkép frissítése kizárólag a ténylegesen ellenőrzött működésből; publikálás külön jóváhagyással.

## Műszaki megvalósítási korlátok
- Olvasás a felhasználó RLS-es kliensével a meglévő `src/lib/ai-os/adapters/` alatt; admin nem használható általános CRM-olvasásra vagy szerepkör megkerülésére.
- A közös runtime, tool registry, constitution és két chat megmarad. Új AI-írás a P0 meglévő jóváhagyási rendszeréhez csatlakozik.
- Server-funkciók, Worker-feldolgozás és esetleges SQL előtt a vonatkozó futtatási/séma/jogosultsági szabályok ellenőrzése kötelező.
- P1/A alapértelmezetten nem igényel migrációt. Ha a sémaellenőrzés mégis szükségességet igazol, megállás pontos hatáselemzésre, migrációs és visszaállítási tervre.
- Tesztek nem vizuális szöveget, hanem konkrét szűrést, hozzáférést, határidőt, korlátot és végrehajtási eredményt ellenőriznek.