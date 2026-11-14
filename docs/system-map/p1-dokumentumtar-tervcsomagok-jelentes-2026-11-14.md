# P1 – Dokumentumtár, projektcsomagok és nagyfájlos feltöltés – jelentés (2026-11-14)

Állapot: **kód kész és tesztelt, adatbázis-rész jóváhagyásra vár.** Éles migráció, RLS-módosítás, publikálás, ügyfélküldés nem történt. A P1 után a munka megáll.

## 1. Mi készült el és mi működik ténylegesen

| Terület | Állapot | Bizonyíték |
|---|---|---|
| Darabolt, közvetlen R2-feltöltés (S3 multipart, 16 MiB rész, max. 10 000 rész) | Működik a valódi R2-n | 530,5 MB-os TESZT-csomag, 9 fájl, 6 mappa feltöltve, majd minden TESZT-objektum törölve (0 maradt) |
| Megszakítás + folytatás új munkamenetből | Működik (R2-n és böngészőben) | R2: 300 MB-os fájl 10/18 része után új folyamat folytatta. Böngésző: 43%-nál szünet, új böngészőből csak a hiányzó részek mentek fel (összes átvitel = egyedi bájtok, 522,5 MB, 0 felesleges) |
| Sértetlenség | Működik | Böngészőben számolt SHA-256 = 9/9 fájl; részenkénti MD5 = tárolt ETag minden résznél; a lezárás csak egyező részekkel engedélyezett |
| Mappaszerkezet | Működik | Gyökérmappa + 6 almappa útvonala megmaradt; rendszerfájlok (.DS_Store stb.) kimaradnak |
| Duplikáció és revízió | Működik (logika + PGlite) | Azonos tartalom újra: „már korábban feltöltve”, nem tárolódik újra; azonos útvonal, más tartalom: 2. változat |
| Korlátok | Kész | 1 GB/fájl, 5 GB/ügy, 5000 fájl/csomag; tulajdonos a settings táblában módosíthatja; felső határ 50 GB / 500 GB |
| Felület | Kész | Projekt „Dokumentumok” fül, ajánlat dokumentumai, Dokumentumtár „Csomagok” nézet: Új dokumentáció feltöltése, Megnyitás, Feltöltés folytatása, mappánkénti fájllista, keresés, Hibák szűrő |
| Megnyitás | Kész | Csak ellenőrzött (`verified`) csomagfájl, a meglévő `r2PresignDownload` szerveroldali láthatósági ellenőrzésével |
| Tartalék feltöltési út | Kész | Ahol a tárhely CORS-szabálya a böngészőt tiltja (előnézet, localhost), a részek a CRM-szerveren át mennek (`/api/package-upload-part`) |
| ZIP | Részben | A ZIP eredeti, változatlan fájlként tárolódik; kibontás és tartalomkeresés a P2 elzárt feldolgozóban |
| Jelenlegi éles állapot | Jóváhagyásra vár | Migráció nélkül a panel csak ezt mutatja: „feltöltése tulajdonosi jóváhagyásra vár. Addig a lenti, megszokott feltöltés használható.” A régi 50 MB-os feltöltés változatlanul működik |

## 2. Változott fájlok

Új: `src/lib/packages/` (package-policy, r2-multipart.server, packages.server, packages.functions, upload-engine + 3 tesztfájl, AGENTS.md), `src/components/packages/` (local-files, package-transport, document-packages-panel), `src/routes/api/package-upload-part.ts`, `scripts/qa/p1_package_r2_test.ts`, `scripts/qa/check_packages.py`, `docs/system-map/p1-migracio/01_document_packages.sql`, `99_rollback_document_packages.sql`.
Módosított: `src/lib/r2.server.ts` (r2Env export), `src/lib/r2.functions.ts` (csomagfájl-letöltés ellenőrzése), `src/routes/_authenticated/projects.$id.tsx`, `quotes.$id.tsx`, `documents.tsx` (panel beillesztése), `package.json`/`bun.lock` (hash-wasm).
Nem változott: régi `/api/r2-upload`, `r2-policy.ts` 50 MB-os útvonal, meglévő dokumentumtáblák és RLS, Gmail, ajánlat, AI OS.

## 3. Adatbázis-objektumok

> **Helyesbítés (2026-11-14, P2):** a tulajdonos 18:44 UTC-kor jóváhagyta („Adatbázis: Igen, mindkettő”), ezután a P1 migráció élesben lefutott (`supabase/migrations/20261114184622_…`). Az alábbi „nem futtatva” állapot a jelentés írásakor volt igaz.

`01_document_packages.sql`: táblák `document_packages`, `package_files`, `package_file_parts`, `package_upload_events`; olvasási RLS a meglévő projekt-/ajánlat-láthatóságra (`document_package_parent_visible`), írás csak szerveroldali szolgáltatásszerepkörrel; `package_files_guard` (ellenőrzött eredeti nem módosítható/törölhető); `document_package_register_file` (tanácsadói zárral: kvóta, duplikáció, revízió); `document_package_limits` alapérték a settings táblában. Visszaállítás: `99_rollback_document_packages.sql`. Mindkettő PGlite-ban próbálva; éles adatbázist nem érintett. Meglévő hozzáférés nem bővül és nem szűkül.

## 4. Tesztek

- `bunx vitest run`: 1146/1146 (104 fájl; 28 új P1-teszt). `bun run ai:acceptance`: 5 agent, 21/21. Típusellenőrzés és build: OK.
- Valódi R2: lásd 1. pont (tárhelyréteg, adatbázis nélkül).
- Izolált böngészőpróba (`scripts/qa/check_packages.py`, kitalált TESZT-adatok, szimulált szerver és tárhely, Supabase-írás 0): Owner, Sales, PM, Marketing asztali; PM mobil (390 px); jóváhagyás előtti állapot. Owner/Sales/PM látja és feltöltheti a projekt és ajánlat csomagjait; Marketing a meglévő útvonal-jogosultság szerint nem éri el a projekt/ajánlat/dokumentumtár oldalt; Sales a Dokumentumtár oldalt (meglévő szabály). Vízszintes túlcsordulás nincs. Mobilon a mappaválasztó rejtett (mobilböngészők nem támogatják), Fájlok/ZIP elérhető.
- A konzolban látott két „<div> a <p>-ben” figyelmeztetés a meglévő `owner-home.tsx`-ből jön, nem a P1-ből; nem javítottam (érintetlen kód).

## 5. NEM TESZTELT / blokkolt

- Valódi bejelentkezett végigpróba és valódi adatbázis-sorok: a migráció nincs futtatva, és ehhez a projekthez a teszt-bejelentkezés nem érhető el.
- Valódi RLS-viselkedés az új táblákon (csak PGlite).
- Közvetlen böngésző→R2 feltöltés a publikált címről (a CORS ott engedélyez, de nem próbáltam; előnézetben a tartalék út megy).
- 1 GB-os egyedi fájl (a próba 300 MB-os legnagyobb fájllal készült).
- Feldolgozás, típus/tervszám/szekrényazonosító felismerés, tartalomkeresés, Timothy-elemzés, olvashatatlanfájl-jelentés: P2.

## 6. Tulajdonosi jóváhagyást igényel

1. `01_document_packages.sql` éles futtatása (4 új tábla, RLS, trigger, függvények, settings alapérték).
2. Félbehagyott feltöltések takarítása (javaslat: 7 nap után a tárhelyen megszakítás) – időzített feladat, külön engedély.
3. R2 CORS bővítése az előnézeti címre és `ETag` kiadása (opcionális; nélküle a tartalék út működik).

## 7. P2 technikai kiindulópont

`package_files` sorok `processing_status` mezője (`waiting` → feldolgozás), stabil `package_id`/`file_id`/projekt-/ajánlatazonosítók, változatlan eredeti R2-kulcs; az elzárt feldolgozó (ZIP-kibontás, PDF/Excel/kép olvasás, darabolás a meglévő `knowledge_*` sorba) erre épül, Timothy a meglévő dokumentumolvasó eszközökön át, a felhasználó jogaival olvas.
