# Marketing napi munkafelület és Scarlet-munkafolyamat — 2. nagy munkacsomag (2026-11-13)

Állapot: **RÉSZBEN KÉSZ** — kód, unit tesztek, típusellenőrzés, AI acceptance PASS; bejelentkezett Marketing/Owner felület **NEM TESZTELT** (`LOVABLE_BROWSER_AUTH_STATUS=external_unmanaged`).
A két brief-fájl nem volt elérhető; a chatben megadott megbízás alapján készült. Sales-kód nem változott (egyetlen kivétel: a közös `SalesFlowMap` opcionális `label` propot kapott, alapértéke változatlan).

## Felmérés (read-only)
- Útvonalak: `/today` (Marketing Ma: `marketing-home.tsx`), `/customers/$id` (marketingnél `MarketingWorkspace`), `/campaign-list` (`CampaignDraftPrecheck` + ütemezés/TESZT), `/emails`, `/emails/$threadId`, `/web-quote-requests`, `/calls`, `/help/marketing`, `/ai-assistant?agent=marketing`.
- Adatforrások (változatlan): `loadMarketingDaily` (Scarlet `crm_marketing_daily_priorities` ugyanezt olvassa), `readMarketingHomeCompanies`, `listCampaignDrafts`/`getCampaignDraft`, `campaign_delivery_*` RPC-k, `company_set_marketing_status`, `listQuoteRequests`, meglévő átadási mutáció.
- Kampány állapotai: `status` (draft/prechecked/archived), `prechecked_at`, `delivery_state` (scheduled/paused/stopped), `approved_at`; módosításkor a DB-trigger törli a jóváhagyást.
- Hiány a felmérés szerint: a Ma oldal „Kampányjóváhagyás” kártyája nem mutatott adatot; Scarlet marketing gyorskérdései Sales-leadeket (status=new) kérdeztek; a napi sorok mind az ügyféladatlap első fülére vittek; a Dokumentumok fül menüben volt elrejtve.

## Változások (csak felület, megjelenítési modell és egy olvasási mezőbővítés)
| Képernyő | Változás |
|---|---|
| Marketing Ma | „Most ezzel kezdj” kártya (első prioritás + ok + egy gomb); hétlépéses munkafolyamat-sáv (Új érdeklődés → Kampányok → Megkeresendő → Válaszra vár → Válasz érkezett → Átadható → Saleshez átadva) darabszámmal; gyorsműveletsor; „Mai prioritások” rögzített sorrenddel, cégenként egyszer, „Miért most?” oszlop, mobilon kártyalista, „Teljes lista” kapcsoló; Kampányok állapota (tervezet/ellenőrzött/ütemezett, következő lépés, közvetlen megnyitás); Átadás előkészítése (Összefoglaló fülre visz); friss szálak céglinkkel; „Eredmények röviden” magyar mondatokban; részletes listák összecsukva; hibánál Újrapróbálás. |
| Scarlet | Ma oldalon „Scarlet segít” kártya három gyorskérdéssel (csak ha Scarlet látható); `?quick=` csak előre definiált kérdést tölt elő, küldés csak gombnyomásra. Marketing gyorskérdések a közös `crm_marketing_daily_priorities` forrásra és pontos levélszál-olvasásra épülnek, átadást nem indítanak. |
| Ügyféladatlap (marketing) | `?tab=` mélylink (Levélszálak, Utánkövetések, Összefoglaló Salesnek, Kapcsolattartók, Dokumentumok…); összesítő csempék kattinthatók (Kapcsolattartók/Levélszálak/Sales-ügy/Dokumentumok); Dokumentumok fül mindig látható darabszámmal; Sales-ügy állapota magyarul. |
| Kampányok | Lépéssáv a mentett állapotból (aktuális lépés, kész lépések, „Állapot: … + következő teendő”, nem mentett módosítás jelzés); `?campaignId=` mélylink (nem elérhető tervezetnél hibaüzenet); „Kiküldés tiltott” helyett pontos „Ügyfélküldés nem aktív”; fejléc a 3 lépéssel. |
| Súgó | Marketing: új „Mai munka · Most ezzel kezdj” és „Scarlet gyorskérdések” lépés; kampánylépés kiegészítve. |

Új fájlok: `src/lib/marketing/marketing-day-flow.ts` (+ `.test.ts`).
Módosított: `src/components/today/marketing-home.tsx`, `src/components/marketing/marketing-workspace.tsx`, `src/components/marketing/campaign-draft-precheck.tsx`, `src/routes/_authenticated/campaign-list.tsx`, `src/routes/_authenticated/customers.$id.tsx`, `src/routes/_authenticated/ai-assistant.tsx`, `src/components/ai/chat-shared.tsx` (marketing gyorskérdések), `src/components/sales/sales-flow-ui.tsx` (opcionális címke), `src/lib/marketing/campaign-entry.ts` (+teszt), `src/lib/marketing/campaign-drafts.functions.ts` (listába `approved_at,delivery_state` olvasás, ugyanazzal a felhasználói RLS-sel), `src/lib/help-guide.ts`, `src/lib/marketing/AGENTS.md`.

Nem változott: adatbázis-séma, RLS, jogosultság, migráció, státuszgép, mentési/átadási/küldési/ütemezési út, AI-modell/eszközök/jóváhagyás, titkok, éles adat. Nem történt küldés, publikálás, telepítés, tömeges művelet.

## Tesztek
- Új: 17 marketing-folyamat teszt (prioritási sorrend, fül-célok, cégenkénti összevonás, közös visszahívás Budapest nap szerint, fókusz üres/részleges/betöltetlen, munkafolyamat-sáv és „—”, kampány-életút 6 állapota, „nem küldési engedély”, összesítő, eredménymondatok, Scarlet gyorskérdés allow-list és forrás, fül-validálás) + 1 kampány-mélylink teszt.
- Teljes: 913/913 unit (91 fájl) PASS; AI acceptance 21/21 PASS; `tsgo` PASS; build OK.
- Böngésző: /today, /campaign-list, /customers/:id?tab=emails, /ai-assistant?quick 1440 és 390 px — kijelentkezve /auth-ra irányít, 0 oldalhiba. **Bejelentkezett Marketing/Owner felület NEM TESZTELT.**

## Mi működik ténylegesen vs csak kód
- Igazolt: szabály- és sorrendlogika tesztekkel, típus- és fordítási helyesség, oldalbetöltés hibamentessége kijelentkezve.
- Csak kód (élőben nem próbált): minden új felületi elem valós adattal, mélylinkek, Scarlet előtöltés, kampány-lépéssáv, mobil kártyalista.
- A napi 2 órás cél nem mért, nem bizonyított.

## Fennmaradó hiányok / külön jóváhagyás
1. Tartalomtervezetek (poszt/hírlevél) és közösségi publikálási státusz: nincs adatmodell és integráció — nem szimulált. Jelenleg csak email-kampánytervezet létezik.
2. Ügyfélkampány automatikus küldése / külső ütemező: nincs bekapcsolva (külön kapu).
3. Válasz → automatikus lead: tiltott; az átadás a meglévő kézi úton marad.
4. Webes érdeklődés „feldolgozott” állapota: nincs tárolt mező; a Ma oldal 7 napos darabszámot mutat (TESZT nélkül).
5. Kampányeredmény (megnyitás/kattintás): nincs mérés; csak tárolt válaszarány.
6. Bejelentkezett végigpróba Marketing és Owner szerepkörrel.

## Visszaállítás
Csak kód: `git revert <commit>`; adat- vagy sémaváltozás nincs.

## Következő nagy csomag
Projektvezetői (PM) napi munkafelület és Sales→PM átadás utáni projektmunka (nem kezdődött el).
