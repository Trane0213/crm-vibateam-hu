# Képfelismerés (OCR) — 1. szakasz: kérésre olvasás a chatben (2026-11-14)

Jóváhagyott terv: `.lovable/plan/terv-szkennelt-dokumentumok-és-képek-bekötése-az-ai-assziszt-2026-11-14.md`. Csak az 1. szakasz készült el; a 2–4. szakasz külön engedélyre vár.

## Mit tud most
- Timothy (Sales AI) a `crm_read_document` eszközzel, `ocr=true` kérésre:
  - képet (PNG/JPEG/GIF/WEBP, tartalom alapján ellenőrizve) és
  - szövegréteg nélküli (szkennelt), legfeljebb 20 oldalas, 5 MB alatti PDF-et
  egyetlen közvetlen OpenAI Responses hívással kiolvas (központi `AI_MODEL`: gpt-6-astra, high).
- Eredmény oldalanként: átírt szöveg, rövid leírás, bizonytalan részek. Jelölés: `ai_extracted: true`, `source_fact: false`, „AI által kiolvasott, nem ellenőrzött forrás”, `human_verified: false`.
- Ocr nélkül képnél `requires_ocr` állapot, modellhívás nélkül. Szövegréteges PDF-nél OCR akkor sem fut (nem fizetünk feleslegesen).
- Ugyanaz a fájl (azonos tartalom-hash) ugyanannak a felhasználónak 15 percig nem kerül újra elküldésre (memóriában, nem mentve).
- Hiba (szolgáltató, kredit, időkorlát, értelmezhetetlen válasz) esetén nem újrapróbálható hiba, szolgáltatói részlet nélkül; tartalmat nem állít.
- Érzékenyadat-szűrő (jelszó/kulcs) a kiolvasott szövegre is; az audit csak metaadatot (hash, modell, token, gyorsítótár) tárol.

## Változatlan
- Jogosultság: csak Timothy, Owner/Sales szerepkör; ugyanaz a sor- és szülőrekord-ellenőrzés a letöltés előtt.
- Adatbázis, RLS, tárolás, tudásbázis-feldolgozó (`ingest.server.ts`), egyéb asszisztensek: nem módosult. Semmi nem íródik.

## Módosított fájlok
- `src/lib/ai-os/providers.server.ts` — `callResponsesMultimodal` (csak `openai` provider)
- `src/lib/ai-os/adapters/vision-extract.server.ts` — ÚJ: képtípus-felismerés, OCR-hívás, kimenet-ellenőrzés, szűrés, korlátok
- `src/lib/ai-os/adapters/document-access.server.ts` — `ocr` paraméter
- `src/lib/ai-os/adapters/document-tools.server.ts` — OCR-ág, `readDocumentFailure`, eszközleírás
- `src/lib/ai-os/agents.ts` — Timothy utasítás: mikor és hogyan idézze az AI-kiolvasást
- `src/lib/ai-os/adapters/vision-extract.test.ts` — ÚJ, 17 teszt
- `src/lib/ai-os/AGENTS.md` — architektúra-szabály

## Tesztek (valós eredmény, 2026-11-14 16:53 UTC)
- `bunx vitest run` — 1107/1107 PASS (korábbi 1090 + 17 új)
- `bun run ai:acceptance` — 21/21 PASS, 0 hiba
- `bunx tsgo -b --noEmit` — PASS
- Új tesztek (mock modellel, fizetős hívás nélkül): képtípus tartalom alapján; központi modell használata; 20 oldal / 5 MB korlát hívás előtt; szolgáltatói hiba és hibás JSON nem siker; részleges/megszakadt válasz; érzékeny adat visszatartása; üres kiolvasás; ocr nélkül nincs hívás; jelölések; szkennelt PDF egyszeri küldése; szövegréteges PDF nem fizet; gyorsítótár felhasználónként; láthatatlan/idegen fájl → nincs letöltés és hívás; álcázott fájl elutasítása; nem újrapróbálható hiba; tartalommentes audit; változatlan jogosultság.

## NEM TESZTELT
- **Élő OpenAI képfelismerés**: a jóváhagyott terv szerinti 5 TESZT-fájlos fizetős próba külön engedélyre vár. Nem ismert még, hogy a `gpt-6-astra` modell elfogad-e kép-/PDF-bemenetet; ha nem, a hívás hibát ad (nem állít tartalmat), és modellváltáshoz tulajdonosi döntés kell.
- Bejelentkezett Sales/Owner chat-végigpróba valós fájllal.
- Valós költség fájlonként/oldalanként.

## Visszaállítás
`git revert <e szakasz commitja>` — adat nem íródott, más visszaállítás nem kell.

## Következő döntések
1. Engedély az 5 TESZT-fájlos élő próbára (2 szkennelt PDF, 2 fotó, 1 kézírásos).
2. 2. szakasz: költségkeret adagonként és összesen; png-k feldolgozása igen/nem.
3. 3. szakasz: chatbe feltöltött kép csak beszélgetésben vagy mentve az ügyhöz.
4. 4. szakasz: George/Boss/Scarlet és projektvezetői hozzáférés.
