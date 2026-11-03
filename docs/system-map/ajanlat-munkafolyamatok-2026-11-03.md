# Ajánlatkészítő egyszerűsítés – PASS/FAIL

## Elkészült
- Új ajánlat első kérdése minden ajánlatindító gombnál: kapott költségvetés vagy saját VIBA-ajánlat. Az indítás a meglévő `quote_create_draft` RPC-t használja, utána a meglévő `quote_kind` mező mentése történik. Részleges hiba esetén a létrejött piszkozat megnyílik, a típus adatlapon választható; nem keletkezik automatikus újrapróbás duplikátum.
- Pipeline indítás leadkapcsolata és aktivitásnaplója megmarad. Workspace indítás átadja a lead azonosítóját ugyanennek a meglévő létrehozási útnak.
- Kapott költségvetés: 1. Excel és tervek; 2. Összeg és megjegyzések; 3. Kiküldés; 4. Utánkövetés. A meglévő dokumentumkategóriák eredeti/árazott Excelre és tervekre használhatók. Saját sablon, saját PDF és CRM-tételszerkesztő nincs ebben a munkamódban.
- Saját VIBA: 1. Alapadatok; 2. Ajánlat összeállítása (árak, tételek, műszaki tartalom, sablonfeltételek az élő előnézet mellett); 3. PDF és kiküldés (mentett PDF, dokumentumok, meglévő Gmail); 4. Utánkövetés.
- Fejléc megmaradt. Verziók, alternatívák és típusváltás összecsukott további műveletekben. Korábbi típus nélküli ajánlatnál választó; zárolt példánynál csak helyi megjelenítési választás, nem ír adatot. Munkamódváltás nem törli a korábbi tételeket, dokumentumokat vagy feltételeket.

## PASS
- Teljes regresszió 130/130; AI acceptance 12/12; fordítás build OK.
- Négy új szabályteszt: kapott munkamód nem saját szerkesztő; saját munkamód szerkesztő és dokumentumok; négy lépés mindkét módban; típus nélküli rekord nem automatikusan besorolt.
- Elkülönített böngészős TESZT (mockolt rekordok, nincs valódi munkamenet): kapott munkamód négy fő lépés, nincs sablon, kézi összeg megmarad lapváltáskor; saját munkamód négy lépés, feltételmódosítás élő dokumentumba kerül és lapváltás után megmarad. Képernyőkép ellenőrizve, JS-hiba nincs. Tesztindító eltávolítva.

## NEM TESZTELT
- Hitelesített valós TESZT ajánlatindítás/típusmentés mindhárom belépési pontból, R2 fel-/letöltés, PDF és Gmail-küldés, utánkövetés mentése. Külső Supabase nem ad át biztonságos munkamenetet; korábbi chatjelszó nem használható. Az elkülönített felületi teszt nem igazolja ezeket az éles műveleteket.

## Védelem és STOP
Nincs séma-, RLS-, jogosultság- vagy Pipeline-üzleti módosítás. Nem történt éles adatírás, fájlművelet, email vagy publikálás. Visszaállítás: kizárólag az érintett felületi fájlok előző változatára; nincs DB rollback szükséglet. A feltételek, PDF, Gmail és utánkövetés továbbra is saját meglévő mentésüket használják. STOP.