# 8. nagy csomag – Szerepkörös dokumentumtár és dokumentumalapú napi munka (2026-11-14)

Állapot: **KÓD KÉSZ, izolált TESZT-próbával ellenőrizve. Bejelentkezett Sales / Marketing / PM / Owner végigpróba éles adattal, valódi RLS-sel és valódi R2-letöltéssel: NEM TESZTELT** (a projekt `external_unmanaged`, böngészős munkamenet nem injektálható).
Nem változott: DB-séma, migráció, RLS, szerepkör, route-jogosultság (`permissions.ts` / `route_permissions`), trigger, edge/szerverfüggvény, storage, titok, külső integráció. Nem volt éles adatírás, feltöltés, tömeges mozgatás, e-mail-küldés, publikálás, fizetős AI-hívás. Az 1–7. csomagot nem ismétli.

## 1. Audit (csak olvasás, 2026-11-14 05:05 UTC)

### Adatforrások és darabszámok
| Forrás | Sorok | Megjegyzés |
|---|---|---|
| `project_documents` | 25 | **mind a 25 projekt nélküli** (`project_id` NULL; 15 „Egyéb”, 10 „Ajánlat”) – a Dokumentumtár globális feltöltéséből; egyik projekt Dokumentumok fülén sem látszik |
| `company_documents` | 11 | 9 műszaki, 2 marketing; forrás: kézi |
| `quote_documents` | 5 | 3 árazatlan, 2 árazott költségvetés |
| `email_attachments` | 1219 | levélszál-hozzáféréshez kötött (`can_access_email_thread`) |
| `knowledge_documents` | 821 | AI-feldolgozási állapot (jelvény) |
| Azonos fájlkulcs több rekordban | 0 / 41 | élesben nincs duplikált tárolt fájl |
Fájlkulcs nélküli rekord: 0. Tárhely: privát R2, letöltés csak `r2PresignDownload` (300 s, szerveroldali láthatósági ellenőrzés a 3 dokumentumtábla + melléklet RLS-én át).

### RLS (változatlan)
- `project_documents` SELECT: Owner + **minden** PM/Sales/Marketing szerepkör, projekt szerinti szűkítés nélkül. INSERT/UPDATE/DELETE: Owner vagy saját feltöltés (PM/Sales).
- `company_documents` SELECT: Owner + PM/Sales/Marketing minden cégre. Írás: Owner vagy saját feltöltés (Marketing is).
- `quote_documents` SELECT/INSERT: `can_access_quote`; DELETE: Owner vagy feltöltő, zárolt ajánlat „Kiküldött ajánlat” fájlja soha.
- `email_attachments` SELECT: e-mail admin vagy hozzáférhető levélszál.

### Útvonalak és képernyők (előtte)
| Hely | Állapot előtte |
|---|---|
| `/documents` | csak Owner/PM (route). Csak projektdokumentumok; ajánlati/ügyfél fájl nem kereshető |
| Projekt → Dokumentumok | csak projektfájlok; a Sales-időszak ajánlati/ügyfél fájljai nem látszottak → újrafeltöltés |
| Pipeline ügy adatlap | nem volt dokumentumlista (csak a 7. csomag szerződésfájljai) |
| Lead adatlap / dosszié → Dokumentumok | csak fájlnév, **nem nyitható meg** |
| Ügyfél → Dokumentumok | projektfájlok **nem nyithatók meg**, nyers típuskód; ajánlati fájl nincs |
| Marketing ügyfélmunka → Dokumentumok | **hiba:** a gyorsítótár-kulcs ütközött egy név-lekéréssel → a lista fájlkulcs nélküli sorokat kaphatott („Hiányzó fájl-kulcs”, „Egyéb” kategória). Ugyanez az ügyféllap `id`-lekérésénél |
| Ajánlat → Dokumentumok | működött; zárolt ajánlatnál a nem törölhető „Kiküldött ajánlat” fájlnál is volt törlés gomb |
| Minden lista | megnyitás a szerver válasza után nyitott új lapot → mobilon a felugró-ablak tiltás csendben elnyelhette; hibaüzenet csak általános |
| Sales/Marketing a `/documents`-en | általános „Nincs jogosultságod”, útmutatás nélkül |

## 2. Elkészült (frontend, visszafordítható)
- **Egy közös szabály:** `src/lib/documents/document-access.ts` – egységes alak a 3 forrásra, kategóriacímkék, deduplikáció (azonos rekord egyszer; azonos tárolt fájl több rekordban mind látszik, „Ugyanez a fájl még N helyen” jelöléssel, összevonás nélkül), ékezetfüggetlen keresés, kategória/forrás szűrés, kapcsolódó rekord linkje szerepkör szerint, NINCS ÖSSZEKÖTVE, letöltési hibák besorolása (nincs hozzáférés / hiányzó fájl / hibás hivatkozás / tárhely / lejárt bejelentkezés / hálózat / letiltott új lap), szerepkör-tükrök (feltöltés/törlés gomb csak ahol az adatbázis is engedi).
- **Olvasó:** `related-docs-loader.ts` – csak SELECT a hívó jogosultságával; forrásonként ok / NINCS ADAT / NINCS ÖSSZEKÖTVE / „nem teljes” (felső határ 200, Dokumentumtárban 500).
- **Közös megnyitás:** `useOpenDocument` – a kattintással nyit lapot, a meglévő `r2PresignDownload` aláírt linkjét tölti bele; hibánál bezárja és a sorban marad a besorolt hibaüzenet; letiltott lapnál „Megnyitás most” gomb.
- **Közös lista:** `DocumentList` (mobilon kártyasor, asztalon egy sor, egyetlen DOM) és `RelatedDocumentsPanel`.
- **Képernyők:**
  - Pipeline ügy adatlap: új „Ügy dokumentumai” (az ügy minden ajánlatverziójának fájljai, ügyfél, megnyerés utáni projekt).
  - Lead adatlap és Sales-dosszié Dokumentumok fül: megnyitható fájlok, forrás, kapcsolódó rekord.
  - Ügyfél adatlap: projekt- **és ajánlati** fájlok megnyithatók, kapcsolódó rekorddal; a fül száma a ténylegesen látható fájlokat mutatja.
  - Projekt Dokumentumok fül: alatta „Ajánlati és ügyfél-dokumentumok (Sales-időszak)” – a PM újrafeltöltés nélkül megnyitja a megnyert ajánlat és az ügyfél fájljait; a csempék szűrnek, a lista nem ismétli őket.
  - Dokumentumtár: két fül – „Projektdokumentumok és feltöltés” (meglévő) és „Ajánlati és ügyfél-dokumentumok” (keresés, csak megnyitás). Projekt nélküli fájl: NINCS ÖSSZEKÖTVE, a globális feltöltés figyelmeztet, hogy projekt nélkül kerül fel.
  - Ajánlat, ügyfél, marketing listák a közös listát használják; a feltöltés/törlés útja változatlan; zárolt ajánlat kiküldött fájljánál nincs törlés gomb.
  - Szerződés-előkészítés fájljai a közös megnyitással (soronkénti hiba).
  - Sales/Marketing a `/documents`-en: a tiltó oldal megmutatja, hol érik el a nekik engedélyezett fájlokat (csak általuk nyitható útvonalak).
  - Súgó: a Dokumentumok lépés frissítve.
- **Hibajavítás:** a két ütköző gyorsítótár-kulcs átnevezve (`company_documents/ids`, `company_documents/names`).

### Szerepkörönként (UI-hatás, a jogosultság változatlan)
| | Owner | PM | Sales | Marketing |
|---|---|---|---|---|
| `/documents` | igen | igen | nem (útmutató) | nem (útmutató) |
| Projekt-/ajánlat-/ügyfélfájl a kapcsolódó paneleken | mind | mind (ajánlat: `can_access_quote`) | mind (ajánlat: `can_access_quote`) | csak ügyfél/cég |
| Feltöltés gomb | mind | projekt/ajánlat/ügyfél | projekt/ajánlat/ügyfél | ügyfél |
| Kapcsolódó rekord link | mind | ahol a route engedi | ahol a route engedi | ügyfél |

## 3. Módosított fájlok
Új: `src/lib/documents/document-access.ts`, `related-docs-loader.ts`, `AGENTS.md`, `document-access.test.ts`, `related-docs-loader.test.ts`; `src/hooks/use-related-documents.ts`; `src/components/documents/document-list.tsx`, `related-documents-panel.tsx`, `use-open-document.ts`; `scripts/qa/check_documents.py`.
Módosított: `src/components/documents/document-manager.tsx`, `company-document-manager.tsx`, `src/components/quotes/quote-document-manager.tsx`, `src/components/contract/contract-prep-panel.tsx`, `src/components/pipeline/pipeline-detail-sheet.tsx`, `src/components/lead-workspace/lead-detail-column.tsx`, `lead-dossier-column.tsx`, `src/components/marketing/marketing-workspace.tsx` (csak gyorsítótár-kulcs), `src/routes/_authenticated/documents.tsx`, `projects.$id.tsx`, `customers.$id.tsx`, `quotes.$id.tsx` (zárolás átadása), `route.tsx` (tiltó oldal útmutató), `src/lib/help-guide.ts`, `src/lib/contract/contract-prep.test.ts` (forrásőr a közös megnyitásra frissítve, ugyanaz a határ), `scripts/qa/check_pm_day.py` (elavult modulútvonal-keresés javítva), `roadmap.md`.

## 4. Tesztek és tényleges eredmény
- `bunx vitest run` → **99 fájl, 1090/1090 PASS** (1050 korábbi + 40 új).
- `bun run ai:acceptance` → **AI OS Acceptance OK, 5 agent, 21 forgatókönyv, 0 hiba**.
- `tsgo -b --noEmit` → hibátlan; build (harness) → **build OK**.
- Új tesztek: egységes alak / hiányzó név, fájl, kategória; NINCS ÖSSZEKÖTVE; deduplikáció (azonos rekord, azonos fájlkulcs jelölve, kulcs nélküli nem); sorrend; ékezetfüggetlen és több szavas keresés; kategória/forrás szűrő; kapcsolódó link szerepkörönként és **negatív** (Marketing nem kap ajánlat/projekt linket); forrás-hatókör (Marketing csak ügyfél, szerepkör nélkül semmi); feltöltés/törlés tükör (más feltöltése, Marketing projektfájl, zárolt kiküldött ajánlat); 6 hibabesorolás; `/documents` route **változatlan** (Sales/Marketing tiltva) és az útmutató csak nyitható útvonalra mutat; betöltő hamis klienssel: lead kontextus, forráshiba = NINCS ADAT a többi megmarad, nem olvasható lead-ajánlatok = NINCS ADAT, érvénytelen azonosító kiszűrve, rejtett forrás nem kérdeződik le, felső határ = nem teljes, Dokumentumtár mód, duplikált sor, címkehiba; forrásőr: az új réteg nem ír, nem használ admin klienst, csak `r2PresignDownload` nyit fájlt.
- **Izolált böngészőpróba** (`python3 scripts/qa/check_documents.py owner|project_manager|sales|marketing`; kitalált TESZT-sorok, minden REST-írás és RPC 403, szerverfüggvények 503 — nem valódi RLS, nem valódi R2), 1280×1800 és 390×844:
  - Projekt Dokumentumok: 2 projektfájl + Sales-időszak 1 ajánlati + 2 ügyfélfájl, duplikált sor 0, „Ugyanez a fájl” jelölés megjelent; túlcsordulás nincs.
  - Dokumentumtár (Owner/PM): projekt nélküli fájl NINCS ÖSSZEKÖTVE; második fül 2 ajánlati + 2 ügyfélfájl. Sales/Marketing: tiltó oldal útmutatóval (Sales: Pipeline, Ajánlatok, Ügyfelek, Projektek; Marketing: Ügyfelek, Érdeklődők).
  - Ügyfél: 2 ügyfél + 2 projekt + 2 ajánlati fájl (Owner/PM/Sales); Marketing csak 2 ügyfélfájl.
  - Pipeline ügy (Sales/Owner) és Lead/dosszié fül: ajánlati + ügyfélfájlok, „Projekt: NINCS ÖSSZEKÖTVE”, linkek csak ügyfél/ajánlat adatlapra; Marketing lead: csak ügyfélfájl.
  - Keresés „bemutato” → csak a „bemutató” fájl. Megnyitás: a meglévő `r2PresignDownload` hívódott, izoláltan hibázott → soronkénti hibaüzenet, az új lap bezárult (0 árva lap).
  - Írási kísérlet: **0** mind a négy szerepkörben; oldalhiba: 0.
  - Regresszió: `check_contract_prep.py owner` (megnyitás + hibaüzenet változatlan), `check_handoff.py project_manager` (a szándékos, blokkolt alapadat-mentés próbája), `check_pm_day.py` lefutott, oldalhiba 0. A PM-próba „Mentési hiba” felirat-ellenőrzése a feladat-„Kész” gombnál nem talált egyezést — ez a feladatlistát érinti, amelyhez ez a csomag nem nyúlt; nem vizsgáltam tovább.
- **NEM TESZTELT:** valódi bejelentkezett szerepkörös RLS-szűrés, valódi R2 aláírt letöltés és fájlmegnyitás, valódi „Nincs hozzáférésed” szerverválasz, mobil felugró-ablak viselkedés valódi eszközön, feltöltés/törlés (szándékosan nem futtatva).

## 5. Commit, diff, rollback
- Commit: lásd `git log` („8. csomag: szerepkörös dokumentumelérés…”); a hash a jelentés-kiegészítő commitban.
- Diff: `git show --stat <commit>`; visszavonás: `git revert <commit>` (csak kód; adat, séma, jogosultság nem változott, így adat-visszaállítás nem kell).

## 6. Valós hiányok és jóváhagyást igénylő döntések (NINCS élesítve)
1. **`project_documents` SELECT túl tág:** minden PM/Sales/Marketing felhasználó minden projekt fájlját olvashatja (a Data API-n át is). Javaslat: `can_access_project_document(project_id)` – Owner; PM saját projekt (`project_manager_user_id`); Sales a projekt leadjének felelőse (mint `can_access_quote`); Marketing nem; projekt nélküli sor csak Owner + feltöltő. Elfogadás: négy szerepkör pozitív/negatív SQL-teszt, `r2PresignDownload` ugyanígy szűr. Hatás: PM/Sales kevesebbet lát – előtte darabszám-összevetés.
2. **`company_documents` SELECT minden cégre:** javaslat: Sales a saját leadjeihez tartozó cégek, Marketing a saját scope-ja, PM a saját projektjeinek cégei; döntés kell, mert a marketing-folyamat jelenleg szándékosan nyitott.
3. **Sales hozzáférés a `/documents` oldalhoz:** csak az 1–2. pont után javasolt (`permissions.ts` ROUTE_ACCESS + `route_permissions`), különben a Sales minden projekt fájlját listázhatná. Marketing: továbbra se kapjon projekt/ajánlat forrást.
4. **25 projekt nélküli projektdokumentum:** tulajdonosi kézi hozzárendelés projekthez (éles adatírás) – tételes lista + visszaállítási SQL előzetesen; a csomag csak NINCS ÖSSZEKÖTVE-ként jelöli.
5. **Levélmellékletek (1219)** nincsenek a Dokumentumtárban: csak levélszál-jogosultsággal, a levél nézetből érhetők el; ha a tárban is kellenek, postafiók-hatókörös olvasó kell (külön terv).
6. **Élő frissítés:** a dokumentumtáblák nincsenek a közös realtime csatornán (`use-realtime-sync.ts`); más felhasználó feltöltése frissítésig nem látszik. Kis kódmódosítás, de közös csatorna – külön jóváhagyással.
7. Feltöltés közvetlenül a Pipeline/lead panelről (kevesebb kattintás) – szándékosan nem; a meglévő ajánlat/ügyfél/projekt feltöltési út marad, hogy a fájl biztosan a megfelelő rekordhoz kapcsolódjon.
