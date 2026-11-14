# P7 — Záró fejlesztés és átvételi előkészítés — jelentés, 2026-11-15

Alap: P6 `d85270d`. Nem történt: éles adatbázis-/RLS-módosítás, éles adatírás, ügyfélküldés, publikálás, fizetős telepítés, kulcskezelés, szerződéses vagy pénzügyi döntés, üzleti ár módosítása.
Élő adat csak olvasva (2026-11-14 23:05 UTC): 11 ajánlat (5 kapott költségvetéses), 3 `quote_sends` (P7 alatt változatlan → nem ment ki levél), 3 `quote_items`, 0 tervcsomag / 0 csomagfájl / 0 feldolgozási feladat (a P1 nagyfájlos feltöltést élesben még senki nem használta), a P5/P6 táblák és a `pricing_mode` mező nem léteznek, a feladat-token kliens által olvasható. Bejelentkezés: `external_unmanaged` — bejelentkezett böngészős próba az AI számára nem elérhető.

## 1. Felülvizsgálat és talált hibák
| # | Terület | Hiba | Állapot |
|---|---|---|---|
| H1 | P5 ajánlatcsomag | Összeállítás után módosított óradíj/tartalék/célfedezet/mód/költségvetés/ársablon, vagy közben mentett ajánlatmező (cím, verzió, érvényesség, lehatárolás, kizárások, kapcsolattartó, zárolás) mellett a régi csomag **menthető volt, a nettója átvehető, a jóváhagyás érvényesnek látszott és átadható volt**; a kiküldési ablakban az „Ajánlatcsomagból előkészítve … belső jóváhagyás” címke megmaradt. | **Javítva**: közös `packageStaleness` szabály (`package-model.ts`), elavult csomagnál mentés, nettó-átvétel, jóváhagyás-előkészítés és átadás tiltva, piros figyelmeztetés okokkal, a zöld „kész” jelzés eltűnik; a már átadott levéltervezet címkéje visszavonódik („már NEM a … jóváhagyott csomag”). A küldés logikája és útvonala nem változott. |
| H2 | P5/P6 javasolt SQL | `can_access_quote(quote_id)` — ilyen függvény nincs (valós: `can_access_quote(_lead_id, _project_id, _created_by)`); a P5 tervben a kliens tetszőleges ujjlenyomatot/összeget rögzíthetett volna. | **Javítva a tervben** (3. fejezet): meglévő mintájú EXISTS-ellenőrzés, írás csak szerveroldali újraszámolás után, DB-őrök. |
| H3 | P4 jelentés | Timothy eszköze `quote_check_plans` néven szerepel; a valós név `crm_quote_plan_review`. | Itt helyesbítve. |
Átnézve, hibát nem találtam: P3/P4/P5/P6 szerveroldali szerepkör-ellenőrzés (Marketing/PM/szerepkör nélkül elutasítva fájlletöltés előtt), csak olvasó Timothy-eszközök, ügyfélszöveg belsőkifejezés-szűrője, tételírás duplikáció-/ütközésvédelme, mentett fájl tartalmi visszaellenőrzése.

## 2. Ellenőrzés (valós eredmények)
| Próba | Eredmény | Jelleg |
|---|---|---|
| Új tesztek | 60: forgatókönyvek 14 (`src/lib/qa/p7-e2e-scenarios.test.ts`), jóváhagyás-integritás 35 (`src/lib/quote-package/approval-integrity.test.ts`), eszközmátrix 11 (`src/lib/ai-os/p7-tool-matrix.test.ts`) | izolált, TESZT |
| Teljes CRM | 127 fájl, **1430/1430** (1370 → 1430) | izolált |
| AI acceptance | 5 agent, **21/21** | izolált |
| Build | rendben | — |
| Migrációs terv (PGlite) | **56/56** (`scripts/qa/p7-migration-pglite.ts`) — felrakás, szerepkörös RLS, őrök, változtathatatlanság, visszaállítás, újrafelrakás | izolált, nem éles adatbázis |
| Felület (Playwright) | `check_quote_package.py sales stale`: jóváhagyás → óradíj 7000 → piros figyelmeztetés, átadás/jóváhagyás tiltva → visszaállítva „6 500” → újra érvényes → átadás → nyitott küldési ablak mellett változás → címke visszavonva, Küldés továbbra is megerősítéshez kötött. Regresszió: P5 Tulajdonos asztali, Sales mobil, PM (panel nem látszik); P3 Sales; P4 Tulajdonos; P6 Sales — mind rendben, oldalhiba 0, Gmail-hívás 0 | **szimulált szerver**, írás csak memóriában, nem valódi RLS |
| Jogosultsági mátrix | P3–P6 ajánlati eszköz csak Timothy + Tulajdonos/Sales; P2 csomagolvasó szerepkör nélkül senkinek, Michaelnek soha; egyik sem jóváhagyásköteles/író | izolált |

**Nem tesztelt:** bejelentkezett éles végigpróba (nincs AI-hozzáférés a bejelentkezéshez), valódi RLS a migrált táblákon (csak PGlite), valódi R2-mentés, éles küldés, P2 feldolgozó (nincs telepítve), Timothy élő modellhívása az új eszközökkel.

## 3. Egyetlen összevont migrációs terv (NEM FUTTATVA)
Fájlok: `docs/system-map/p7-migracio/01_p7_osszevont_migracio.sql`, `99_rollback_p7.sql`. Egy tranzakció.
| Rész | Mit ad | Hatás a meglévőre |
|---|---|---|
| A `quotes.pricing_mode` | árazási mód (5 érték) | Nullable, alapérték nélkül: meglévő sor nem változik. Zárolt ajánlaton a meglévő `quotes_lock_guard` tiltja (helyes). `quotes` realtime-csatornán van — új oszlop nem töri. `quote_create_draft` nem másolja (D11). |
| B `quote_calculations` | változtathatatlan P3/P4/P6 pillanatkép (bemenet, összegzés, motorverzió, forrás-hash) | Új tábla. Olvasás: Tulajdonos/Sales a látható ajánlaton; írás csak szerverfüggvény (szolgáltatásszerepkör). Őr: zárolt ajánlat, rossz ajánlattípus tiltva. |
| C `quote_package_approvals` | változtathatatlan belső jóváhagyás ujjlenyomattal, két dokumentummal, nyugtázásokkal | Új tábla. Őr: jóváhagyó valóban Owner/Sales és szerepköre egyezik, nem zárolt, kapott költségvetéses, mentett nettó = csomag nettó, dokumentumok ehhez az ajánlathoz és típushoz tartoznak; jóváhagyott dokumentum nem törölhető (RESTRICT). |
| D `pricing_rate_cards` + `_items` | díjtörzs verzióval; Sales/Owner tervezet, csak Owner jóváhagy/visszavon | Új táblák, érték nélkül (nincs kitalált díj). Jóváhagyás csak Tulajdonos munkamenettel (szolgáltatásszerepkörrel sem). |
| E token elrejtése | `package_processing_jobs.token` nem olvasható kliensről | Oszlopszintű jog; az egyetlen kliensolvasás (csomagjelentés) nem kéri. Következmény: kliensről `select("*")` ezen a táblán hibát adna — a kódban nincs ilyen. |
**SQL-review megjegyzések:** minden új táblán GRANT → RLS → policy sorrend; anon semmit nem kap; nincs `USING (true)`; SECURITY DEFINER csak a szerepkör-segédfüggvényen, rögzített `search_path`-szal; a dátumot (`created_at`) az őr állítja, kliens nem hamisíthat; JSON-méretkorlát a pillanatképeken.
**Visszaállítás:** `99_rollback_p7.sql` — csak P7-objektumokat töröl; az élesítés óta rögzített B/C/D adat és `pricing_mode` elvész, ezért előtte export (a fájl tartalmazza). PGlite-ban: visszaállítás után 0 P7-objektum, token ismét olvasható, ajánlatok megvannak, újrafelrakás sikeres.
**Élesítési eljárás (jóváhagyás után):** 1) mentés/pillanatkép, 2) darabszámok előtte (quotes, quote_documents, package_processing_jobs), 3) migráció, 4) ugyanazok utána + `has_column_privilege` a tokenre, 5) bejelentkezett negatív próba PM/Marketing szerepkörrel, 6) csak ezután a felületi mentés bekötése (külön kör).

## 4. Tulajdonosi státuszmátrix P0–P7
| Szakasz | Kész kód | Tesztelt (izolált) | Csak mock / szimulált | Élesítve | Hiányzik | Blokkolt (mi miatt) |
|---|---|---|---|---|---|---|
| P0 architektúra | — (dokumentum) | — | — | dokumentumok kész | költségplafon, asszisztens-mátrix döntés | D14 |
| P1 dokumentumtár, nagyfájlos feltöltés | igen | igen + valódi R2 530 MB, folytatás | felület | **adatbázis élesítve** (2026-11-14); élesben 0 csomag | 1 GB-os fájl próba, takarítás | D1, D15 |
| P2 tervcsomag-feldolgozás | igen | igen (12 + 15) | — | adatbázis élesítve; **feldolgozó nincs telepítve** | élő feldolgozás, 500 MB átvétel | D13 |
| P3 árazási motor | igen | igen + 16 valós Excel olvasva, KV 275/275 | felület | nem (nincs tartós mentés) | számítási verziók, ártörzs | D2, D4–D6 |
| P4 tervellenőrzés, szekrény-BOM | igen | igen + Herceghalom olvasva | felület | nem | 5 szakértői BOM, OCR/CAD | D7, D13, D4 |
| P5 ajánlatcsomag | igen (+P7 elavulás-védelem) | igen | felület, mentés memóriában | nem (jóváhagyás nem tartós) | tartós jóváhagyás, küldés-kapu | D2, D3 |
| P6 saját VIBA-kalkuláció | igen | igen | felület, tételírás memóriában | nem (munkapéldány csak böngészőben) | díjtörzs, kalkulációmentés | D2, D4, D5 |
| P7 átvétel | igen (javítás, tesztek, migrációs terv) | igen (1430, 21, 56) | felület | nem | 3 hitelesített valós ügylet | D1, D2 |
Egyik szakasz kódja sincs az AI által publikálva; a publikált cím állapotát nem ellenőriztem.

## 5. Reprodukálható forgatókönyvek
**Automatizált (izolált):** `bunx vitest run src/lib/qa/p7-e2e-scenarios.test.ts src/lib/quote-package/approval-integrity.test.ts src/lib/ai-os/p7-tool-matrix.test.ts`; felület: `bun run scripts/qa/quote-package-payload.ts <Q> <D> > /tmp/browser/pkg/payload.json`, majd `python3 scripts/qa/check_quote_package.py sales stale`; migráció: lásd a szkript fejlécét.
- **A — alvállalkozói kapott Excel:** összeállítás → mentés előtt nem adható át → fájlok + nettó mentése → ugyanaz az ujjlenyomat → jóváhagyás-előkészítés → átadható → óradíj-változás után a régi jóváhagyás érvénytelen, a régi Excel nem a csomag része. Ugyanaz teljes kivitelezői módban: célfedezet nélkül hiányos, célfedezettel kész, anyagdíjjal.
- **B — saját teljes kivitelezői (családi ház 140 m², TESZT-díjak):** anyag/munkadíj külön, 0 mennyiségű sor kimarad, hiányzó díjú sor csak tudomásulvétellel, ismételt írás 0 új tétel, 150 m² ütközés (nem felülírás), csak munkadíjas módban anyag 0.
- **C — VBF „Sopron út 66.” (kitalált hibapontok):** 4 hibapont sorszám-bizonyítékkal → előzetes (minden becsült, bejárás utáni véglegesítés) → bejárás utáni bejárás nélkül blokkolt → rögzített bejárással sürgős/ütemezhető/felmérés/mérés külön, áramszünet a lehatárolásban → tételesnél becsült mennyiség és tétel nélküli hibapont blokkol.

**Bejelentkezett kézi végigpróba (D1, TESZT-ügy, küldés nélkül):** Ramon (Sales) 1) új kapott költségvetéses TESZT-ajánlat, TESZT-Excel feltöltése, 3. lépés → csomag összeállítása; 2) Fájlok mentése, Nettó mentése, jóváhagyás-előkészítés; 3) óradíj átírása → piros „elavult” jelzés, átadás tiltva; 4) visszaírás → átadás → küldési ablak: címzett/mellékletek, **Küldés NEM nyomandó**; 5) saját VIBA TESZT-ajánlat: Kalkuláció panel, családi ház, tételek hozzáadása, ismételt hozzáadás 0; 6) VBF TESZT-szöveg → hibapontok; 7) projektvezetővel belépve: a panelek nem látszanak. Elvárt eredmény mindenhol a fenti automatizált lépések szerinti.

## 6. Éles korlátok
Tartós jóváhagyás, számítás, díjtörzs nincs (D2); a kiküldés nem követeli meg a jóváhagyást (D3); VIBA-díj, m²-csomag, norma nincs (D4–D5); nagy/szkennelt tervcsomag feldolgozása nincs (D13); szakértői BOM-átvétel nincs (D7); a 3 hitelesített valós ügylet (P7 átvételi kapu) bejelentkezett próbát és a fenti döntéseket igényli.

## 7. Lezárás
A P0–P7 terv megengedett, önállóan végezhető része elkészült. A hátralévő tételek mind tulajdonosi döntéstől, bejelentkezett próbától vagy fizetős telepítéstől függnek (lásd `tulajdonosi-dontesek-2026-11-15-1015.md`, D1–D15). Új szakaszt (P8) nem nyitottam.
