# AI OS 2.0 – 5. szakasz: Automatikus AI-felülvizsgálat (2026-11-13)

Állapot: **RÉSZBEN KÉSZ** — az óránkénti ellenőrzés és a George-vizsgálat kész; a fizetős George-vizsgálat automatikus (óránkénti) indításához szerveroldali ütemező kell (külön jóváhagyás).

## Működés
1. **Óránkénti ellenőrzés (AI nélkül):** `ai_review_collect` SQL-függvény, pg_cron `ai-review-hourly` (minden óra 7. perc), HTTP-visszahívás nélkül. Alapból **kikapcsolva** (`ai_review_config.enabled=false`) — ilyenkor munka nélkül tér vissza.
2. **Jelzések:** lejárt következő lépés / következő lépés nélküli / felelős nélküli nyitott ügy (Timothy); bizonyíték nélkül „kiküldött” ajánlat (SÚLYOS); 24 óránál régebbi feldolgozatlan webes ajánlatkérés, sikertelen kampánytétel (Scarlet); határidőn túli / PM nélküli projekt, lejárt feladat (Boss); dokumentumhiba, ellenőrzést igénylő dokumentum, vizsgálat nélküli / újranyitott / utóellenőrzésre váró bejelentés, AI-kredithiba (SÚLYOS), ismétlődő AI-hibák, beragadt futás, Gmail-szinkronhibák (George).
3. **Duplikációszűrés:** egyedi `signal_key`; ismétlődés a korábbi jelzés `occurrences` számát növeli. Megszűnt állapot automatikusan „Megszűnt”.
4. **Azonnali jelzés:** új súlyos jelzés → egy, döntést igénylő Owner-értesítés (`crm_notify`, dedupe). Új figyelmeztetések → napi összevont értesítés.
5. **George célzott vizsgálata (fizetős):** Tulajdonos indítja (Beállítások → AI-felülvizsgálat). Csak warning/critical, még nem vizsgált jelzés; területenként egy hibajegy a közös hibajegyzékben (`technical_code=AI_REVIEW`, determinisztikus azonosító), majd a meglévő `performIssueReview`: George csak az érintett szakértőt kérdezi. Bejelentéshez kötött jelzésnél a meglévő jegyet vizsgálja.
6. **Védelem:** futási zár (egy futó ciklus fajtánként, lejáró lease), idempotens jelzés-claim, hiba után 1 újrapróbálás majd „Sikertelen — kézi döntés”, napi vizsgálatszám- és tokenkeret, indításonkénti limit, kredit/rate-limit hibánál szüneteltetés + Owner-gomb a folytatáshoz. Modellenkénti tokenkimutatás.
7. Üzleti adatot, jogosultságot nem módosít; nem küld, nem publikál.

## Kód
- Migrációk: `ai_review_config`, `ai_review_runs`, `ai_review_signals` (Owner-olvasás, kliens nem ír), `ai_review_collect` (csak service_role), cron-ütemezés.
- `src/lib/ai-review/model.ts` (+12 teszt), `review.server.ts`, `ai-review.functions.ts`.
- `src/lib/issue-review.server.ts` — a meglévő George-vizsgálat kiemelve, viselkedés változatlan (`reviewIssue` ezt hívja).
- `src/routes/_authenticated/settings.ai-review.tsx`, Beállítások menü, Tulajdonos súgó.

## Tesztek
- PASS: 847 unit teszt (12 új), 21 AI acceptance, TypeScript, build.
- PASS (visszagörgetett DB-próba): kikapcsolt cron → munka nélkül; első futás 53 jelzés, 0 AI-hívás (ebből 9 vizsgálandó: George 3, Scarlet 3, Timothy 3; 44 tájékoztató); változás nélküli újrafutás → 0 új jelzés, ismétlés a korábbihoz kapcsolódik; futási zár → „locked”; új súlyos hiba → 1 jelzés + 1 értesítés, ismétlésre is 1 értesítés; javítás után → „Megszűnt”.
- PASS (visszagörgetett jogosultsági próba): Owner látja a jelzéseket; Sales és Marketing nem; anon tiltva; kliens nem írhat konfigurációt és nem hívhatja a gyűjtőt.
- NEM TESZTELT: bejelentkezett Owner-oldal és élő George-vizsgálat ezen az úton (nincs bejelentkezett munkamenet; a George-vizsgálat motorja a 3. szakaszban élőben PASS).

## Nyitott döntés
- A fizetős George-vizsgálat óránkénti automatikus indítása: szerveroldali ütemezett hívás kell (pl. a már meglévő Gmail-szinkron ütemezési mintája szerint, titkos kulccsal védett végponttal). Külön jóváhagyás szükséges.
