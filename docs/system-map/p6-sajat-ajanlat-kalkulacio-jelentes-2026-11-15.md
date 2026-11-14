# P6 — Saját VIBA-ajánlat kalkulációs profiljai — jelentés, 2026-11-15

Alap: P5 `8a078f1`. Specifikáció: VIBA_Timothy_AI_Ajanlatkeszito_Teljes_Fejlesztesi_Terv_2026-11-14 (1., 9., 14. fejezet, P6).
Nem történt: adatbázis-/RLS-migráció, éles adatírás, ügyfélküldés, publikálás, Cloudflare-aktiválás, fizetős AI-hívás, pénzügyi/jogi döntés.

## Mi készült el (kód)
| Elem | Hely | Megjegyzés |
|---|---|---|
| Kalkulációs motor (tiszta) | `src/lib/viba-offer/calc-model.ts` | családi ház m², rezsióradíj, egyedi/VBF; fillér/bázispont (P3 `money.ts`); anyag és munkadíj külön komponens; teljes kivitelezői / alvállalkozói (csak munkadíj) mód; soronkénti számítási nyomvonal; stabil számítási azonosító |
| VBF-hibapont-kinyerés | `vbf-extract.ts` | számozott/felsorolt sorok + szakmai kulcsszavak, sorszám-bizonyíték, szabványhivatkozás, kulcsszó alapú sürgősségi javaslat (sürgős / ütemezhető / besorolandó) — nem modell-találgatás |
| Tételterv és lehatárolás | `item-plan.ts` | kalkuláció → meglévő `quote_items` (munkarész, megnevezés, mennyiség, egység, egységár); azonos tétel kimarad, eltérő tartalmú azonos nevű tétel ütközés (nincs felülírás/törlés); lehatárolás a meglévő „Műszaki lehatárolás” / „Kizárások” mezőkbe (a PDF ezeket nyomtatja), belső kifejezés-szűrővel (P5 `internalLeaks`) |
| Séma, export | `calc-schema.ts`, `calc-view.ts` | szigorú bemeneti séma (Timothy + panel közös), `VIBA-KALK-1` javaslatkód, belső CSV |
| Ajánlat panel | `src/components/viba-offer/viba-offer-calc-panel.tsx`, ajánlat 2. lépés teljes szélességben | csak Tulajdonos/Sales, csak saját VIBA-ajánlatnál; profilválasztás, díjak forrással, eredmény, tudomásulvételek, „Tételek hozzáadása az ajánlathoz”, „Lehatárolás átvétele”, „Belső számítás (CSV)”, „Timothy-javaslat betöltése” |
| Timothy | `crm_viba_offer_calculate`, `crm_vbf_defects_extract` (`viba-offer-tools.server.ts`) | csak számol/olvas; Owner/Sales; csak látható és `viba_offer` ajánlaton; visszaadja a betölthető javaslatkódot; tételt nem ír |

Változatlan: ajánlatszám/verzió/alternatíva (meglévő RPC-k), sablonfeltételek, A4/PDF, dokumentumok, `/api/gmail/send` kiküldés, utánkövetés, szerződés-előkészítés. A tételek a meglévő `useUpsert("quote_items")` úton íródnak (RLS `can_access_quote`, meglévő aktivitásnapló, DB-trigger számolja az összeget).

## Számítási szabályok (mind teszttel)
- **Nincs kitalált díj:** az üres profilban minden díj, felár, norma és csomagtartalom üres; hiányzó díj = „hiányzó ár”, a sor nem kerül az ajánlatba, a végösszeg „nem teljes” jelölést kap.
- **Forrás kötelező:** minden díjhoz forrás (saját megadás / korábbi VIBA-ajánlat / nem igazolt referencia) és megjegyzés; megjegyzés nélkül blokkolt. Nem igazolt referencia (pl. a 6 500 Ft-os minta) csak tételes tudomásulvétellel kerülhet be; a motor nem tölti elő.
- **Eladási ár vs. önköltség:** eladási árra semmi nem kerül; önköltségre tartalék (külön lépés), majd KIFEJEZETT árrés vagy fedezet. Árrés = haszon/önköltség, fedezet = haszon/eladási ár; mindkettő kiírva. Példa: 1000 Ft önköltség, 25% árrés → 1250 Ft (fedezet 20%); 25% fedezet → 1333 Ft (egész Ft-ra kerekítés után valós fedezet 24,98%, árrés 33,3%). Önköltség árrés/fedezet nélkül blokkolt.
- **Mennyiség:** felmért / becsült / ismeretlen. Ismeretlen nem árazható; becsült árazva, az ügyfél tételnevében „(becsült mennyiség)”, lehatárolásban feltétel. 0 mennyiség nem kerül az ajánlatba. Legfeljebb 2 tizedes (egész Ft × mennyiség fillérre pontos, a DB-összeggel egyezik).
- **Családi ház m²:** csomagnév + változat kötelező; 6 tartalmi pont (kiállások, elosztó, kábelezés, szerelvények, gyengeáram, mérőhely/szolgáltatói ügyintézés) mindegyikét el kell dönteni; a m²-ár csak kitöltött feltételekkel használható; részletes tervnél figyelmeztetés a tételes ellenőrzésre; többlettételek külön.
- **Rezsióradíj:** szerepkör × létszám × óra; munkanap/éjszaka/hétvége külön sor, a felárat meg kell adni (hiány = hiányzó ár); sürgősségi felár bekapcsolva mérték nélkül blokkoló; minimális kiszállási időkeret kiegészítő sor; kiszállás alkalom/km; anyag csak ha a szerződés engedi.
- **Egyedi/VBF:** forgatókönyv előzetes / bejárás utáni / tételes. Előzetesnél minden mennyiség becsült és a lehatárolás kimondja, hogy a végleges megoldás bejárás után véglegesíthető; bejárás utáni/tételes bejárás (és rögzített bejárási adat) nélkül blokkolt; tételesnél minden hibaponthoz felmért tétel kell. Sürgős és ütemezhető javítások külön munkarészben, a tételnév a jegyzőkönyvi pontra hivatkozik; felmérés/kiszállás és javítás utáni mérés/dokumentálás külön sor; áramszünet-kérdés.

## Valós minták (csak olvasva)
- **Sopron út 66., VBF** (Gmail, 2026-10-28, közös képviselet): a kérés pontjai — tételes tartalom a jegyzőkönyvi hibákra hivatkozva; sürgős és ütemezhető külön; anyag- és munkadíj; nettó/bruttó; felmérés és kiszállás díja; kezdés és időtartam; áramszünet; javítás utáni mérés és dokumentálás tartalma és díja; garancia, érvényesség. A VIBA-válasz bejárást kért, és tételes ajánlatot ígért külön bontva. A VBF-profil pontosan ezeket a sorokat/kérdéseket kezeli (garancia, érvényesség: meglévő sablonfeltételek). A jegyzőkönyv PDF-et nem nyitottam meg.
- **Családi ház** (Gmail, 2026-11-10): 1×20 A → 1×32 A mérőhely-bővítés és ügyintézés → külön „Mérőhely, hálózati bővítés, szolgáltatói ügyintézés” tartalmi pont.
- **Rezsióradíj:** a szerződéses levelezésben a tervhibák, állásidők, utólagos módosítások „külön rezsióradíjas elszámolása” szerepel — a profil ezt a többletmunka-elszámolást is lefedi.
- **Korábbi saját ajánlatok a CRM-ben:** 6 típus nélküli/saját sablonos ajánlat, összesen 3 tétel — ebből VIBA-tarifa nem vezethető le. Ügyféladat nem változott.

## Ellenőrzés
| Próba | Eredmény | Jelleg |
|---|---|---|
| Új tesztek | 51/51 (motor 26, VBF 6, tételterv 10, Timothy 9) | izolált |
| Teljes CRM | 124 fájl, 1370/1370 (1319 → 1370) | izolált |
| AI acceptance | 5 agent, 21/21 | izolált |
| Típusellenőrzés, build | rendben | — |
| Jogosultsági negatívok | Timothy: Marketing/PM/szerepkör nélkül elutasítva; nem látható ajánlat; kapott költségvetéses ajánlat; ismeretlen paraméter (pl. write); írás nem történik. Felület: PM-nél a panel nem jelenik meg, Marketing az ajánlati munkaterületet nem éri el | izolált |
| Felület (Playwright, `scripts/qa/check_viba_offer_calc.py`) | Sales és Tulajdonos asztali, Sales mobil: javaslatkód betöltése → 1 200 000 Ft, 0-s/hiányzó/referencia sor jelölve → írás tiltva tudomásulvétel nélkül → 3 tétel beírva (anyag/munkadíj külön) → ismételt írás 0 tétel (duplikáció) → 130 m²-re módosítva ütközés, nem felülírás → lehatárolás átvéve belső kifejezés nélkül → VBF-szövegből 3 hibapont bizonyítékkal; vízszintes túlcsordulás nincs, oldalhiba nincs | **szimulált szerver**: a `quote_items` beszúrás csak memóriában, minden más írás és a Gmail-küldés tiltva, TESZT-szerepkör, nem valódi RLS |

**Nem tesztelt:** bejelentkezett éles végigpróba; valódi `quote_items` írás RLS-sel; PDF a beírt tételekkel valódi adaton; valós VBF-jegyzőkönyv PDF szövegrétege; Timothy élő modellhívása az új eszközökkel.

## Korlátok
- Nincs jóváhagyott VIBA-ártörzs, m²-csomagtörzs, normaóra vagy felár: minden díj a felhasználó megadása, forrásmegjegyzéssel.
- A kalkulációs munkapéldány a felhasználó saját böngészőjében marad (felhasználó+ajánlat kulccsal); tartós, verziózott kalkuláció és a `pricing_mode` mező adatmodell-döntésre vár. Az ajánlat tételei, lehatárolása, verziói és PDF-je a meglévő módon tartósak.
- Timothy nem ír tételt (nincs P0 tételírási művelet); a javaslatkódot a felhasználó tölti be és írja be.
- A VBF-kinyerés szöveget dolgoz fel; szkennelt jegyzőkönyvnél előbb a meglévő OCR-olvasás (kérésre, fizetős) kell.
- A beírt tételeket a meglévő tétellista kezeli; a kalkuláció nem törli/javítja a korábban beírt sorokat (módosításhoz a meglévő szerkesztés vagy új verzió).

## Javasolt adatmodell (NEM migrálva, tulajdonosi döntésre)
```sql
alter table public.quotes add column pricing_mode text check (pricing_mode in ('subcontractor_labor','full_construction','house_sqm','hourly','custom'));
create table public.quote_calculations (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete restrict,
  calc_id text not null, profile text not null, input jsonb not null, result_summary jsonb not null,
  created_by uuid not null default auth.uid(), created_at timestamptz not null default now(),
  unique (quote_id, calc_id)
);
-- RLS: select can_access_quote(quote_id); insert owner/sales + can_access_quote + nem zárolt ajánlat; nincs update/delete (változtathatatlan).
-- Jóváhagyott díjtörzs (owner-only írás): viba_rate_cards(id, kind m2_package|hourly_role|surcharge|fee, label, version, huf, basis, conditions, valid_from, approved_by, approved_at).
```

## Következő: P7 — éles pilot és visszamérés
1. Egyetlen összevont tulajdonosi adatbázis-jóváhagyás (döntési lista 1–2. és 13. pont): árazás/tervellenőrzés/kalkuláció verziói, ajánlatcsomag-jóváhagyás, díjtörzs.
2. Bejelentkezett végigpróba Ramonnal TESZT-ügyön P1–P6 (12. pont), utána 3 valós ügylet: egy alvállalkozói (pl. MVM Neuron), egy teljes kivitelezői, egy saját VIBA (Sopron út 66. VBF a bejárás után, tételes forgatókönyv).
3. Projektenkénti napló: ajánlatkészítési idő, AI/OCR-költség, kiküldött nettó, elfogadás, később tényleges munkaóra és költség — csak a jóváhagyott tárolással.
4. Hibajavítás a pilot alapján, fokozatos szerepkörös engedélyezés tulajdonosi jóváhagyással.
