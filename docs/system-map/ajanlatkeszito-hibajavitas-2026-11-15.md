# Ajánlatkészítő – összevont hibajavítási csomag (2026-11-15)

Alap: `ajanlatkeszito-felulvizsgalat-2026-11-15.md` (belépett Fő CRM audit). Éles ügyféladat nem íródott, levél nem ment ki, publikálás nem történt.

## Adatbázis (nem destruktív)
- `leads.quote_requested` (alap: false) – Marketing „konkrét ajánlatkérés” jelölés.
- `quotes.pricing_settings` (jsonb) – ajánlatonként egy árazási beállítás.
- `uq_quotes_lead_current` → `uq_quotes_lead_current_alt (lead_id, alternative_key)`: az „Új alternatíva” ügyhöz kötött ajánlatnál eddig egyedi index miatt hibára futott volna.
- `quote_create_for_lead(p_lead_id, p_kind)` – security invoker; ügy + típus kötelező, lezárt ügyhöz és már ajánlattal bíró ügyhöz megtagad. A meglévő `quote_create_draft` változatlan, a felület már nem hívja.
- Ellenőrzés: függvény és új index megvan, régi index nincs, ajánlatok száma változatlan (17).

## Működő változások
1. Marketing → Sales → Pipeline → Ajánlat: átadáskor „Konkrét ajánlatkérés” jelölés; a kijelölt értékesítő az ügy oldalán „Elfogadom – Ajánlat előkészítése” gombbal, ajánlat-határidővel közvetlenül `quote_prep`-be teszi (meglévő `updateLeadOrThrow`, napló, `["leads"]`/`["pipeline"]`). Jelölés nélküli lead a régi minősítésen megy.
2. Új ajánlat (minden belépési pont egy komponens): kötelező ügy + típus, kapcsolattartó és megnevezés előtöltve; ha az ügynek már van ajánlata, nem jön létre második. Pipeline „Új, külön ajánlat” és a régi ügyoldali közvetlen „Új verzió”/„Akt.” gomb megszűnt.
3. Ajánlat oldala: egy nézet, négy lépés, „Következő teendő” sáv; egy dokumentumhely (nagy tervcsomag összecsukva ugyanott); m²/óradíj/VBF és tervellenőrzés/szekrény opcionális segédeszköz; „Beadási határidő” + „Érvényesség” (a régi ajánlatkérési határidő csak tájékoztatóként, ha ki van töltve); kiküldött változat csak olvasható; „1. változat”, nincs „A alt.”, nincs azonosító-zaj.
4. Árazás: rejtett 6 500 Ft/óra alapérték megszűnt (profil + 3 panel); egy árazási beállítás (óradíj, tartalék, haszon, kerekítés) – a szerver is ezt használja Timothynál; hiányos számítás nettója nem vehető át („Részösszeg”), 0 Ft = „Nincs árazva”.
5. Timothy: AI-panel beszélgetések rekordonként (ajánlat/ügy/ügyfél); másik ajánlat beszélgetése nem folytatódik és nem kerül a modellhez. Timothy-utasítás: Excel-fájlt nem szerkeszt/ment, ezt kimondja; végrehajtást csak igazolt eszközeredmény után állít.
6. Kiküldés: „Válasz az ügyfél eredeti levélszálában” vagy „Új e-mail”; a válaszfejléceket a szerver a saját Gmail-szálból olvassa; szerveroldali kiküldhetőség (lezárt/visszavont, típus, 0 Ft, eltérés, melléklet, árazott Excel); kötelező utánkövetési időpont; igazolt, nem duplikált küldés után `quote_schedule_followup` + „Ajánlat kiadva” (közös Pipeline-útvonal), részeredmény kijelezve.

## Tesztek
- Teljes tesztsor: 145 fájl / 1515 teszt sikeres; AI OS acceptance 21/21; típusellenőrzés hibátlan.
- Új szabálytesztek: `pricing-settings`, `completeness` (Dohány-eset: 625 nyitott sor → nem vehető át), `quote-steps`, `quote-request`, `send-blocker` (0 Ft, visszavont, melléklet, postSendPlan, válaszfejlécek), `ai-thread-scope` (Excel-törlési beszélgetés nem jelenik meg új ajánlatnál).
- Szimulált böngészős végigpróba (`scripts/qa/check_workspace_v2.py`, kitalált TESZT-adat, minden írás tiltva): Sales 33/33, Marketing 28/28, Tulajdonos 42/42; új ellenőrzések: négy lépés, nincs nézetváltó, küldés ablakában válasz/új levél, utánkövetés nélkül a Küldés tiltott.

## Kézi tesztlépések (tulajdonos, éles belépéssel)
1. Saját Gmail-címről küldj árazatlan Excelt az info@vibateam.hu-ra (TESZT a tárgyban). Várható: a levél a Levelezésben megjelenik.
2. Marketing: cég adatlap → Saleshez átadás → jelöld a „Konkrét ajánlatkérés”-t, válassz értékesítőt. Várható: lead „Új”, értékesítőnél látszik.
3. Sales: ügy oldala → „Konkrét ajánlatkérés” doboz → határidő → Elfogadom. Várható: Pipeline „Ajánlat előkészítése”, aktivitásnaplóban státuszváltás.
4. Ugyanott „Ajánlat indítása” → Kapott költségvetés. Várható: ajánlat az ügyhöz, kapcsolattartó előtöltve; második „Új ajánlat” ugyanarra az ügyre nem hoz létre újat.
5. 1. lépés: Excel feltöltése „Árazatlan költségvetés” típussal; Beadási határidő, Érvényesség, Mentés.
6. 2. lépés: Árazási beállítás (óradíj stb.) Mentés → Költségvetés árazása → Számítás. Várható: hiányos soroknál „Részösszeg”, a nettó nem vehető át; ár nélküli sorok listája és CSV.
7. 3. lépés: ajánlatcsomag – hiánylista, kérdéslista, kísérőlevél-tervezet; csak teljes árazásnál menthető az árazott Excel.
8. Timothy (jobb felső gomb) ezen az ajánlaton: kérdezz; nyiss egy másik ajánlatot – ott új, üres beszélgetés induljon.
9. 4. lépés: Küldés CRM-ből → „Válasz az ügyfél eredeti levélszálában” → saját TESZT-címre (ne ügyfélnek) → utánkövetési időpont → megerősítés → Küldés. Várható: levél a Gmail-szálban válaszként, ajánlat zárolt, Pipeline „Ajánlat kiadva”, utánkövetés a megadott időre.

## Hibajegyzék / korlátok
- NEM TESZTELT éles belépéssel (külső Supabase): 1–9. lépés, valódi Gmail-válasz, R2-feltöltés.
- Az árazott Excel elkészülte továbbra is a meglévő motor: ha forrás (ársablon / jóváhagyott ár) hiányzik, a sorok ár nélkül maradnak – piaci ár nem kerül kitalálásra. Tartós ártörzs/árazási verziók tulajdonosi adatmodell-döntésre várnak.
- Timothy nem szerkeszt Excel-fájlt (nincs írási eszköz); ezt kimondja. XLSX-szerkesztő + változásjegyzék + jóváhagyás utáni mentés új, jóváhagyandó funkció lenne.
- Tervcsomag-feldolgozás (P2) állapota és újrapróbálása a felületen megvan, de a feldolgozó szolgáltatás nincs telepítve (tulajdonosi Cloudflare-lépés), ezért a „feldolgozás” nem fut le.
- A 8 korábbi címzetlen ajánlat érintetlen; törölhetők/visszavonhatók a meglévő gombokkal.
- Az e-mail RFC Message-ID-t a CRM nem tárolja; a válaszfejlécek küldéskor a Gmailből olvasódnak (ha a szál nem olvasható, a küldés megáll, nem megy ki szál nélkül).
