# P2 – Tervcsomagok feldolgozása (elkülönített számolókörnyezet) – jelentés, 2026-11-14

Tulajdonosi döntések (18:44 UTC): Cloudflare Containers; P1 + P2 adatbázis élesítése; szkennelt oldalak képfelismeréssel; ZIP-tartalom külön is tárolva.
Nem része: automatikus árazás (P3), részletes rajzértelmezés / szekrényfelismerés (P4).

## 1. Mi készült el

**Elkülönített feldolgozó** – `services/package-processor/` (Node 22 + Poppler, Docker; Cloudflare Worker + Durable Object indítja):
- Csak aláírt (HMAC + időbélyeg) feladatot fogad; kulcsként csak `PROCESSOR_SECRET`-et kap. Adatbázis-, R2- és OpenAI-kulcs nincs nála.
- Hálózati korlát: csak a beállított tárhely-hostra és a CRM-címre kapcsolódik (`ALLOWED_STORAGE_HOSTS`, `ALLOWED_CALLBACK_ORIGINS`; üresen semmit nem fogad el). A ZIP-bejegyzések feltöltési címe csak ugyanarra a tárhelyre mutathat.
- Letöltéskor SHA-256-ot számol és összeveti a feltöltéskor rögzítettel; eltérésnél nem dolgoz fel.
- **Excel** (xlsx/xlsm/xls/ods/csv): munkalapok, cellák, képletek (a szövegük és a mentett értékük), egyesített cellák, rejtett lapok, makró- és külső hivatkozás jelzése; árazatlan költségvetés-fejléc felismerése (tételszám, megnevezés, mennyiség, egység, egységár), árazatlan sorok száma. A teljes szerkezet tömörítve külön kulcsra kerül (`derived/structure.json.gz`), az eredeti fájl változatlan.
- **PDF**: oldalanként szövegréteg; szövegréteg nélküli oldal képpé alakítva → a CRM képfelismerője; jelszavas/sérült PDF jelölése.
- **ZIP**: bejegyzésenként kibontva, a mappaszerkezet megtartásával (`<ZIP helye>/<ZIP neve>/<belső útvonal>`); kilépő/abszolút útvonal, link, jelszavas bejegyzés, rendszerfájl kihagyva; fájlszám-, tömörítési arány- (ZIP-bomba) és mélységkorlát (ZIP a ZIP-ben 1 szintig). Minden kibontott fájl önálló, megnyitható, újra feldolgozott csomagfájl; azonos tartalom duplikátumként jelölve, nem töltődik fel újra.
- **Kép, TXT, DOCX/ODT**: szöveg kiolvasás; kép képfelismeréssel.
- CAD (dwg/dxf…), levél, régi Word: csak tárolva, a jelentésben „Csak tárolva”.

**CRM-oldal**
- `src/lib/packages/processing.server.ts`: feladat létrehozása a feltöltés ellenőrzése után; kiküldés rövid életű, erre az egy fájlra szóló aláírt címekkel és egyszeri feladat-tokennel; a visszajelzések ellenőrzése (aláírás + token + nyitott feladat) és mentése; ZIP-bejegyzések regisztrálása a meglévő zárolt adatbázis-függvénnyel (kvóta, duplikáció); kibontott fájl méret-ellenőrzése a tárhelyen; újrapróbálás; csomagjelentés.
- `src/routes/api/public/package-processor.ts`: a feldolgozó visszajelzési címe (önmagát hitelesíti, más adatot nem ad vissza).
- Képfelismerés: a meglévő OpenAI-képfelismerő (`visionExtract`), **csomagonkénti oldalkerettel** (alap 300 oldal, `settings.document_package_processing`). Ugyanazt az oldalt újrafeldolgozáskor nem fizeti újra. Az eredmény „AI-kiolvasás” jelölést kap.
- Ha a feldolgozó nincs bekapcsolva, a feltöltés változatlanul sikeres, a fájlok „Feldolgozásra vár” állapotban sorban maradnak.
- **Csomagjelentés** (projekt / ajánlat / Dokumentumtár → tervcsomag → „Feldolgozási jelentés”): összesítő (feldolgozva, részben, nem olvasható/hiba, csak tárolva, várakozik, ZIP-ből kibontva, oldalak), szűrők, fájlonként állapot és ok; „Feldolgozás indítása / újrapróbálás” és soronkénti „Újra” azoknak, akik az ügyhöz feltölthetnek (szerver ellenőrzi).

**Timothy-előkészítés** (és a dokumentumolvasó asszisztensek: George, Boss, Scarlet – a felhasználó saját jogával):
- `crm_package_overview` (projekt/ajánlat csomagjai, jelentés, olvashatatlan fájlok okkal), `crm_read_package_file` (oldalak/munkalapok szövege, szerkezet, képletszám, problémák; forrás: fájl, útvonal, oldal, SHA-256), `crm_search_package` (keresés a feldolgozott szövegben).
- Csak olvasás: nem indít feldolgozást, nem fizetős, nem ír. Utasítás: minden állításhoz fájl + oldal; árat/mennyiséget nem számol (P3), rajzot nem értelmez biztosként (P4).

## 2. Adatbázis

P1 (`20261114184622_…`) és P2 (`20261114184925_…`) a 18:44 UTC-s tulajdonosi jóváhagyás után élesben lefutott. P2: `package_processing_jobs`, `package_file_extracts`, `package_file_units` (kereshető szöveg), `package_files.extracted_from/archive_entry/extract_depth`, `document_package_register_extracted`, beállítás `document_package_processing`. Olvasás: a szülő csomag láthatósága szerint (RLS); írás csak a szerver szolgáltatásszerepkörével. Visszaállítási tervezet: `docs/system-map/p2-migracio/99_rollback_package_processing.sql` (nem futtatott). Ebben a körben további adatbázis-módosítás nem történt.

Megfigyelés (nem javítva, döntés kell): a `package_processing_jobs.token` oszlopot a csomagot látó felhasználó olvashatja. Önmagában nem használható (a közös titkos kulcs nélkül a visszajelzés elutasított), de oszlopszintű elrejtése javasolt egy későbbi, jóváhagyott módosításban.

## 3. Tesztek

- Feldolgozó: `node --test` 12/12 (kitalált TESZT-fájlok: szöveges + szkennelt PDF, képletes Excel rejtett lappal, ZIP mappákkal, duplikátummal, kilépő útvonallal, 60 MiB-os ZIP-bomba, aláírás, hálózati korlát).
- CRM: `bunx vitest run` 1161/1161 (106 fájl; 15 új P2-teszt: típusok, ZIP-útvonal, OCR-keret, elakadás, visszajelzés-hitelesítés mindkét irányban, jelentés, AI-eszközök). `bun run ai:acceptance` 5 agent, 21/21. Típusellenőrzés és build OK.
- Izolált böngészőpróba (`scripts/qa/check_packages.py … report|report-mobile`, szimulált szerver, Supabase-írás 0): Tulajdonos asztali, Projektvezető mobil (390 px) – jelentés, szűrők, újrapróbálás gomb; vízszintes túlcsordulás nincs. Marketing a meglévő jogosultság szerint nem éri el a projektoldalt.

## 4. NEM TESZTELT / tulajdonosi lépés szükséges

- **A feldolgozó nincs telepítve.** Ehhez a tulajdonos Cloudflare-fiókja (Workers Paid), Docker és `wrangler deploy` kell; a sandboxban Docker/wrangler nem érhető el, Cloudflare-fiók nincs összekötve. Beállítandó: feldolgozónál `PROCESSOR_SECRET`, `ALLOWED_STORAGE_HOSTS`, `ALLOWED_CALLBACK_ORIGINS`; CRM-nél `PACKAGE_PROCESSOR_URL`, `PACKAGE_PROCESSOR_SECRET` (azonos érték, min. 32 karakter), opcionálisan `PACKAGE_PROCESSOR_CALLBACK_URL`.
- Élő feldolgozás valódi R2-vel, valódi OpenAI-képfelismeréssel és költséggel; 500 MB-os átvételi csomag végigfuttatása; valódi bejelentkezett RLS-próba; publikált címről érkező visszajelzés.
- Excel: nagyon nagy (150 MB feletti) táblázat csak tárolva; makró nem fut, csak jelölve. Régi `.doc`, CAD: csak tárolva.

## 5. Döntésre vár

1. Cloudflare-telepítés időpontja és a közös titkos kulcs beállítása.
2. Képfelismerési keret (alap 300 oldal/csomag) megfelelő-e.
3. Feladat-token oszlop elrejtése (kis adatbázis-módosítás).
4. Félbehagyott feltöltések takarítása (javaslat: 7 nap) – P1-ből nyitott.
