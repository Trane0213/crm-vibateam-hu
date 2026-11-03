# Roadmap – UI/UX és AI megújítás (jóváhagyott terv, lépésenként jóváhagyással)
## Timothy Sales AI V3.0 (2026-11-03)
- [x] Feltöltött specifikáció feldolgozása; meglévő kapcsolódások olvasásos ellenőrzése és szakaszos terv előkészítése.
- [x] P1/A célzott CRM-adatértelmezés: cégszűrés, lapozás, forrásos leadelőzmény, hibajelzés; 170/170 regresszió, AI 13 forgatókönyv, build PASS; jelentés és STOP.
- [ ] P1/A hitelesített Timothy/több-szerepkörös végigpróba: external_unmanaged Supabase, nincs átadható biztonságos munkamenet.
- [x] P1/B tárolt Gmail-tartalom: fiókhoz kötött olvasás, szinkronhiány, források és tartalomvédelem; 185/185 regresszió, AI 14 forgatókönyv, build PASS; jelentés/STOP.
- [ ] P1/B hitelesített két-chat levélértelmezés és modellminőségi/adversarial próba: external_unmanaged Supabase, nincs átadható munkamenet.
- [x] P1/C ajánlatértelmezés: nettó, verziók/alternatívák, küldési bizonyíték, utánkövetések, összehasonlítás; 204/204 regresszió, AI 15 forgatókönyv, build PASS; jelentés és STOP.
- [ ] P1/C hitelesített két-chat/valós RLS és modellminőségi próba: external_unmanaged Supabase, nincs átadható biztonságos munkamenet. P1/D–P5 külön jóváhagyásra vár, nem indult.

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
