# VIBA CRM – Sales V1.0 teljes véglegesítési és oktatási terv (rögzítve: 2026-10-30)

Forrás: tulajdonosi brief (feltöltött dokumentum). A terv 5 külön szakaszban hajtandó végre, szakaszonkénti jelentéssel és tulajdonosi elfogadással.

## Alapvető követelmények (kötelező szabályok)

- Nincs új CRM, új Sales-funkció, új adatbázis, új AI-ügynök, teljes UI-átalakítás.
- Megmaradó üzleti folyamat: Marketinges előminősítés → Sales-előkészítés → ügyfélaktivitás és következő lépés → Pipeline → ajánlat és utánkövetés → megnyert/elveszett → megnyert esetén projekt.
- A marketinges átadás nem kerül automatikusan Pipeline-ba.
- A Marketing V1.0 működése, az 1/B RLS és az 1/C R2-védelem sértetlen marad.
- Éles lead/ajánlat/projekt/szerepkör nem módosítható tesztelés céljából.
- Csak igazolt működési hiba javítható; üzleti szabályok újratervezése tilos.
- A dokumentáció a javítás utáni tényleges működést írja le.
- Éles adat- vagy jogosultsági séma módosítás csak külön jóváhagyással.

## Szakaszok

### S1 – Sales-előkészítés és leadkezelés (ELSŐKÉNT)
- Kiindulás: a Marketing V1.0 tesztből meglévő „TESZT – Marketing E2E 2026-10-30" céghez tartozó, Ramonhoz kiosztott `new` lead (id: 43b05791-5a41-4e33-ba3b-336dd2af77bd). Új tesztcég/lead feleslegesen nem hozható létre.
- Ellenőrizendő: Ramonhoz tartozik-e; Sales-joggal látja-e a Lead munkafelületen; megnyitható-e; helyes cég/kapcsolattartó; marketinges előzmények és átadási jegyzetek jogosultság szerint; Sales-aktivitás rögzítés és újranyitás utáni megmaradás; következő lépés + határidő; Sales-előkészítő és Pipeline elkülönülése; a lead nem jelenik meg idő előtt az aktív Pipeline-ban; „Új érdeklődő" művelet vizsgálata (a marketinges átadási mechanika nem módosítható); leadforrások dokumentálása.
- Élő belépés: Ramon fiókjával, kizárólag a Lovable biztonságos hitelesítőadat-bekérőjén keresztül (Secret). Jelszó chatbe tilos. Korábbi tesztjelszó engedély nélkül nem használható újra. Ha nincs biztonságos belépés, a böngészős teszt „nem végzett" jelölést kap.
- S1 végén jelentés + megállás jóváhagyásra.

### S2 – Pipeline, ajánlatok és utánkövetések (csak S1 elfogadása után)
- Megtartandó állapotok: Ajánlat előkészítés, Ajánlat kiadva, Utánkövetés, Szerződés, Megnyert, Elveszett.
- Pipeline-ba kerülés nem automatikus a marketinges átadással.
- Ajánlatkezelés végigvizsgálása (létrehozás, tételek, összegek, verziók, aktuális ajánlat, státusz, nyomtatás/export, cég/lead adatlapon megjelenés). Az „Ajánlatok" szerkesztő és a régi „Ajánlatok (riport)" külön ellenőrizendő; félrevezető „hamarosan" felirat/tiltott gomb rendezendő. Új ajánlatkészítő nem épül.
- Utánkövetés: felelős, esedékesség, előzmény, következő lépés, napi teendők, lejárat, lezárás, történet megőrzése.
- Teszt kizárólag TESZT-ügyön; éles ajánlat nem küldhető ki.

### S3 – Megnyert, elveszett és projektátadás
- Elveszett: kötelező indok, előzmények megőrzése, eltűnés az aktív Pipeline-ból, Elveszett nézet, újraaktiválás és jogosultságai. Törlés tilos.
- Megnyert: projektté alakítás a meglévő `sales_mark_won_with_project` tranzakcióval (másik projektlétrehozási folyamat tilos), cég/kontakt átvitel, lead–projekt kapcsolat, ajánlat/utánkövetés kapcsolatok, PM-átadás, duplikált projekt tiltása.
- Vizsgálat elején aktív PM-szerepkörök ellenőrzése; ha nincs jogosult PM, szerepkör-módosítás tilos, az élő megnyerési teszt akadályaként jelölendő.
- Új megnyert TESZT-lead/projekt csak külön jóváhagyással; a meglévő megnyert TESZT-projekt olvasásra használható.

### S4 – Teljes Sales kézikönyv a CRM-en belül
- A CRM-en belüli Sales súgó = a teljes kézikönyv (a Marketingnél bevált Markdown-megoldás újrahasználva, minimális módosítással).
- Egyetlen hiteles, verziózott dokumentum: `docs/manuals/sales-kezikonyv-v1.0.md`; a CRM-ben megjelenő súgó ugyanennek a teljes tartalma.
- Kötelező: minden Sales-szerepkörrel elérhető menüpont/almenü/fül/gomb/ikon/kereső/szűrő/űrlapmező/státusz/hibaüzenet; műveletenként hely, cél, kattintásról kattintásra használat, kötelező mezők, mentés hatása, eredmény helye, továbbhasználó modul, hibajavítás, tiltások.
- Külön napi munkarend (11 lépés), Timothy/George AI-asszisztensek fejezete, legalább 4 példafolyamat (élőben tesztelt lépések jelölésével), teljes menü- és gombinventár egyeztetve.

### S5 – Sales V1.0 végső átvétele
- Kötelező végellenőrzés: átvett lead hozzárendelés, munkafelület, cég/kontakt/előzmények, aktivitás és következő lépés, Pipeline, ajánlat+tételek, mentés/újranyitás/verzió, utánkövetés, elveszett ügy, megnyert ügy + projektátadás (ha a feltételek adottak), jogosultságok és tiltások, mobil+asztali navigáció, Timothy/George, Marketing V1.0 regresszió, kézikönyv teljessége.
- Rendszertérkép-frissítés + Sales V1.0 átadási jelentés (működő funkciók, javított hibák, tesztek, nem tesztelt műveletek, korlátok, jogosultságok, módosított fájlok, rollback, publikálási állapot, kézikönyv helye).
- Automatikus publikálás tilos; a Projektvezetés véglegesítése nem kezdhető el.

## Végrehajtási utasítás

Most kizárólag az S1 hajtandó végre, a meglévő TESZT-lead Sales-oldali átvételéből kiindulva. S1 eredményével jelentés, majd megállás jóváhagyásra.

## Kiinduló állapot ellenőrzése (2026-10-30, csak olvasás)

- Szerepkörök az élő DB-ben: info@vibateam.hu = owner (aktív), ramon.dencsi@vibateam.hu = sales (aktív), viktor.csotai@gmail.com = sales (aktív), pretor.laszlo@vibateam.hu = marketing (aktív), toth.attila@vibateam.hu = marketing (inaktív).
  - Eltérés a korábbi állapothoz: viktor.csotai@gmail.com marketing → sales, pretor.laszlo@vibateam.hu sales → marketing. A változást a tulajdonos végezte; nem módosítjuk.
- TESZT-lead: id 43b05791-5a41-4e33-ba3b-336dd2af77bd, cég „TESZT – Marketing E2E 2026-10-30" (f0761f0b-8765-4631-93ca-65fdd5971302), státusz `new`, source `web_form`, assigned_to = Ramon auth_user_id-je (401cc133-10bd-494b-aa49-28ee14b3266e). A leads.assigned_to az auth.users azonosítót tárolja (nem a users_profile.id-t).
- Meglévő megnyert TESZT-lead (S3-hoz olvasásra): „TESZT-E2E-20261029 Kft", status `won`, assigned_to = info@ auth_user_id-je.
