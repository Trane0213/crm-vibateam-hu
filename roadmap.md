# Roadmap – UI/UX és AI megújítás (jóváhagyott terv, lépésenként jóváhagyással)
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
