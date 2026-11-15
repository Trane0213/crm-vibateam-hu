# Sales és Marketing – 1. szakasz: rendszeraudit és átfogó terv

Csak feltérképezés, tervezés és elkülönített prototípus. Az éles CRM felülete, az adatbázis, a jogosultságok és a kötelező üzleti lépések nem változnak. Nincs e-mail, publikálás vagy fizetős szolgáltatás. A végén STOP, tulajdonosi jóváhagyás.

## Kiindulás
A korábbi munkák alapnak számítanak: Sales és Marketing napi csomagok, az ajánlat P3–P7 fejlesztései, a mai egyszerűsített ajánlatnézet, és az ma elkészült felületvizsgálat és munkakörönkénti terv. Ezeket bővítem, nem írom újra.

## Munkamenet
1. **Feltérképezés (forráskód + adat, csak olvasás)**
   - Sales és Marketing összes oldala, menüpontja, gombja és űrlapja; ezek gépi leltára a kódból.
   - Automatizmusok, AI-műveletek (Timothy, Scarlet eszközei), kötelező ellenőrzések, jóváhagyások és adatbázis-szabályok.
   - Duplikált vagy párhuzamos funkciók, kézi adatbevitel, felesleges képernyőváltások.
   - A két ajánlattípus (kapott Excel, saját VIBA-ajánlat) külön útvonala.
   - Minden funkciónál háromféle jelölés: ellenőrzött működés, következtetés, vagy nem igazolt / részleges / nem létező. Nem létező külső kapcsolatok, például közösségi publikálás vagy hirdetésmérés, külön jelölve.
2. **Munkafolyamat-térkép** a teljes útra: érdeklődő → feldolgozás → Sales-átadás → Pipeline → ajánlat (két típus) → ellenőrzés/jóváhagyás → kiküldés → utánkövetés → szerződés-előkészítés → megnyerés. Marketingnél: napi munka, tartalom, naptár, kampány, érdeklődő-átadás, eredmények.
3. **Egységes VIBA designrendszer** a meglévő arculatra építve: színek, betűk, státuszok, „Következő teendő” minta, gombszabályok, Kanban- és naptárminta, mobil szabályok.
4. **Látványtervek** mindkét munkakör összes fő képernyőjéről, asztali és mobil nézetben:
   - Sales: Ma, Pipeline Kanban, lead/ügyfél adatlap, kapott Excel ajánlat, saját ajánlat, ellenőrzés/kiküldés, utánkövetés, szerződés-előkészítés.
   - Marketing: Ma, érdeklődők feldolgozása, tartalomnaptár, kampány, eredmények.
5. **Kattintható, elkülönített prototípus**: önálló HTML-fájl a Fájlok között, kitalált TESZT-adatokkal. Nem kapcsolódik a CRM-hez, nem ír adatot.
6. **Régi és új folyamatok összehasonlítása** a megadott táblával: képernyők, műveletek, kézi bevitel, automatizált lépések, kötelező jóváhagyások. A számok a kódból számolt becslések, így jelölve; időmegtakarítást nem állítok.
7. **Önellenőrzés és tesztesetek** minden fő folyamatra, a két ajánlattípusra külön. Szempontok: normál használat, hiányzó adat, ha Timothy nem tudja elvégezni, kötelező ellenőrzések megmaradása, oda nem tartozó funkció, párhuzamos adatbevitel, következő lépés láthatósága. A prototípust Playwrighttal ellenőrzöm, asztali és mobil nézetben.
8. **Szakaszos megvalósítási terv** függőségekkel, kockázatokkal és elfogadási feltételekkel.
9. **Egyetlen összesített döntési lista**: csak üzleti, pénzügyi, jogi vagy jogosultsági kérdések.

## Eredmények (Fájlok)
- `sales-marketing-terv/` mappa:
  - egy átfogó tervdokumentum PDF-ben, benne az audit, a leltár, a folyamattérkép, a designrendszer, az összehasonlítás, a megvalósítási terv, a tesztjelentés és a döntési lista;
  - látványterv-képek;
  - a kattintható prototípus HTML-ben.
- Ugyanez szövegesen a projekt dokumentációjában (`docs/system-map/`).

## Technikai részletek
- A leltár a meglévő útvonalfájlokból, a `nav-config`-ból, a `permissions`-ből, az AI OS eszközregiszterből és a migrációkból készül; az adatbázist csak olvasom.
- A prototípus önálló, statikus HTML, a CRM kódjában nem jelenik meg; így az éles felület nem változik.
- A meglévő tesztek változatlanul futnak, kódmódosítás ebben a szakaszban nincs. Ha mégis hibát találok, csak jelzem a döntési listában.
