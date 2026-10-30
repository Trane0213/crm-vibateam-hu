# VIBA CRM – 1/B Jogosultsági javítás – végrehajtási jelentés (2026-10-30)

Alap: `1A-jogosultsagi-javitasi-terv-2026-10-30.md` + tulajdonosi döntések D1–D9.

## Előfeltételek (mind teljesült)
- Visszaállító fájl: `database/rollback_rls_1B_2026-10-30.sql` (élő `pg_policies` exportból). Elkülönített adatbázison kipróbálva: visszaállítás után a szabálykészlet **bájtra azonos** az eredetivel, majd újraalkalmazható.
- Felhasznált meglévő függvények: `is_owner_role`, `crm_role_of`, `current_profile_id`, `is_email_admin`, `can_access_email_thread` — mind létezik, `authenticated` futtathatja. GRANT-ok változatlanok.
- `project_notes.author_id`: a felület kitölti (users_profile.id); élő adatban 0 üres.
- `uploaded_by`: a felület kitölti; **3 régi projektdokumentum üres** → ezeket csak tulajdonos törölheti/módosíthatja.
- Dokumentumtörlés: korábban a fájl törlődött ELŐBB → javítva: előbb az adatbázis-sor (ellenőrzéssel), csak sikeres törlés után a fájl.

## Változott adatbázis-szabályok (12 tábla, 45 szabály)
| Tábla | Olvasás | Létrehozás | Módosítás | Törlés |
|---|---|---|---|---|
| companies | 4 szerep | 4 szerep | 4 szerep (D1) | tulajdonos |
| contacts | 4 szerep | 4 szerep | 4 szerep | tulajdonos (D2) |
| phone_calls | 4 szerep | 4 szerep | 4 szerep (D3) | tulajdonos |
| meetings | 4 szerep | tulaj/PM/Sales | tulaj/PM/Sales | tulajdonos |
| tasks | 4 szerep | tulaj/PM/Sales | tulaj/PM/Sales | tulajdonos (D4) |
| project_notes | 4 szerep | tulaj/PM/Sales saját névvel | saját vagy tulaj | saját vagy tulaj |
| project_documents | 4 szerep | tulaj/PM/Sales saját névvel (D5) | saját vagy tulaj | saját vagy tulaj |
| company_documents | 4 szerep | 4 szerep saját névvel (D5) | saját vagy tulaj | saját vagy tulaj |
| project_contacts | 4 szerep | tulaj/PM/Sales | tulaj/PM/Sales | tulaj/PM/Sales |
| email_threads | változatlan | csak tulajdonos | csak hozzáféréssel, ellenőrzéssel | csak tulajdonos |
| emails | változatlan | csak tulajdonos | csak hozzáféréssel, ellenőrzéssel | csak tulajdonos |
| email_attachments | változatlan | csak szerver | csak szerver | csak szerver |
Szerepkör nélküli felhasználó (D8): semmi a fenti táblákban (szálak csak kifejezett hozzárendelés esetén).

## Felületi igazítás (ugyanazt engedi, mint az adatbázis)
- Listák (Cégek, Kapcsolattartók, Hívások, Találkozók, Feladatok): törlés gomb csak tulajdonosnak.
- Projektjegyzet, projekt- és céges dokumentum: törlés gomb csak a sajátnál vagy tulajdonosnak.
- Közös törlés: ha az adatbázis 0 sort töröl (jogosultság hiánya), hibaüzenet jelenik meg „Törölve” helyett.
- D7: `/dashboard` csak tulajdonos, közvetlen URL-lel is. Az alapadatok (leadek, ajánlatok, projektek, utánkövetések, feladatok) más képernyőkhöz is kellenek, és már szerepkör szerint védettek; irányítópult-specifikus érzékeny tábla nincs.

## Tesztek
- Elkülönített PostgreSQL, 5 felhasználó (4 szerep + szerep nélküli) × 12 tábla × műveletek: **előtte 146/265, utána 265/265** helyes. Szerveroldali (service_role) írás e-mail/melléklet/cégre: sikeres.
- Élő adatbázis: a 45 szabály név és művelet szerint megegyezik a tesztelt készlettel; nyitott (`true`) szabály nem maradt.
- Vitest: 29/29 (menü, jogosultság + új D7 teszt, postafiók, rekordkereső, AI-panel). AI acceptance 12/12.
- Gmail: info@ szinkron a változtatás után (11:09 UTC) új levelet mentett. ramon.dencsi@ következő futása még nem volt.
- Tesztfájlok: `database/rls-1B-regression-base.sql`, `database/rls-1B-regression-isolated.sql`.

## Nem igazolt / ismert kockázatok
- Élő felületi próba szerepkörönként: biztonságos bejelentkezés nélkül nem futtatható — felhasználói ellenőrzés szükséges.
- **R2 fájlfüggvények** (feltöltési/letöltési/törlési link) bejelentkezés-ellenőrzés nélküliek: kulcs ismeretében bárki kérhet linket. Nem volt a jóváhagyott 11 pont között — külön döntés.
- Hívások/találkozók/cégek/kontaktok: nincs létrehozó-oszlop, így a jogosult szerepek egymás bejegyzését is módosíthatják (D3 szerint dokumentálva).
- „agent” szerepkör (0 felhasználó): a felület salesként kezeli, az adatbázis nem — a meglévő leads/projects szabályokkal egyezően.
- D9: használaton kívüli nyitott táblák változatlanok. Linter: 14 korábbi figyelmeztetés (nem ez a módosítás okozta).
