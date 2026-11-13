# AI OS 2.0 — 2. részegység: automatikus dokumentumfeldolgozás (2026-11-13)

## Megvalósítva
- Migráció (élesben): feldolgozási sor a meglévő `knowledge_documents` táblán (claim_token, claimed_at, attempts); `file_url` nem kötelező (tárolási kulcs nem kerül a tudásbázisba).
- Triggerek a 4 forrástáblán: új / módosult fájl → sorba áll; módosult fájlkulcs → újrafeldolgozás; törölt forrás → index érvénytelen.
- `knowledge_claim_batch`: SKIP LOCKED, 10 perces lejáró foglalás, max. 3 próbálkozás. `knowledge_store_result`: atomikus; új hash → új verzió, régi elavul; visszaállt tartalom → korábbi verzió újraaktiválva. Mindkettő csak szerveroldalról hívható.
- Feldolgozó (`src/lib/knowledge/ingest.server.ts`): csak a meglévő `extractDocument` szövegkinyerés, **AI-hívás nélkül**; nem támogatott típus és 5 MB feletti fájl le sem töltődik; jelszó/kulcs gyanújánál a tartalom nem kerül be; szkennelt PDF → „Ellenőrzést igényel”.
- Kapcsolatok csak a forrássor saját kapcsolataiból; e-mail-mellékletnél a vitatott levél–cég kötés nem öröklődik.
- Owner-felület: Beállítások → Knowledge Graph oldalon „Dokumentumok a közös AI-tudásbázisban” kártya (állapotszámok, „Következő 5 feldolgozása”, figyelmet igénylő lista).

## Közben javított hibák
- Beragadt AI-futások oka: a Worker időkorlát megszakítja a futást a lezárás előtt. Javítás: új futás indításakor a felhasználó 30 percnél régebbi nyitott futásai `stale_timeout` hibával lezárulnak.
- Kinyert szöveg NUL-karaktere miatt 6 melléklet nem volt menthető → szöveg-normalizálás, újrafeldolgozva.

## Élő eredmény (821 dokumentum, 157 mp, 0 AI-hívás)
| Állapot | Darab |
|---|---|
| Feldolgozva | 142 (céges 2, projekt 23, ajánlat 4, melléklet 113) |
| Részlegesen feldolgozva | 8 melléklet |
| Ellenőrzést igényel | 28 (19 túl nagy/OCR, 8 szöveg nélküli/szkennelt, 2 nagy dokumentum) |
| Nem támogatott | 635 (főleg képek) |
| Hibás | 2 sérült melléklet |
Kereshető szövegrész: ~1100.

## Tesztek
| # | Teszt | Eredmény |
|---|---|---|
| 1 | Feltöltött PDF/DOCX/XLSX automatikus indexelése (meglévő fájlokon, sor + feldolgozás) | PASS (élő, backfill) — új feltöltés UI-ból NEM TESZTELT |
| 2 | Módosított dokumentum új verziója, régi nem aktuális | PASS (izolált, visszagörgetett DB-próba) |
| 3 | Duplikált fájl / azonos hash nem hoz új verziót; visszaállt tartalom régi verziót aktivál | PASS (izolált) |
| 4 | Szkennelt / túl nagy / sérült fájl hibajelzése | PASS (élő: needs_review / error) |
| 5 | Jogosultság: Owner 821, PM 74, Sales 51, szerepkör nélküli 0 — pontosan a látható forrásokkal egyezik | PASS (izolált, szerepkörös DB-próba) |
| 6 | Törölt forrás érvénytelenítése | PASS (izolált, visszagörgetve) |
| 7 | Szabálytesztek (8 új) + AI OS (466 összesen), ai:acceptance | PASS |
| 8 | Owner kártya bejelentkezve | NEM TESZTELT (saját kezelésű Supabase, nincs böngészős belépés) |
| 9 | Marketing szerepkör | NEM TESZTELT (nincs aktív Marketing-felhasználó) |
| 10 | Négy AI ugyanazt a tényt találja élő modellel | NEM TESZTELT (OpenAI-kredit nem igazolt) |

## Nem működik még / döntés kell
- OCR: 27 fájl vár rá. Kérte a külső OCR-t — szolgáltató- és költségkeret-döntés kell (lásd zárójelentés).
- A feldolgozás Owner-gombra indul (a választott „csak CRM-en belül” mód); valódi automatikus óránkénti indítás az 5. részegység.
- Feldolgozási hiba értesítése a 4. részegységben (értesítési központ).
