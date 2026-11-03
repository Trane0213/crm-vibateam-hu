# Timothy V3.0 – P1/D dokumentumértelmezés

2026-11-03. Jóváhagyás: P1/C után „mehet tovább”. P2–P5 nem indult.

## Megvalósítás

- Meglévő AI OS, ugyanazon bootstrap/runtime és két chat. Új olvasási eszközök: `crm_list_documents`, `crm_read_document`; Timothy és meglévő owner/admin/sales szerepkörök. Nincs új dokumentumtár, chat, AI-szolgáltató, háttérmunka vagy CRM-írás.
- Források a meglévő quote_documents/company_documents/project_documents/email_attachments. Dokumentumlista konkrét szülőazonosítóval, külön forrásonként, stabil created_at/id lapozással és látható darabszámmal.
- Fájlt csak saját RLS-klienssel olvasható sorból és pontos olvasható szülő alapján választ. Mellékletnél a P1/B meglévő crm_read_email_thread ellenőrzi a konkrét email_id/thread_id/company_id/mailbox kapcsolatot és fióktulajdonlást; ha az üzenet nem kerül a jogosult eredménybe, mellékletet sem olvas.
- Az ellenőrzött sor tárolási kulcsára a meglévő R2 SigV4 aláíró készít rövid GET linket, amelyet a szerver olvas. Kulcsot/URL-t a modell nem adhat meg, és nem kap vissza; külső URL és átirányítás tiltott. A meglévő r2PresignDownload/feltöltés/törlés nem változott.
- 5 MB tényleges letöltési korlát (stream közben is), 15 másodperces letöltési timeout. Ismert nagy fájl explicit requires_large_processing, tartalomletöltés és háttérmunka nélkül. Nagyfeldolgozó/tartós állapot külön rendszerként nem készült.
- PDF: unpdf@2.1.0 szerverless PDF.js, egy oldal/kérés, legfeljebb 300 oldal, 15 másodperces feldolgozási határidő, képkódolás/canvas/WASM nélkül. Szövegréteg, nem OCR; koordinált táblázat és kép nem vizsgált. Az időkorlát nem kemény CPU-megszakítás: eseményhurok blokkolásánál a Worker saját erőforráskorlátja marad a végső védelem.
- XLSX: meglévő xlsx@0.18.5, munkalap/cellaazonosító és mentett cellaérték. Képlet nem végrehajtott és nem újraszámított; ezt a sor jelzi. Legfeljebb 10 000 sor és 200 oszlop, egy munkalap/kérés. Makró/külső link/beágyazott Office rész tiltott.
- DOCX: fflate@0.8.3 ZIP + XML törzsszöveg. Nem teljes fejléc/lábléc/megjegyzés/követett módosítás/kép-audit. ZIP előellenőrzés a kibontás előtt: 20 MB deklarált kibontott összméret, 2000 bejegyzés, titkosítás/ZIP64/duplikált bejegyzés/aktív vagy külső részek tiltva. Ez nem általános kártékonyfájl-vizsgáló.
- TXT/CSV: UTF-8 szöveg, CSV képlet nem fut. Régi DOC/XLS, képek és DWG nem támogatottak.
- 6000 karakteres szövegrészletek, unit/text_offset folytatás. Minden folytatáshoz előző SHA-256 hash szükséges; megváltozott fájlnál a folytatás tiltott. Nincs kinyert szöveg másodlagos tárolása vagy cache.
- Visszakereshető forrás: tábla/sor-ID/név/szülőazonosító, feltöltés dátuma, processed_at, SHA-256 fájltartalom-verzió, külön quote_version üzleti verzió és parser. Hiányzó feltöltési dátum nincs kitalálva.
- Szöveg titokszűrése a kiválasztott egység teljes szövegén, nem csupán az adott részleten; sensitive_withheld/partial/no_extractable_text/unsupported állapotok. A dokumentumtartalom nem utasítás; Timothy prompt ezt kimondja. Ez konzervatív mintafelismerés, nem teljes titokdetektor vagy garantált modellvédelem.
- AI auditba csak forrás/provenance/állapot/lapozás kerül, nem kinyert tartalom vagy aláírt URL. Parser/network hibák általános üzenetté alakítva, nyers esetleges fájlszöveg/URL/titok nem naplózott. A felhasználó által kért AI-összefoglaló továbbra is a meglévő chatben megjelenik.

## PASS / FAIL / NEM TESZTELT

| Vizsgálat | Eredmény |
|---|---|
| Teljes regresszió | PASS 224/224, 30 fájl |
| P1/D célzott tesztek | PASS 20/20 |
| AI acceptance | PASS 5 agent, 16 strukturális forgatókönyv, 0 hiba/figyelmeztetés |
| Automatikus fordítás/típusellenőrzés | PASS build OK, 2026-11-03 16:32:56 UTC |
| Valódi bináris TESZT PDF / DOCX / XLSX | PASS izolált Node/Bun tesztfolyamatban |
| UTF-8, hosszú szöveg, titok visszatartása, méret/hibás ZIP | PASS |
| Rejtett szülő, más ügyű fájl, külső URL, fiókhoz nem tartozó melléklet | PASS izolált kliens-fixture; nem éles RLS-próba |
| 39 dokumentum lapozása, hash/verzió, audit tartalomkihagyás | PASS |
| Valós Worker környezetben dokumentum-extraction végrehajtása | NEM TESZTELT: fordítás igazolt, végrehajtás nem |
| Hitelesített R2 letöltés + két-chat + modellminőség | NEM TESZTELT: external_unmanaged Supabase, nincs átadható biztonságos munkamenet |
| OCR/nagy fájl tartós háttérfeldolgozás | NINCS MEGVALÓSÍTVA; korlát és hiány explicit |

A PDF tesztek standardFontDataUrl figyelmeztetést adtak, de a TESZT szöveg kiolvasása sikerült. Nem állítunk minden font/CJK/szkennelt fájlra teljes olvashatóságot. A package dokumentált Worker támogatása és a build PASS nem helyettesíti a közzétett Worker végrehajtási próbát. Strukturális AI acceptance nem valódi modellválasz minőségi teszt. A P1 teljes éles lezárási feltétele továbbra is nyitott.

## Saját bejelentkezésből ellenőrizendő

Egy saját TESZT ajánlat feltöltött TESZT fájljára: „Listázd az ajánlat dokumentumait, és foglald össze a költségvetés első munkalapját; jelezd, mit nem olvastál.” Ellenőrizendő konkrét fájlnév/ID, SHA-256, ajánlatverzió, forrásegység, feldolgozási idő, mentett cellaérték, szövegfolytatás és hiányjelzés; más ügy/fiók fájlja ne kerüljön elő; ár/CRM/fájl/email nem módosulhat. Ugyanez mindkét meglévő chatben szükséges, jelszó chatben nélkül.

## Hatás és visszaállítás

Nincs DB-migráció, RLS/szerepkörváltozás, éles rekord-/fájlírás, Gmail-küldés/szinkron vagy publikálás. P0 és a meglévő Sales/ajánlatkezelő üzleti működése változatlan. Új dependencies: unpdf, fflate; xlsx meglévő.

Visszaállítás: előző projektverzióból bootstrap/runtime/Timothy prompt/acceptance fixture/AGENTS szabály és csomagállapot visszaállítása; ezután új document-access.server/document-extract.server/document-tools.server/document-context.test/document-audit fájlok eltávolítása. DB rollback nem szükséges. Teljes Vitest + AI acceptance újrafuttatandó. Dokumentum letöltési/szerkesztési útvonalak nem változtak.

STOP. P1/D olvasási képesség és izolált tesztek elkészültek, hitelesített/Worker/minőségi ellenőrzés nyitott. P2 külön jóváhagyásra vár, nem indult.