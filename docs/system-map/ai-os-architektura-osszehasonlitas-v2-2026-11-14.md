# VIBA CRM – AI OS bővítési architektúra, 2. változat
## A Timothy AI-ajánlatkészítő specifikációval kiegészített műszaki összehasonlítás, kockázat- és költségelemzés

Dátum: 2026-11-14 · Irányadó követelmény: *VIBA_Timothy_AI_Ajanlatkeszito_Teljes_Fejlesztesi_Terv_2026-11-14.md* · Az 1. változat változatlan.
Állapot: **csak elemzés** – kód, adatbázis, RLS, jogosultság, integráció nem változott; fizetős hívás nem történt.

## 1. Összefoglaló

A specifikáció legszigorúbb feltételei – az eredeti Excel szerkezethű, képletkímélő árazása; az 50 MB-os rajzcsomagok; a rajzalapú szekrény-anyagjegyzék; a determinisztikus, visszaszámolható árazás – megerősítik az 1. változat irányát. **Javaslat: „A + D”.**

- **A) A meglévő AI OS marad a vezérlő.** A jogosultság, a P0-jóváhagyás, a napló, a memória és a CRM-/levelezési eszközök a saját szerverünkön futnak, felhasználói RLS-sel.
- **D) Elzárt, hálózat nélküli számolókörnyezet** végzi a nehéz munkát: munkafüzet-elemzést és -visszaírást, rajz- és PDF-darabolást, az árazómotor futtatását. Csak a jogosultan átadott fájlmásolatot kapja meg, CRM-, Gmail- és R2-kulcs nélkül.
- **A modell** (gpt-6-astra) értelmez, párosít, eltérést keres és szöveget fogalmaz. **Árat nem számol fejben**, a számokat a determinisztikus motor adja.
- **Elvetett irányok:** az Agents SDK külön szerverként párhuzamos AI-réteget hozna létre. A hosztolt agent-állapot és a Codex mint általános munkatárs kivinné a jóváhagyási és jogosultsági réteget a rendszerünkből.

## 2. Mai állapot – igazolt kiindulópont

| Terület | Mai állapot (forrás) | Rés a specifikációhoz |
|---|---|---|
| Munkamódok | `quotes/workflow.ts`: `received_budget`, `viba_offer` | `pricing_mode` (5 érték) és munkanem-sablon nincs |
| Kapott Excel | `quotes.$id.tsx`: feltöltés + kézi nettó összeg | Nincs szerkezettartó árazó/export |
| Saját ajánlat | `QuoteItemsPanel`, sablon, PDF, verzió, Gmail | m², rezsióra és VBF-számítás **nincs kész** |
| Dokumentumolvasás | `crm_read_document` + OCR (4 asszisztens) | Rajzértelmezés, nagyfájl és ZIP nincs |
| Méretkorlát | Feltöltés 50 MB (`r2-policy.ts`), tudástár-ingest és kiolvasás 5 MB (`ingest-model.ts`) | **Ellentmondás:** 5–50 MB közötti fájl tárolható, de AI nem olvassa |
| Dokumentum-RLS | `project_documents`/`company_documents` olvasás tág; 25 projekt nélküli fájl | P1 nélkül új AI nem kaphat szélesebb olvasást |
| Futtatás | Cloudflare Worker: nincs fájlrendszer, Python, alfolyamat; CPU-korlát | Excel/rajz nehéz munka csak külső konténerben |
| Jóváhagyás | `agent_run_steps` megváltoztathatatlan, atomi claim, idempotens UUID, readback | Változatlanul átvehető minden új írásra |

## 3. A négy változat a specifikáció kritikus feltételeire

| Feltétel | A) AI OS + Responses | B) Agents SDK | C) Hosztolt agent | D) Elzárt számolókörnyezet |
|---|---|---|---|---|
| Képletkímélő XLSX-visszaírás | Nem (Worker) | Csak saját szerverrel | Beépített kódfuttatóval igen, de állapot kint | **Igen** (openpyxl/LibreOffice-újraszámolás) |
| 50 MB rajzcsomag, ZIP | Átadás igen, feldolgozás nem | Igen | Részben, méretkorláttal | **Igen**, darabolással |
| Determinisztikus árazómotor | TS-ben részben | Igen | Modellfüggő | **Igen**, verziózott kód |
| Hosszú futás (perc+) | Háttérfeladattal | Igen | Igen | Igen |
| RLS és P0 megtartása | **Teljes** | Újraírandó | Gyenge | Nincs CRM-hozzáférés → kockázatmentes |
| Párhuzamos réteg tilalma | Megfelel | **Sérti** | Részben sérti | Megfelel (csak végrehajtó) |

## 4. A javasolt 10 Timothy-eszköz elhelyezése

| Eszköz | Hol fut | Mit olvas | Jóváhagyás | Ütem |
|---|---|---|---|---|
| `quote_create_estimate_job` | AI OS | quote + kapcsolt fájlok (RLS) | Nem (csak feladat) | P2 |
| `quote_list_package_files` | AI OS | csomagfájlok, feldolgozottság | Nem | P1–P2 |
| `quote_read_extracted_evidence` | AI OS | oldalszintű kiolvasás | Nem | P2/P4 |
| `quote_parse_budget` | **D** | eredeti XLSX másolata | Nem | P2 |
| `quote_search_price_sources` | AI OS | jóváhagyott ársablon, történeti árak (RLS) | Nem | P3 |
| `quote_generate_cabinet_bom` | Modell + **D** | rajzoldalak | Nem (javaslat) | P4 |
| `quote_check_scope_and_drawings` | Modell + AI OS | terv, Excel, levelezés (postafiók-hatókör) | Nem | P4 |
| `quote_calculate_estimate` | **D** | sorleképezés, árforrások | Nem (számítás) | P3 |
| `quote_propose_adjustment` | Modell → AI OS | chat-utasítás | **P0** a mentéshez | P3/P5 |
| `quote_preview_export` | **D** | számítási verzió | Nem | P5 |
| `quote_finalize_export` | D + AI OS | előnézet hash | **P0**, jogosult felhasználó | P5 |

Az olvasás és a számítás automatikus. Az ár mentése, az export elfogadása és az ügyfélnek küldés csak jóváhagyással történik; a küldés a meglévő `/api/gmail/send` útvonalon marad. Ez **10 + 1 = 11 eszköz**, mert az adatbizonyíték-olvasót külön soron jelöltem.

## 5. Asszisztensek képességmátrixa (javaslat, döntendő)

| Asszisztens | Webkutatás | Fájl + OCR | Számolókörnyezet | Árazó eszközök | CRM-írás | E-mail |
|---|---|---|---|---|---|---|
| George (orchestrator) | Igen | Igen (a felhasználó jogaival) | Csak elemzés | Nem, Timothyhez ad át | Nem (változatlan) | Olvasás hatókörrel |
| Timothy (Sales) | Igen | Igen | **Igen** | **Igen** (Owner/Sales) | Meglévő P0-akciók | Olvasás + P0-küldés (változatlan) |
| Scarlet (Marketing) | Igen | Igen, melléklet nélkül | Táblaelemzés | Nem | Nem | Saját scope, kampányszabályok |
| Boss (vezetői) | Igen | Igen | Elemzés | Csak olvasás (összesítő) | Nem | Nem |
| Michael (Ads, Owner-only) | Igen | Nem (változatlan) | Nem | Nem | Ads-szabályok szerint | Nem |
| PM (szerepkör, Boss/George-on át) | – | Saját projekt | Elemzés | Projektvezetői összesítő olvasása | Nem | Nem |

Változatlan marad: a nevek, a szerepkörök, a `agent_role_access`, a melléklet-tiltás Marketing/PM-nél és a Michael Owner-only szabály. A ársablont csak Ramon vagy az Owner módosíthatja, Timothy nem.

## 6. Referencia-esetek a csatolt fájlokból

- **Óradíjas árkalkulátor (xlsx):** Elektromos 326 sor / 299 képlet, Árkalkulátor 305 sor / 2 392 képlet, Összesítő 20 képlet, Beállítások 6 500 Ft/óra és feltételezett 5 800 Ft-os eredeti alapdíj. **Átvételi teszt:** árazás után a képletszám és a lapszerkezet változatlan, csak engedélyezett árcellák módosulnak; a visszaszámolt normaóra „becslés” jelölést kap.
- **Automatikus árazó (HTML):** 299 referenciatétel; tokenes/n-gramos pontozással párosít, XLSX-et ír saját ZIP-csomagolóval. **Tanulság:** a párosító determinisztikus kódként fusson a D környezetben, a modell csak a gyenge egyezéseket értelmezze. Saját ZIP-író helyett bevizsgált könyvtár kell, mert a formázás és a képletek megőrzése nem garantált.

## 7. Költségelemzés (becslés)

A gpt-6-astra hivatalos egységárát nem tudtam hiteles forrásból ellenőrizni; a számítás **paraméteres** (P_be, P_ki Ft/1M token). Mért alap: az 5 fájlos OCR-próba összesen ~15 400 bemeneti és ~6 600 kimeneti token volt (≈ 3 100 / 1 300 fájlonként).

**Egy tipikus kapott költségvetéses ajánlat** (1 Excel, kb. 300 sor; 40 rajzoldal; 15 oldal leírás; 10 levél):

| Lépés | Becsült token (be / ki) | Megjegyzés |
|---|---|---|
| Rajz- és leírás-OCR (55 oldal) | 170k / 70k | Hash-cache esetén újraszámoláskor 0 |
| Sorértelmezés, párosítás (300 sor, kötegelve) | 150k / 40k | A gyenge egyezések aránya határozza meg |
| Szekrény-BOM (2–3 szekrény) | 80k / 30k | Rajzminőségtől függ |
| Eltérés- és lehatárolás-keresés | 120k / 25k | |
| Chat-módosítások (5 kör) | 150k / 20k | |
| **Összesen / ajánlat** | **≈ 670k / 185k** | + számolókörnyezet: néhány perc konténeridő |

**Havi sávok (22 munkanap):**

| Sáv | Árazott ajánlat/hó | Általános chat (5 asszisztens) | Havi token (be / ki) |
|---|---|---|---|
| Alacsony | 8 | 40 kérés/nap | ≈ 23M / 4,3M |
| Várható | 25 | 120 kérés/nap | ≈ 96M / 18M |
| Magas | 60 | 300 kérés/nap | ≈ 340M / 64M |

**Havi költség ≈ M_be·P_be + M_ki·P_ki + konténeridő + webkeresési díj + tárhely.** A konténer- és keresési díj a várható sávban jellemzően a tokenköltség 10–25%-a (becslés). Költségvédelem: ajánlatonkénti plafon (`cost_limit` a specifikáció `estimate_jobs` táblájában), felhasználónkénti napi keret, tartalom-hash szerinti újrafelhasználás, havi riasztás.

## 8. Kockázatok (kiegészítve)

| Kockázat | Mérséklés |
|---|---|
| Belső önköltség vagy fedezet az ügyfél-Excel rejtett lapján, megjegyzésében, metaadatában | Az exportot egy tiszta másolatra írjuk; automatikus ellenőrzés a rejtett lapokra, nevesített tartományokra, megjegyzésekre és dokumentum-tulajdonságokra; találat esetén az export blokkolva |
| Makrós, `.xls`, külső hivatkozású vagy sérült fájl | Makró soha nem fut; ilyen fájl csak figyelmeztetéssel és emberi jóváhagyással konvertálható, különben elutasítva |
| Oszlop csendes félreértelmezése | Bizonytalan oszlop esetén megállás és kérdés; leképezés-diff az export előtt |
| Beépített utasítás rajzban, levélben, weboldalon | A tartalom adat, nem utasítás; ugyanabban a lépésben nincs írás; injection-tesztkészlet |
| „Bizonyítottnak” feltüntetett normaóra | Becslés-jelölés kötelező; a forrás nélküli árat a véglegesítési kapu blokkolja |
| Kitalált egyenértékű szekrénykészülék | Ismeretlen tétel → ellenőrzési jelzés; bizonyítatlan teljes szekrényár nem készül |
| Tág dokumentum-RLS | Előbb a P1 ütem; addig az új eszközök csak a quote-hoz kapcsolt fájlokat olvassák |
| Kettős végrehajtás, félresiker | Meglévő idempotens claim és readback |
| Költségelszabadulás nagy csomagnál | Plafon, darabolás, cache |
| Szolgáltatói függés | Egy adapter (`providers.server.ts`), a motor a saját kódunk |

## 9. Ellentmondások – döntési pontok

1. **5 MB és 50 MB:** a feltöltés 50 MB-ig enged, a tudástár és a kiolvasás 5 MB-ig. P4-hez darabolásos, nagyfájlos feldolgozás kell; addig a felület jelezze, hogy a fájlt az AI nem olvasta.
2. **Dokumentum-RLS:** a specifikáció szerepkörös hozzáférést vár, a mai olvasás tágabb. P1 sémamódosítás, külön engedéllyel.
3. **Számolókörnyezet helye:** az OpenAI-hosztolt konténernél az ügyfélfájl az OpenAI-hoz kerül, a saját sandbox viszont üzemeltetési teher.
4. **Saját ajánlat m²/VBF:** ma nincs kész, P6 előtt csak a szövegsablon létezik.
5. **Ársablon-gazda:** a specifikáció szerint Ramon/Owner kezeli; jóváhagyási szerepkört kell rögzíteni.

## 10. Bevezetési sorrend (ütemenként külön tulajdonosi kapuval)

| Ütem | AI-architektúra feladat | Kapu |
|---|---|---|
| P0 | Ez az elemzés, a támogatási mátrix (Excel-típusok), költségplafon-döntés | Jóváhagyott irány |
| P1 | Dokumentum-RLS, csomagkapcsolás; az AI eszközei csak ez után bővülnek | Szerepkörös negatív tesztek |
| P2 | D környezet: `quote_parse_budget`, szerkezethű export, **olvasó módban** | 10 valós költségvetés struktúra-diffje |
| P3 | Árforrások, determinisztikus motor, `quote_propose_adjustment` P0-val | 100 soros visszaszámolható minta |
| P4 | Nagyfájlos OCR, rajzolvasás, szekrény-BOM, eltéréskereső | 5 szakember által ellenőrzött BOM |
| P5 | Egygombos folyamat, előnézet, `quote_finalize_export` P0-val | Végigpróba újrafeltöltés nélkül |
| P6 | Saját ajánlat profiljai a meglévő ajánlatadóban | Meglévő kiadás és utánkövetés működik |
| P7 | Pilot, költség- és pontosságmérés, fokozatos szerepkörös engedélyezés | 3 hitelesített valós ügylet |

Webkutatás minden asszisztensnek P1-gyel párhuzamosan is bevezethető, mert csak olvas. Visszaállítás: minden képesség eszközdomainként kapcsolható. Regresszió: 1118 teszt + 21 AI acceptance megtartása.

## 11. Döntésre vár
1. Elfogadod-e az „A + D” irányt?
2. A számolókörnyezet OpenAI-hosztolt vagy saját legyen?
3. Ajánlatonkénti és havi AI-költségplafon.
4. Az 5. fejezet asszisztens-mátrixa.
5. Engedély a P1 ütem (dokumentum-jogosultság) részletes tervéhez.

## NEM TESZTELT / nem igazolt
gpt-6-astra-, webkeresés- és konténerár; valós ajánlatonkénti költség; bármely itt javasolt eszköz működése – egyik sincs megvalósítva. A tokenbecslések a mért OCR-próbából és feltételezett terhelésből származnak.
