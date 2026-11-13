# AI OS 2.0 – 7. szakasz: felhasználói élmény és átláthatóság (2026-11-13)

## Elkészült
- **Ki válaszol, mit vizsgál:** minden AI-válasz fölött az asszisztens portréja, neve, szerepe, és ha volt, a vizsgált ügy (rekordkontextus). Futás közben: „<Név> dolgozik: <aktuális lépés>”.
- **Állapotsor minden válasz alatt** (`RunStatusStrip`): Kész / Kész, de hiányos adatokkal / Döntésedre vár / Kész — CRM-adatot nem nézett meg; „Megnézte” (forráskategóriák + rekordszám), „Megkérdezett szakértő”, „Nem sikerült beolvasni”, „Nincs hozzáférés”. Forrás: a futás valódi eszközhívásainak kimenete (`src/lib/ai-os/transparency.ts`, `runtime.server.ts` csak additív rögzítés), nem a modell szövege.
- **Érthető hibák:** kredit/limit, jogosultság, lépéslimit, hálózat — mindig jelzi, hogy semmi nem módosult (`friendlyAiError`).
- **Dokumentumok:** projekt-, cég- és ajánlatdokumentumoknál jelvény (AI számára olvasható / Részben / Ellenőrzést igényel / AI nem olvassa / Hiba / Feldolgozásra vár) magyar okkal; lista fölött figyelmeztetés, ha van nem olvasható fájl. Olvasás user-RLS-sel (`knowledge_source_visible`). Owner feldolgozási kártyán a hibakód helyett magyarázat.
- **Értesítések:** legalább 3 azonos jelzés egy összevont sorba kerül (csengő: „… (28 db)”, oldal: „Tételek megjelenítése”, „Mind olvasott (N)”). Csak megjelenítés; az adatbázis-sorok, olvasottság és automatikus lezárás változatlan.
- **Súgó:** minden szerepkörnél új „AI-asszisztens válaszának értelmezése” lépés; értesítési lépés kiegészítve.

## Nem változott
Jogosultság, RLS, séma, üzleti logika, jóváhagyási folyamat, modellkonfiguráció. Nincs migráció, küldés, publikálás.

## Ellenőrzés
- 858 unit teszt (87 fájl) PASS, ebből új: 5 átláthatósági + 2 csoportosítási teszt; AI acceptance 21/21 PASS; típusellenőrzés és build PASS.
- A tesztek közben valós hibát fogtak: a `crm_list_leads` hirdetésként címkéződött — javítva.
- **NEM TESZTELT:** bejelentkezett böngészős nézet (a projekt bejelentkezése nem szimulálható a fejlesztői környezetben), élő AI-válasz állapotsorral, dokumentumjelvény valós szerepkörökkel.
