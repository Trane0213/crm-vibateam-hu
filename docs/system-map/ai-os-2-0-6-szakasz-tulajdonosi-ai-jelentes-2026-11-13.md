# AI OS 2.0 – 6. szakasz: Tulajdonosi AI-jelentés (2026-11-13)

Állapot: **KÉSZ** (kézi indítással). Automatikus napi/heti indításhoz szerveroldali ütemező kell — ugyanaz a nyitott döntés, mint az 5. szakaszban.

## Működés
- Oldal: `/owner-report` (csak Tulajdonos; link: Vezetői áttekintés → „George jelentése”).
- **Azonnali figyelem:** lezáratlan kritikus/döntést igénylő értesítések, AI nélkül.
- **Tények (AI nélkül):** a szerver a Tulajdonos jogosultságával kiolvassa a rekordokat; minden tétel rekordazonosítóval és hivatkozással. Napi: azonnali, új és nyitott bejelentések, megnyert/elveszett ügy, igazoltan kiküldött ajánlat, új webes kérés, dokumentumhibák, értesítések, elmaradt teendők, nyitott AI-jelzések, AI-felhasználás modellenként. Heti: ugyanez 7 napra + ismétlődő problémák, George-vizsgálatok javaslatai, dolgozói UX/fejlesztési javaslatok, „nem oldódott meg” visszajelzések.
- **George összegzése (fizetős):** csak a tényekből, csak olvasó módban, handoff nélkül. Napi: legfontosabb tételek + mai teendők. Heti: P1/P2/P3 priorizált fejlesztési lista, üzleti hatás csak szövegesen, rekordszámra hivatkozva.
- **Forráshűség:** „Forrástény” csak akkor marad, ha minden hivatkozott azonosító a tényekben vagy George saját olvasásában szerepelt; különben „Nem ellenőrzött”. A javaslatok mindig emberi döntést igényelnek.
- **Költségvédelem:** változatlan tényekre (a jelentés saját AI-futása nem számít változásnak) nem indul új hívás; közös napi tokenkeret és szüneteltetés az AI-felülvizsgálattal; fajtánként egy készülő jelentés; kredit/rate-limit hibánál leállás.
- Nem módosít üzleti adatot, nem küld, nem publikál.

## Kód
- Migráció: `ai_owner_reports` (Owner-olvasás, kliens nem ír; egyszerre egy futó, azonos tényekre egy kész jelentés).
- `src/lib/owner-report/model.ts` (+4 teszt), `facts.server.ts`, `report.server.ts`, `owner-report.functions.ts`; `src/routes/_authenticated/owner-report.tsx`; Tulajdonos súgó; közös keret: `ai-review/review.server.ts` `usageToday`.

## Tesztek
- PASS: 851 unit teszt (4 új), 21 AI acceptance, TypeScript, build.
- PASS (élő, csak olvasás): napi és heti tények valós adatokból, minden tételnek van azonosítója, ismételt gyűjtésre azonos ujjlenyomat.
- PASS (élő OpenAI, szerveroldali Owner-azonosítóval): napi összesítő 121 mp, 27 498 token — 9 megállapítás, mind forrástény (15 ellenőrzött forrás, 0 nem ellenőrzött); a szövegben szereplő számok egyeznek a tényekkel; második hívás változatlan tényekre 0 token.
- PASS (élő): heti fejlesztési lista 140 mp, 19 335 token — 11 megállapítás (6 forrástény, 5 jelölt AI-következtetés), 21 ellenőrzött forrás, 0 nem ellenőrzött, P1–P3 lista; második hívás 0 token.
- FAIL → javítva: az első élő próbán a jelentés saját AI-futása „változásnak” számított (fölösleges második hívás, 27 038 token), és George a tényeket „nem ellenőrzött”-nek jelölte. Mindkettő javítva, újra futtatva PASS.
- NEM TESZTELT: bejelentkezett Owner-böngészős nézet (nincs bejelentkezett munkamenet); a próbák szolgáltatói kulccsal futottak, a felhasználói RLS-t nem gyakorolták.
