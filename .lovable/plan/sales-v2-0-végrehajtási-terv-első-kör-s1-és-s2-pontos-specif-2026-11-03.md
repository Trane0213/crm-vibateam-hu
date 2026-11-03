# Sales V2.0 – végrehajtási terv (első kör: S1 és S2 pontos specifikációja)

A tervezet alapján először csak S1 és S2 pontos specifikációja készül el, csak olvasással. Javítás csak a specifikáció tulajdonosi jóváhagyása után, külön körben. S3–S6 későbbi, külön jóváhagyott szakasz.

## Keretek (minden lépésre érvényes)
- Nincs új CRM, Pipeline, AI-agent, modul vagy második navigáció.
- Éles adat, jogosultság, adatbázis-szerkezet nem változik. Nincs tömeges státuszváltás, nincs újraimport.
- Az 5 importált, Ramonhoz rendelt ügyet csak olvassuk, nem léptetjük automatikusan.
- Próbák kizárólag TESZT-jelölésű rekordokon. Publikálás nincs.
- Minden pont eredménye: PASS / FAIL / NEM TESZTELT, rekordazonosítóval és bizonyítékkal.

## 1. lépés – S1: a Sales-folyamat szabályainak ellenőrzése (csak olvasás)
A teljes út végigkövetése: Marketing minősítés → felelős → Sales előkészítés → Pipeline → ajánlat → utánkövetés → szerződés → megnyert/projekt vagy elveszett.

Szabályonként megnézzük, hogy a képernyő és az adatbázis ugyanazt engedi-e:
1. Minden aktív ügynek van-e egyértelmű felelőse (felelős nélküli aktív ügyek listája).
2. Más értékesítő ügye nem jelenik-e meg saját teendőként.
3. Kiosztatlan közös leadek külön kezelése.
4. Megtörtént aktivitás és jövőbeli teendő elkülönülése.
5. Következő lépés típusa, dátuma, időpontja megbízhatóan mentődik (a 11-03-i javítás ellenőrzése).
6. Pipeline-ba csak teljesen előkészített lead kerülhet (gomb és adatbázis egyezik).
7. Meglévő ajánlat nem jön létre újra; piszkozat nem számít kiküldöttnek.
8. Megnyert ügyből csak egy projekt; elveszettnél az előzmények megmaradnak.
9. Az 5 importált ügy pontos állapota: felelős, fázis, következő lépés, hiányok.

Kimenet: hibalista (bizonyított hiba / feltételezés elkülönítve) és ügyenkénti állapottábla.

## 2. lépés – S2: a Sales „Ma” oldal pontos specifikációja (csak olvasás)
- A jelenlegi „Ma” oldal minden blokkjának és számlálójának leltára: honnan számol, kinek mit mutat, hol duplikál.
- Javasolt végleges sorrend a tervezet szerint: P1 lejárt teendők, P2 mai feladatok, P3 friss feldolgozatlan érdeklődők, P4 válaszra váró ajánlatok, P5 hiányos/elakadt ügyek.
- Mindegyikhez: pontos szűrési szabály, egyetlen közös adatforrás, megjelenő mezők, melyik munkafelületre visz a kattintás.
- Követelmények ellenőrzése: saját ügyek alapból, tulajdonosi csapatnézet külön, Budapest idő, TESZT elkülönítés, lezárás után azonnali frissülés, lekérdezési hibánál hibaüzenet hamis nulla helyett.
- Eltérés-lista: mi van már kész, mi hiányzik, mi ismétlődik.

## 3. lépés – Specifikáció dokumentálása és STOP
- Egy dokumentum a meglévő rendszertérkép mappában: S1 eredmények, S2 specifikáció, priorizált javítási lista (érintett képernyő, kockázat, teszt, visszaállítás).
- Megállás tulajdonosi jóváhagyásra. Javítás csak a jóváhagyott tételekre, egyenként.

## Későbbi szakaszok (most nem indulnak)
- S3 Timothy AI ellenőrzése (eszközök, jogosultság, közös teendőlista, Sales Briefing egyeztetése, költség).
- S4 ajánlatok, verziók, utánkövetés, lezárás, riportok TESZT-próbája.
- S5 szerepkörönkénti átvételi teszt (Ramon, Marketing, Tulajdonos, AI), asztali és mobil.
- S6 Sales-kézikönyv frissítése, napi munkarend, éles átadás.

## Technikai részletek
- Olvasott források: Sales „Ma” oldal és munkafelület komponensei, lead/ajánlat/utánkövetés lekérdezések és mutációk, leads/quotes/followups RLS és triggerek, owner-kpis közös definíció.
- Adatbázis: csak SELECT lekérdezések; az 5 importált lead és TESZT rekordok állapota.
- Böngészős próba csak biztonságos munkamenettel; jelszót chatben nem kérünk. Ha nincs, NEM TESZTELT jelölés.
