# VIBA CRM – AI OS architektúra, 3. változat: nagy kiviteli tervcsomagok kezelése

Dátum: 2026-11-14 · Kiegészíti a 2. változatot (Timothy ajánlatkészítő), annak minden döntése érvényes marad.
Új kötelező követelmény: **400–500 MB-os vagy nagyobb tervcsomagok** kezelése, kezdetben legalább **1 GB fájlonként és 5 GB projektenként**, később beállítható bővítéssel.
Állapot: **csak elemzés és tervezés** – kód, adatbázis, tárhely, RLS nem változott.

## 1. Miért nem elég a korlátot megemelni (igazolt mai állapot)

| Pont | Mai működés (forrás) | Következmény nagy fájlnál |
|---|---|---|
| Feltöltés | `/api/r2-upload`: a teljes fájl a szerveren megy át (`request.formData()`, majd `file.arrayBuffer()`, egyetlen PUT az R2-re) | A szerver kérésméret- és memóriakorlátja (nagyságrendileg 100 MB kérés, 128 MB memória) miatt 500 MB–1 GB **fizikailag nem fér át**; nincs folytatás megszakítás után |
| Méretkorlát | `r2-policy.ts`: 50 MB (kimenő levél 20 MB) | Csak tünet, a fenti miatt emelése önmagában hibás |
| AI-feldolgozás | `ingest-model.ts`: 5 MB, legfeljebb 60 egység, 240 000 karakter; a kiolvasás memóriában történik | 500 MB-os PDF nem tölthető memóriába; az 5 MB fölötti fájl ma `too_large_ocr_pending` állapotba kerül |
| Feldolgozási sor | `knowledge_claim_batch`: bérleti zárolás (10 perc), legfeljebb 3 kísérlet, `content_sha256`, kötegenként legfeljebb 10 tétel | **Jól újrahasznosítható alap**, de fájl szintű; oldalszintű darabolás nincs |
| ZIP | A kiolvasó ellenőrzi a ZIP-bombát és a duplikált bejegyzést, de memóriában | Nagy ZIP kibontása szerveren nem lehetséges |
| Mappa | Nincs mappastruktúra és csomagfogalom | A tervcsomag szerkezete elveszne |

**Architekturális következtetés:** a fájl bájtjai soha ne menjenek át a CRM szerverén. A böngésző **közvetlenül az R2-be** tölt fel darabokban, rövid életű, szerver által aláírt darab-URL-ekkel. A CRM szervere csak engedélyez, nyilvántart és ellenőriz. A nehéz feldolgozás egy **külön, elzárt feldolgozókörnyezetben** fut (a 2. változat „D” környezete), amely az R2-ből részletekben olvas.

## 2. Javasolt felépítés

```text
Böngésző ── (1) csomag indítása ─────────────► CRM szerver: jogosultság, kvóta, kulcsképzés, nyilvántartás
   │                                             │
   ├─ (2) darabonként: aláírt URL kérése ◄───────┘ (csak a saját feltöltéséhez, rövid élettartammal)
   ├─ (3) 16–64 MB-os darabok közvetlenül ─────► R2 (többrészes feltöltés)
   └─ (4) lezárás ─────────────────────────────► CRM szerver: darabellenőrzés, SHA-256, duplikáció, sorba állítás
                                                   │
                      Feldolgozási sor (meglévő claim-minta, darabszintre bővítve)
                                                   │
                      Elzárt feldolgozó: R2 részleges olvasás → ZIP kibontás → típusfelismerés →
                      PDF oldalakra bontás → szövegréteg / OCR → Excel-szerkezet → kivonatok és jelentés
                                                   │
                      CRM: kereshető darabok (RLS), fájlállapot, csomagjelentés → Timothy eszközei
```

### 2.1 Feltöltés – darabolt, folytatható, integritásellenőrzött
- **Csomag és munkamenet:** a felhasználó csomagot indít egy projekthez vagy ajánlathoz. A szerver a meglévő `UPLOAD_ROLES` és a szülőrekord RLS-láthatósága alapján engedélyez, majd fájlonként feltöltési munkamenetet nyit. A tárolási kulcsot továbbra is a szerver képzi, a kliens nem választhat kulcsot.
- **Darabolás:** az R2 többrészes feltöltése (S3-kompatibilis). Darabonként 16–64 MB, 3–4 párhuzamos darab, darabonként újrapróbálás.
- **Folytatás:** a böngésző a fájlt név, méret, módosítási idő és ujjlenyomat alapján ismeri fel. Újranyitáskor a szerver visszaadja a már feltöltött darabokat, és csak a hiányzók mennek fel újra. Elhagyott munkamenet 7 nap után automatikusan megszakad, a félkész darabok törlődnek.
- **Integritás:** a böngésző darabonként és fájlonként SHA-256 ellenőrzőösszeget számol. Lezáráskor a szerver összeveti a méretet és a darablistát, majd az elzárt feldolgozó a tárolt objektumon újraszámolja a fájl SHA-256-ját. Eltérés esetén a fájl „sérült” állapotot kap, és nem kerül feldolgozásra.
- **Duplikáció:** ha ugyanaz a SHA-256 ugyanabban a projektben már megvan, a fájlt nem tároljuk újra, csak új hivatkozást kap. Más projektben külön hivatkozás jön létre, a jogosultság nem öröklődik.
- **Mappa és ZIP:** mappafeltöltésnél a relatív útvonal megmarad (például `E-terv/Elosztók/EL-03_rev2.pdf`). A ZIP eredetiben is megmarad, és a feldolgozó bontja ki külön fájlokra, az útvonalak megtartásával. Közben ellenőrzi a ZIP-bombát, a titkosítást, a `..` útvonalakat, és korlátozza a bejegyzések számát.
- **Kvóta:** alapértelmezésben 1 GB fájlonként és 5 GB projektenként, tulajdonosi beállításként módosítható. A szerver a lefoglalt és a lezárt méretet is beszámítja, így párhuzamos feltöltéssel sem lehet túllépni.
- **Eredeti változatlan:** az eredeti objektum írásvédett kulcson marad. Minden származék (oldalkép, kiolvasott szöveg, kibontott ZIP-tag) külön kulcsra kerül.

### 2.2 Aszinkron, részletekben történő feldolgozás
- **Munkaegységek:** egy fájl több munkaegységre bomlik: ZIP-tagra, PDF-oldaltartományra (például 10 oldalanként), Excel-munkalapra. A sor bérletes zárolása, kísérletszáma és tartalom-hash szerinti átugrása a meglévő `knowledge_claim_batch` mintát követi, darabszintre bővítve.
- **Korlátok:** futásonként rögzített darabszám, egyetlen futó példány (adatbázis-bérlet), egységenként idempotens állapotjelölés, költségplafon csomagonként. Fizetési (402), jogosultsági (403) vagy ismételt korlátozási (429) hiba esetén automatikus szüneteltetés, a tulajdonos számára látható okkal.
- **Részletes olvasás:** az elzárt feldolgozó HTTP Range-kérésekkel olvas az R2-ből, a teljes fájl soha nincs egyben a memóriában. A PDF oldalanként bomlik: ahol van szövegréteg, ott OCR nélkül olvas, és csak a szövegréteg nélküli oldalakat küldi képfelismerésre.
- **Felismerés:** dokumentumtípus (kiviteli terv, kapcsolási rajz, műszaki leírás, költségvetés, jegyzőkönyv), tervszám, rajzszám, revízió, dátum, szakág, szekrényazonosító (például `EL-03`, `FE-1`). A felismerés a fájlnévből, a mappából, a pecsétmezőből és az oldaltartalomból együtt történik. Minden találat forrásoldallal és megbízhatósági szinttel kerül rögzítésre. Bizonytalan esetben javaslat készül, nem végleges besorolás.
- **Verziók:** azonos tervszám és eltérő revízió esetén verziólánc jön létre. Az újabb revízió nem törli a régit, csak „aktuális” jelölést kap, emberi megerősítéssel, ha a sorrend nem egyértelmű.
- **Kapcsolatok:** a csomag indításakor kiválasztott projekthez vagy ajánlathoz minden fájl automatikusan kapcsolódik. Más projektre vagy ajánlatra utaló találat csak javaslat, átkötés kizárólag jóváhagyással (a 0. szakasz adatvédelmi szabálya szerint).

### 2.3 Fájlonkénti állapot és olvashatatlan fájlok jelentése
- **Állapotok:** `feltöltés alatt` → `feltöltve` → `ellenőrzés` → `sorban` → `feldolgozás` → `kész` / `részben olvasható` / `nem olvasható` / `nem támogatott` / `sérült` / `szüneteltetve`.
- **Részleges olvashatóság:** oldalszintű lefedettség (például „112/140 oldal olvasva, 28 oldal képfelismerés alatt, 3 oldal olvashatatlan”).
- **Ellenőrizhető csomagjelentés:** fájlonként útvonal, méret, SHA-256, típus, állapot, lefedettség, hibakód és emberi nyelvű ok (például jelszavas, sérült, nem támogatott CAD formátum, túl kis felbontás). A jelentés letölthető, és Timothy is erre hivatkozik: „ezeket a fájlokat nem tudtam értelmezni”.

### 2.4 Keresés és Timothy
- **Kereshetőség:** a kiolvasott szöveg oldalanként kereshető darabokba kerül, a meglévő `knowledge_chunks` mintájára vagy annak bővítésével. Minden darab hordozza a csomag, a fájl, az oldal és a revízió azonosítóját.
- **Támogatott típusok:** PDF (szövegréteg és OCR), képek, XLSX/XLSM (makró futtatása nélkül), DOCX, CSV, TXT. A régi XLS, a DWG/DXF és az IFC a mostani javaslatban „nem támogatott”: metaadatként tárolódnak, de tartalmuk nem kereshető, és ezt a jelentés is kimondja. A CAD-olvasás külön döntés.
- **Jogosultság:** a feltöltésnél, a feldolgozásnál, a keresésnél és a letöltésnél ugyanaz a szabály érvényes. Csak az olvashat, aki a szülő projektet vagy ajánlatot az RLS szerint látja, és a keresés is a felhasználó jogaival fut. Letöltés csak szerver által aláírt, rövid életű linken, a meglévő `r2PresignDownload` útvonalon.
- **Timothy:** a 2. változat eszközei (`quote_list_package_files`, `quote_read_extracted_evidence`, `quote_check_scope_and_drawings`) a csomagjelentésből és az oldalszintű kivonatokból dolgoznak. Minden állítás fájl-, oldal- és revízió-hivatkozást kap. Ha egy szükséges fájl olvashatatlan, Timothy ezt hiányként jelzi, és nem tölti ki a rést becsléssel.

## 3. Adatmodell-javaslat (külön migrációval, jóváhagyás után)
A 2. változat `estimate_package_files`, `file_assets`, `document_links`, `document_revisions` tábláit pontosítja:
- `document_packages`: szülő (projekt/ajánlat), indító, állapot, kvóta, összméret, jelentés.
- `upload_sessions` és `upload_parts`: fájl, R2 többrészes azonosító, darabméret, darabok listája ellenőrzőösszeggel, lejárat (a darablistát csak a szerver ismeri).
- `file_assets`: SHA-256, méret, eredeti kulcs (csak szerveroldalon), relatív útvonal, mime-típus, felismert típus.
- `package_files`: csomag ↔ fájl kapcsolat, útvonal, ZIP-szülő.
- `file_processing_units`: munkaegység (oldaltartomány, munkalap, ZIP-tag), állapot, bérlet, kísérletszám, költség.
- `document_metadata_findings`: tervszám, revízió, szekrény, forrásoldal, megbízhatóság, jóváhagyási állapot.
- A kereshető darabok a `knowledge_chunks` bővítésével, csomag-, fájl- és oldalhivatkozással.
- A meglévő `project_documents`, `quote_documents` és `knowledge_documents` megmarad; az új fájlok ezekhez hivatkozással kapcsolódnak, nem párhuzamos tárként. **Előfeltétel a P1 dokumentum-RLS szűkítés.**

## 4. Változatok összevetése a nagy csomagokra

| Megoldás | 1 GB fájl | Folytatás | Szerver-terhelés | Jogosultság | Értékelés |
|---|---|---|---|---|---|
| Korlátemelés a mai útvonalon | Nem | Nem | Teljes fájl a szerveren | Megmarad | Kizárva |
| Supabase Storage darabolt (TUS) feltöltés | Igen | Igen | Kicsi | Új, második tár a mostani R2 mellett | Nem ajánlott (párhuzamos tár) |
| **R2 többrészes feltöltés aláírt darab-URL-ekkel** | **Igen** | **Igen** | **Kicsi** | **Meglévő szabályok, szerver képzi a kulcsot** | **Ajánlott** |
| OpenAI-fájltár a teljes csomagnak | Méretkorlát függő | Nem | Kicsi | Az ügyfélfájlok kikerülnek, nincs RLS | Csak oldalankénti kivonathoz |

Feldolgozásra: a CRM szervere nem alkalmas, mert memória- és CPU-korláttal fut. Az **elzárt feldolgozókörnyezet** (saját konténer vagy hosztolt, döntendő) az R2-ből olvas, hálózati hozzáférése csak a tárhelyre és az AI-szolgáltatásra szól, és CRM-kulcsot nem kap. Az eredményt egy szűk, aláírt visszahívással adja vissza, amelyet a CRM ellenőriz.

## 5. Költség (becslés)
- **Tárhely:** 5 GB/projekt × 20 aktív projekt = 100 GB. R2-n a tárolás havi tétel; a letöltési forgalom R2-nél nem kerül díjba (a pontos egységárat bevezetés előtt ellenőrizni kell).
- **Feldolgozás:** egy 500 MB-os csomag jellemzően 1 500–3 000 oldal. Ha 30% szövegréteg nélküli és OCR-t igényel, kb. 450–900 oldal megy képfelismerésre. A mért OCR-próba alapján ez oldalanként ≈ 3 100 bemeneti és 1 300 kimeneti token, vagyis **csomagonként ≈ 1,4–2,8M bemeneti és 0,6–1,2M kimeneti token**, plusz a konténeridő. Az ismételt feltöltés a hash-cache miatt nem fizet újra.
- **Védelem:** csomagonkénti költségplafon, indítás előtti becslés kijelzése (oldalszám × OCR-arány), tulajdonosi jóváhagyás a plafon fölött, szüneteltethető sor.

## 6. Kockázatok

| Kockázat | Mérséklés |
|---|---|
| Kártékony ZIP vagy fájl (bomba, `..` útvonal, makró, jelszó) | Ellenőrzés kibontás előtt, makró soha nem fut, elzárt környezet, korlátozott bejegyzésszám |
| Félbehagyott feltöltések költsége | 7 napos lejárat, automatikus megszakítás, kvótába számítás |
| Kvóta megkerülése párhuzamos feltöltéssel | Atomi foglalás a szerveren |
| Más ügyfél fájljának elérése a duplikáció-ellenőrzésen át | A hash-egyezést csak a saját projekten belül jelezzük vissza; más projektnél csendes új tárolás vagy szerveroldali hivatkozás, jogosultság-öröklés nélkül |
| Téves verzió- vagy projektkapcsolat | Csak javaslat, megerősítéssel |
| Részleges feldolgozás „kész”-ként feltüntetve | Oldalszintű lefedettség, Timothy kötelezően hivatkozik a hiányra |
| Futáselszabadulás | Futásonkénti korlát, egy példány, megszakító kapcsoló, szünet 402/403/429 esetén |
| Böngésző-memória 1 GB fájlnál | Darabonkénti ujjlenyomat, nem kell a teljes fájl a memóriába |

## 7. Átvételi terv
Tesztcsomag: **legalább 500 MB**, almappákkal; benne több szövegréteges és szkennelt PDF, legalább két Excel (köztük egy képletes, alvállalkozói), rajzok (PDF, kép, egy DWG a „nem támogatott” ágra), egy ZIP, egy szándékosan sérült és egy jelszavas fájl, valamint két revízió ugyanabból a tervből.

| # | Ellenőrzés | Elvárás |
|---|---|---|
| 1 | Teljes feltöltés | Minden fájl lezárva, SHA-256 egyezik, a mappaszerkezet megmaradt |
| 2 | Megszakítás (hálózat bontása 40%-nál, böngésző újranyitása) | Csak a hiányzó darabok mennek fel, nincs duplikált objektum |
| 3 | Ugyanazon fájl ismételt feltöltése | Nincs új tárolás, új hivatkozás jön létre |
| 4 | Kvóta-túllépési kísérlet | Elutasítás a lefoglaláskor |
| 5 | Feldolgozás | Minden fájl végállapotba jut, az oldalszintű lefedettség látható |
| 6 | Felismerés | Tervszám, revízió és szekrényazonosító forrásoldallal, verziólánc |
| 7 | Olvashatatlan fájlok | Külön jelentés hibakóddal, letölthető, egyezik a valós hibákkal |
| 8 | Jogosultság | Owner/Sales/PM/Marketing pozitív és negatív tesztek a feltöltésre, keresésre, letöltésre és Timothy-olvasásra |
| 9 | Eredeti megőrzése | Az eredeti objektumok hash-e a teljes folyamat után változatlan |
| 10 | Timothy-elemzés | Műszaki elemzés fájl-, oldal- és revízió-hivatkozással; a hiányzó vagy olvashatatlan fájlokat megnevezi |

## 8. Hely a P0–P7 ütemezésben
- **P1 (bővített):** dokumentum-RLS, csomagfogalom, darabolt és folytatható R2-feltöltés, kvóta, duplikáció, mappa- és ZIP-megőrzés (kibontás még nélkül), fájlállapot.
- **P2:** az elzárt feldolgozókörnyezet első változata: ZIP-kibontás, Excel-szerkezet, szövegréteges PDF oldalakra bontva, csomagjelentés.
- **P4:** nagyléptékű OCR, rajz-, tervszám-, revízió- és szekrényfelismerés, kereshető darabok, Timothy-bizonyítékok.
- **P7:** az 500 MB-os átvételi teszt hitelesített, bejelentkezett végigpróbával.

Minden ütem után STOP és külön tulajdonosi engedély. A sémát, a tárhelybeállítást és a feldolgozókörnyezet létrehozását külön kapu védi.

## 9. Döntésre vár
1. Elfogadod-e az R2 közvetlen, darabolt feltöltését és az elzárt feldolgozókörnyezetet?
2. Saját vagy hosztolt feldolgozókörnyezet legyen? A CAD-fájlok (DWG/DXF/IFC) olvasása kell-e már az első körben?
3. Rendben van-e a 1 GB/fájl és 5 GB/projekt alapérték, és mekkora legyen a csomagonkénti AI-költségplafon?
4. Meddig maradjanak meg a félbehagyott feltöltések (javaslat: 7 nap), és meddig az elavult revíziók (javaslat: korlátlanul)?

## NEM TESZTELT / nem igazolt
A szerver pontos kérés- és memóriakorlátja a mostani előfizetésben, az R2 aktuális egységára, a feldolgozókörnyezet ára, valamint bármely itt leírt funkció működése – egyik sincs megvalósítva. A token- és oldalszám-becslések a mért OCR-próbából és feltételezett csomagösszetételből származnak.
