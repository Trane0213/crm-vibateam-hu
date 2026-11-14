# VIBA CRM – AI OS bővítési architektúra: műszaki összehasonlítás, kockázat- és költségelemzés

Dátum: 2026-11-14 · Állapot: döntés-előkészítő, **csak elemzés** – kód, adatbázis, RLS, jogosultság, integráció nem változott, fizetős hívás nem történt.

## 1. Összefoglaló ajánlás

**Javaslat: „A + D” hibrid.** A meglévő AI OS marad a vezérlő (jogosultság, P0-jóváhagyás, audit, memória a saját szerverünkön), a Responses API-t bővítjük beépített eszközökkel (webkeresés, fájlkezelés), és **izolált, hálózat nélküli kódfuttató környezetet** (OpenAI Code Interpreter konténer vagy külön sandbox) adunk a nehéz Excel/PDF/rajz munkához. Az Agents SDK-t csak mintaként (handoff, guardrail, trace) érdemes átvenni, futtatókörnyezetnek nem. Hosztolt agent-állapotot (C) és Codexet általános munkatársként (D teljes formája) nem javaslok, mert a P0-jóváhagyás és az RLS a mi rendszerünkből kikerülne.

| Változat | Jogosultság/RLS megtartása | P0-jóváhagyás | Adatkivitel | Workers-kompatibilitás | Fejlesztési igény | Értékelés |
|---|---|---|---|---|---|---|
| A) AI OS + Responses API beépített eszközök | Teljes (eszközeink felhasználói tokennel futnak) | Változatlan | Csak a kért kontextus | Igen (HTTP-hívások) | Kicsi–közepes | **Ajánlott alap** |
| B) Agents SDK külön szolgáltatásban | Átvihető, de újra kell építeni | Újra kell implementálni | Mint A | Nem natív, külön Node/Python szerver | Nagy (párhuzamos futtató!) | Nem ajánlott – párhuzamos AI-réteg |
| C) Hosztolt agent-futtatás (állapot az OpenAI-nál) | Gyengül (eszközöket távoli MCP-n kellene kitenni) | Nehezen tartható | Szálak, fájlok tartósan a szolgáltatónál | Igen | Közepes | Nem ajánlott |
| D) Sandbox/Codex kódfuttatás | Nincs CRM-hozzáférése, csak kapott fájl | Kimenet emberi jóváhagyással | Csak a feldolgozandó fájl | Konténer külső, Workers csak hívja | Közepes | **Kiegészítőként ajánlott** |

## 2. Mai állapot (a forráskódból igazolva)

- Egy futtató: `src/lib/ai-os/runtime.server.ts`, modell egy helyen: `model-config.ts` → `openai / gpt-6-astra / responses / reasoning high`.
- `providers.server.ts`: `callLlm` (Responses API, saját függvény-eszközök) és `callResponsesMultimodal` (kép/PDF OCR, 1. szakasz).
- Eszközök domainenként (`agents.ts`): George 11, Scarlet 9, Timothy 19 (köztük P0-írások: követés, következő lépés, kontakt, felelős, pipeline-státusz, e-mail-küldés), Boss 10, Michael Google Ads (Owner-only).
- Jóváhagyás: `agent_run_steps` megváltoztathatatlan életciklus, atomi claim szerveroldali RPC-n, idempotens akció-UUID, igazolt readback (`approval.server.ts`, `*-action.ts`).
- Dokumentumok: `crm_list_documents` / `crm_read_document` négy asszisztensnél, R2 szerveroldali aláírás, OCR, chatfeltöltés szerepköri mappába.
- E-mail: cache-elt olvasás `crm_mailboxes` hatókörrel, küldés kizárólag `/api/gmail/send` útvonalon.
- **Hiányzik:** webkeresés asszisztensi eszközként (csak `research.functions.ts` célfeladat), kódfuttatás, Excel írás/visszaadás képletkímélően, hosszú (perc+) háttérmunka, többfájlos/ZIP csomag-feldolgozás.
- Futtatási korlát: Cloudflare Worker – nincs fájlrendszer, alfolyamat, Python; CPU-idő korlátos. Ezért kódfuttatás csak külső konténerben lehetséges.

## 3. Képességek – hogyan valósítható meg A+D-ben

| Képesség | Megoldás | Megmaradó szabály |
|---|---|---|
| Fájlfeldolgozás (PDF, kép, Excel, Word, ZIP) | Meglévő `crm_read_document` + OCR; nagy/strukturált fájl → kódfuttató | Csak RLS-sel látható fájl; AI-kiolvasott = nem ellenőrzött forrás |
| Kódfuttatás | Izolált konténer, hálózat nélkül, csak a jogosultan átadott fájlok másolata; kimenet új fájl a dokumentumtárba jóváhagyással | Nincs CRM-token, nincs Gmail-token a konténerben |
| Webkutatás | Responses API web search eszköz, forráslinkkel | Weboldal tartalma adat, nem utasítás; nem írhat CRM-be |
| CRM-olvasás | Meglévő eszközök, felhasználói kliens, RLS | Változatlan |
| CRM-írás / e-mail-küldés | Meglévő P0-akciók | Változatlan: jóváhagyás, idempotencia, readback |
| Több lépéses munka | AI OS futás lépésekkel; hosszabb munka háttérfeladatként, előrehaladás-kijelzéssel (`progress.ts`) | Írási lépés előtt mindig P0-megállás |

**Javasolt szerepköri mátrix (döntendő):**

| Képesség | Owner | Sales | Marketing | PM |
|---|---|---|---|---|
| Kódfuttatás fájlon | Igen | Igen (ajánlat/Excel) | Igen (kampánytábla) | Igen (projektfájl) |
| Webkutatás | Igen | Igen | Igen | Igen |
| E-mail olvasás | Igen | Saját fiók | Saját scope | Nem (mai szabály) |
| E-mail küldés | P0 | P0 (Timothy) | Kampányszabályok szerint | Nem |
| Levélmelléklet | Igen | Igen | Nem | Nem |
| Google Ads (Michael) | Igen | Nem | Nem | Nem |

## 4. Referencia-esettanulmány: a csatolt árazó fájlok

**Excel – `VIBA_TEAM_Oradijas_Arkalkulator_6500Ft.xlsx`:** 4 munkalap. *Elektromos* (326 sor, 299 képlet: eredeti árazatlan/alvállalkozói költségvetés), *Beállítások* (óradíj 6 500 Ft, feltételezett eredeti 5 800 Ft, 279/290 azonosított tétel), *Árkalkulátor* (305 sor, 2 392 képlet: forrássor, normaóra, árazási mód, eredeti vs. új egységár, sárga kézi / kék eredeti / türkiz új), *Összesítő* (vezetői összesítés, `'Beállítások'!B5` hivatkozás).

**HTML – `VIBA_TEAM_Automatikus_Arakozo.html`:** böngészős árazó: oszlopfelismerés (`guessColumns`), szöveg-normalizálás és hasonlósági pontozás (`techTokens`, `tokScore`, `gramScore`, `findMatch`), ár kerekítés, XLSX olvasás/írás saját ZIP/CRC32 csomagolóval (`readWorkbook`, `setNumericCell`, `packZip`), tételenkénti kézi ellenőrzés.

**Tanulság az architektúrához:**
- A képletkímélő, eredeti szerkezetű visszaírás (Timothy árazó 2. szabály) **Workerben megbízhatatlan**, konténerben (openpyxl) jól megoldható → D szükséges.
- A HTML pontozó logikája determinisztikus; ezt **kódként**, nem modell-tippként kell futtatni, a modell csak a bizonytalan párosításokat értelmezi.
- A „becsült normaóra ≠ bizonyított” szabály (Excel 4. sor) a kimeneti jelölésben kötelező; a belső kalkuláció (önköltség, óradíj) külön fájl, az ügyfélpéldány nem tartalmazhatja.
- Átvételi teszt: ugyanerre a fájlra az árazott kimenet képletszáma (299 / 2 392 / 20) változatlan, csak az egységár-cellák változnak.

## 5. Költségelemzés (becslés)

A gpt-6-astra hivatalos egységárát ebben a körben nem tudtam hiteles forrásból ellenőrizni, ezért a számítás **paraméteres**: P_be = Ft / 1M bemeneti token, P_ki = Ft / 1M kimeneti token. Igazolt adat az 5 fájlos OCR-próbából: ~15 400 be / ~6 600 ki token összesen (≈3 100 / 1 300 fájlonként).

Feltételezett terhelés (4–6 felhasználó):

| Sáv | Chat-kérés/nap | Átlag token/kérés (be/ki, reasoning high) | OCR fájl/nap | Kódfuttató munkamenet/nap | Webkeresés/nap |
|---|---|---|---|---|---|
| Alacsony | 40 | 20k / 3k | 5 | 2 | 10 |
| Várható | 120 | 30k / 5k | 20 | 8 | 40 |
| Magas | 300 | 45k / 8k | 60 | 25 | 120 |

Havi tokenmennyiség (22 munkanap): alacsony ≈ 18M be / 2,8M ki; várható ≈ 80M be / 13,5M ki; magas ≈ 300M be / 53M ki. **Havi költség ≈ M_be·P_be + M_ki·P_ki + konténer- és keresési díj.** A konténer- és webkeresési díj hívásonkénti tétel; a várható sávban jellemzően a tokenköltség 10–25%-a (becslés).

Költségkockázat-kezelés: felhasználónkénti napi keret, kódfuttatás csak kérésre, ismétlődő fájlnál hash-alapú gyorsítótár (meglévő 15 perces OCR-cache tartósítása), havi riasztás. B változatnál +1 külön szerver üzemeltetése és karbantartása.

## 6. Kockázatelemzés

| Kockázat | Hol | Mérséklés |
|---|---|---|
| Prompt-injection fájlból/webből | Minden változat | Tartalom = adat; írás csak P0; webes eszköz nem hívhat írást ugyanabban a lépésben |
| Jogosultság-kiterjesztés a kódfuttatóban | D | Nincs token/hálózat; csak átadott fájlmásolat; kimenet jóváhagyással kerül a tárba |
| Kettős végrehajtás | B, C | A-ban a meglévő idempotens claim marad |
| Adatkiáramlás (önköltség, árrés ügyfélhez) | Árazás | Külön belső és ügyfél-kimenet, automatikus ellenőrzés szivárgásra |
| Ügyféladat tartós tárolása szolgáltatónál | C | Állapot nálunk; tárolás kikapcsolása a hívásoknál |
| Költségelszabadulás | Mind | Keretek, napi limit, riasztás |
| Szolgáltatói függés / API-változás | B, C erős | A-ban egy adapter (`providers.server.ts`) |
| Worker CPU-idő / hosszú futás | A | Nehéz munka konténerbe, háttérfeladat előrehaladással |
| Párhuzamos AI-réteg kialakulása | B | Tiltja a projektszabály – ezért elvetve |

## 7. Javasolt bevezetési sorrend (mindegyik külön tulajdonosi engedéllyel)

1. **Webkutatás eszköz** minden asszisztensnek, csak olvasás, forráslinkkel. Teszt: injection-esetek, nincs írás.
2. **Kódfuttató – csak olvasó elemzés** (Excel/PDF), TESZT-fájlokon, a csatolt árkalkulátorral mint átvételi esettel.
3. **Kimeneti fájlok** (árazott Excel, belső kalkuláció) mentése a dokumentumtárba P0-jóváhagyással; képletszám-megőrzés és szivárgásteszt.
4. **Többfájlos/ZIP csomag** feldolgozása (Timothy árazó P1-gyel összehangolva).
5. **Háttérfeladat hosszú munkára** előrehaladás-kijelzéssel, megszakíthatósággal.
6. Kiterjesztés szerepkörönként a mátrix jóváhagyott változata szerint.

Visszaállítás: minden képesség eszközdomainként kapcsolható (`tool_domains`), kikapcsolásával a mai működés visszaáll. Regresszió: 1118 teszt + 21 AI acceptance megtartása.

## 8. Nyitott döntések

1. Elfogadható-e a „A + D” irány?
2. Szerepköri mátrix (3. fejezet) jóváhagyása, különösen PM e-mail-olvasás és Marketing kódfuttatás.
3. Havi AI-költségkeret és felhasználónkénti napi limit.
4. Kódfuttató helye: OpenAI-hosztolt konténer vagy saját sandbox (adatkezelési döntés).
5. Fizetős próba engedélye az 1–2. lépéshez TESZT-fájlokon.

## NEM TESZTELT / nem igazolt
- gpt-6-astra, webkeresés és kódfuttató tényleges egységára; valós havi költség.
- Bármely itt javasolt képesség működése – egyik sincs megvalósítva.
