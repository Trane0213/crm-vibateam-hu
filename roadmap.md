# Roadmap – UI/UX és AI megújítás (jóváhagyott terv, lépésenként jóváhagyással)
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
