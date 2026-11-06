# 6. szakasz – valós futási hibák céljavítása

## Bizonyíték és ok
- Előnézeti console: `TypeError: mailboxes.find is not a function`, mailbox-model → EmailsPage.
- Ugyanazon kérés hálózati naplója: getMailboxes GET **401**, `Unauthorized: invalid token`. Nem sikeres SQL-lista okozta a hibát.
- A régi RPC middleware HTTP Response-t dobott; ez RPC-eredményként/listaként is eljuthatott a kliensre. A caller csak TypeScript-típust feltételezett, futási válaszellenőrzés nélkül.
- A régi szerverkliens modulbetöltéskor olvasta a környezeti értékeket, hardcoded fallback-kapcsolattal és opaque kulcs kezelés nélkül. Ez eltért a működő generált hitelesítési úttól. A 401 mögötti konkrét Auth-szolgáltatói ok **nem igazolt**; lejárt tokennek nem minősítettük bizonyíték nélkül.
- Marketing /today: mindkét céglista, friss email_threads és HEAD email-count **200** a kapott naplóban. A napi serverFn szintén 200; a rögzített részleges lefedettség mellett a válaszarány nem állítható teljesnek. A minden mutatót érintő tartós „—” hiba oka ebből a pillanatképből **nem igazolt**.
- Szervernapló: meglévő aborted / ECONNRESET / h3 HTTPError bejegyzések; nem köthetők bizonyítottan a mailbox 401-hez.

## Kizárólag célzott változások
- `src/integrations/supabase/server.ts`: request-time kapcsolat, nincs hardcoded másik projekt/fallback, opaque apikey és caller bearer kezelése.
- `src/integrations/supabase/middleware.ts`: RPC-hitelesítési HTTP Response → dobott Error. API-k HTTP-401 szerződése megmarad.
- `src/lib/gmail/mailbox-model.ts`: hibás/HTTP válasz elutasítása még a Query sikeres cache-be helyezése előtt.
- `src/routes/_authenticated/emails.index.tsx`: lista és lap betöltése a válaszellenőrzéssel.
- `src/lib/gmail/mailbox-model.test.ts`, `src/integrations/supabase/server.test.ts`: regressziós esetek.
- `scripts/qa/check_runtime_routes.py`: megőrzött Playwright útvonal/betöltési regresszió; teljes route tree, meglévő oldalak és tényleges query/serverFn klienshívás, kizárólag TESZT hálózati válaszok. Ez nem valódi bejelentkezett end-to-end teszt.

## Ellenőrzés
- Végső teljes regresszió: **777/777**, 77 fájl PASS, beleértve a caller bearer/opaque apikey Auth-próbát.
- AI acceptance: **21 forgatókönyv PASS**, 0 hiba/figyelmeztetés; nem élő Scarlet-próba.
- Harness utolsó kód-build: **build OK**.
- Valódi signed-out betöltés: /emails, /today, /dashboard, /projects, /leads, /campaign-list → /auth; 0 pageerror. Ez csak a nyilvános betöltést és a belépési kaput igazolja.
- Elkülönített eredeti útvonalbetöltés: mailbox 401 lokalizált hiba, nincs teljes oldalas összeomlás; sikeres mailbox-lista és mailbox-page ténylegesen meghívva, üres lista megjelenik.
- Marketing /today sikeres company/thread/count/daily TESZT-válasz: betöltött mutatók, **0 „—”**, 0 pageerror. Hibás cégválasznál nem állítottunk nullát/sikert.
- Owner/Sales/Marketing/PM /today; Owner /dashboard; PM /projects; Sales /leads; Marketing /campaign-list: elkülönített route tree betöltés, 0 pageerror és 0 teljes oldalas összeomlás. A Sales napi AI-javaslat/figyelés szándékosan blokkolt külső válasz, helyi hiba jelenik meg; nem állítunk AI-sikert. TESZT count/list értékek nem üzleti pontosságtesztek.
- Képernyőképek vizuálisan ellenőrizve (mailbox hiba, Marketing/Sales/PM főoldal); képek és részletes kimenet /tmp/browser/runtime-fix alatt.

## Nyitva / NEM TESZTELT
- Külső, nem kezelt Supabase (`external_unmanaged`): valódi Owner/Marketing/Sales/PM munkamenet nem átadható. Valós CRM-adat visszaolvasás, Gmail/R2 és szerepkörös hitelesített end-to-end **NEM TESZTELT**.
- A valós 401 megszűnése és a felhasználó által látott minden marketingmutató „—” állapotának megszűnése **NEM TESZTELT**; csak izolált sikeres/hibás betöltés igazolt.
- Részleges napi levelezésből nem számolunk teljesnek állított válaszarányt; ezt nem helyettesítjük nullával.
- Korábbi lint/biztonsági és funkcionális hiányok nyitva, nincs szakaszlezárás.
- Nem volt séma/RLS/import/üzleti adatváltozás, Sales-logikaváltozás, Gmail-küldés vagy publikálás. STOP.