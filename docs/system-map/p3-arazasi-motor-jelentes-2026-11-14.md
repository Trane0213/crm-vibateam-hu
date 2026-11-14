# P3 – Árforrások, kalkulációs profilok, determinisztikus árazási motor (2026-11-14)

## Mi készült el (kód + izolált tesztek)
- **Motor** (`src/lib/pricing/`, mellékhatás nélküli): fillér/bázispont aritmetika; `önköltség → járulék → tartalék → célfedezet (/(1−f)) → kerekítés`, eladási referenciaárnál csak tartalék (fedezet nem épül rá); önköltség-alapú ár célfedezet nélkül *blokkolt*. Minden sorhoz forrás (fajta, fájl/sor, dátum), egyezési kategória és lépésenkénti nyomvonal.
- **Árforrás-rangsor és minősítés**: projekt-beszállítói (igazolt) > VIBA ár-/normasablon > korábbi VIBA-ajánlat / szerződés / tényleges költség > piaci > becslés. Automatikus ár csak pontos/erős egyezésnél, azonos ME-vel, műszaki- és számos szó ütközés nélkül, ismert és friss dátummal; piaci ár és becslés soha. Azonos rangú, eltérő árú egyezés → ellenőrizendő; rövid altételek („3x4 mm2”) a megelőző leíró tétel alapján válnak szét.
- **Profilok**: alvállalkozói munkadíj (anyag nélkül) és teljes kivitelezés; óradíj, korábbi díj kezelése (változatlan / 5 800 → 6 500 Ft skálázás *becslésként*), tartalék, célfedezet, járulékok, kerekítés, árfrissesség. Alapértékek tervezetek, nem tulajdonosi paraméterek.
- **Kapott költségvetés felismerése**: egy- és kétsoros fejléc, többrészes megnevezés, fejléc nélküli ME/megnevezés-oszlop, fejléchez képest felcserélt mennyiség/ME, „M | E” fejléc, fejezet/részösszeg/szöveg/0 mennyiség, lehetséges kizárás („opcionális”, „nem vállalt”…), bizonytalan oszlop jelölése (nincs csendes írás).
- **Valódi újraszámolás**: saját képletkiértékelő (lapközi hivatkozás, SUM/SUBTOTAL/ROUND*/IF/SUMIF/SUMPRODUCT stb.; ismeretlen függvény → nem ellenőrizhető, kiadás tiltva); soronkénti és lapszintű egyeztetés a munkafüzet saját képleteivel.
- **Szerkezettartó TERVEZET XLSX**: csak a felismert árcellák és a változott képleteredmények; minden más ZIP-rész bájtra azonos; `fullCalcOnLoad`; belső költség/forrás nem kerül a fájlba; visszaolvasásos ellenőrzés (minden nem kijelölt cella változatlan, mentett eredmény = újraszámolt). .xls, makró, nem képletes összeg, eltérés → nincs kiadás.
- **Ramon ársablon**: üres sablon letöltése + import tételes hibalistával (a fájlbeli „Jóváhagyta” nem CRM-jóváhagyás).
- **Korábbi VIBA-referencia**: a tulajdonos által átadott 299 tételes munkadíj-tábla (KV 11026-12210 V2, kiküldve 2026-10-29, elfogadás nem igazolt), csak szerveroldalon.
- **Felület**: ajánlat → „2. Összeg és megjegyzések” (kapott költségvetésnél) → „Költségvetés árazása” panel, csak Tulajdonos/Sales. Számítás, szűrhető tétellista nyomvonallal, TERVEZET-letöltés, belső ellenőrző CSV, „Nettó átvétele” (csak a mezőt tölti, mentés a meglévő gombbal).
- **Timothy**: `crm_price_received_budget` (csak számol; tételes módosítások: tartalék, egységár, sorösszeg, anyag kivétele, kizárás/bevonás → eredeti→új diff, változatlan sorok száma). Utasítás: árat fejben nem számol.

## Ellenőrzés (valós eredmények)
- 1242/1242 CRM-teszt (ebből 82 új P3), 21/21 AI acceptance, típusellenőrzés OK, build OK.
- 16 valós VIBA-levelezésből/ajánlatból származó Excel csak olvasva (ideiglenes mappában, repóba nem került): 12-ben tételfejléc felismerve, 4 nem költségvetés (indokolt kihagyás). A Széchenyi 3 939 képletéből 0 eltérés az Excel mentett eredményeihez.
- KV 11026 árazatlanná tett másolata, munkadíjas mód: 275 sor árazva, **mind a 275 egyezik az eredeti VIBA-árral**, 19 ellenőrizendő (többértelmű/ár nélküli), kiadás ellenőrzött; LibreOffice független újraszámolása: 0 eltérés.
- Széchenyi (9 lap, ROUND-képletek, Főösszesítő) TESZT-árakkal: munkadíjas módban anyag 0, anyagos módban külön anyag + azonos munkadíj; kimenet ellenőrzött, LibreOffice: 3 926 képletcella, 0 eltérés.
- Valós hibát talált: egy megrendelői .xls-ben az összegképletek más sor mennyiségével számolnak (pl. H16 = C9*F16) → eltérésként jelezve, kiadás tiltva.
- Izolált felületi próba (szimulált szerver, valódi motor TESZT-eredménye): Sales/Owner asztali és Sales mobil PASS, letöltés és nettó-átvétel működik, írás 0; PM-nél a panel nem jelenik meg.
- 100 soros, kézzel visszaszámolható minta (KV, óradíjra skálázott becslés + 5% tartalék, 10 Ft kerekítés): Files `viba-p3-arazas-ellenorzesi-minta-100-sor.csv`.

## NEM TESZTELT / valódi integrációs hiányok
- Bejelentkezett éles végigpróba (external_unmanaged Supabase), valódi R2-letöltés a publikált környezetben, Worker CPU-idő nagy munkafüzetnél.
- Nincs tartós tárolás: számítási verzió, jóváhagyott ártörzs, chat-módosítás jóváhagyása, `pricing_mode` mező — adatmodell + migráció kell.
- Anyagár-törzs nincs; teljes kivitelezésnél anyag csak feltöltött sablonból árazható. A P2 feldolgozó (nem telepítve) kimenetét a P3 nem használja: a munkafüzetet közvetlenül, 20 MB-ig olvassa.
- Szürke formázásból kizárás nem állapítható meg (szándékosan); .xls → .xlsx konverzió nincs.

## Tulajdonosi döntések a 10:15-ös összefoglalóhoz
1. Tartós árazási adatmodell (számítási verziók, Ramon-ártörzs verzióval/jóváhagyással, módosítási napló, `pricing_mode`) migrációjának engedélye.
2. Korábbi VIBA-díj alapértelmezése: változatlan (jelenlegi) vagy 6 500 Ft-ra skálázott (5 800 Ft feltételezett alap, nem igazolt).
3. Alapértelmezett tartalék, célfedezet, kerekítési lépcső, árfrissességi korlát (most 365 nap), járulékok.
4. A KV 11026 kiküldött (nem igazoltan elfogadott) díjai maradjanak-e automatikus 3. rangú forrás más projekteknél.
5. Nem képletes összegoszlopú fájlnál az összeg értékként írható-e; .xls biztonságos konverziója engedélyezett-e.
6. Az ellenőrzött TERVEZET mentése automatikusan „Árazott Excel” dokumentumként, vagy maradjon kézi feltöltés.
7. Anyagár-források (beszállítói árlisták, Ramon-sablon kitöltése): felelős és határidő.

## Következő: P4
OCR/nagyfájlos tervolvasás a telepített feldolgozóval; tervjel/revízió azonosítás; elosztó kapcsolási rajzból BOM; BOM-árazás a P3 motorral (anyag önköltség + gyártás/huzalozás normaórával, helyszíni bekötés külön sor); terv–Excel–e-mail eltéréslista; hiányzó rajznál nincs bizonyítatlan teljes szekrényár.
