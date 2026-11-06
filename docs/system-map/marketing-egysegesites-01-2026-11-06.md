# Egységes marketingműködés – 0–1. kör, csak olvasási ellenőrzés

Ellenőrzés: 2026-11-06, körülbelül 14:48–14:52 UTC. Jóváhagyott terjedelem: feltérképezés, tételes összevetés, hibajegyzék. **Sem üzleti adat, sem séma/RLS, sem Gmail-token/checkpoint nem módosult; nem történt küldés, visszatöltés vagy publikálás.** Csak dokumentumok és tételes ellenőrzési CSV-k készültek. A korábbi jelentések számait nem fogadtuk el újramérés nélkül.

## 1. Legfontosabb eredmény – a 203 jelölés nem 203 igazolt hideg megkeresés

| A 203, `[GMAIL_MEGKERESES_2026-11-06]` jelölésű cég | Darab |
|---|---:|
| Külső kontakthoz tartozó, tárolt Gmail SENT-bizonyíték | 82 |
| Csak piszkozat található a külső kontaktcímekhez, igazolt SENT nélkül | 120 |
| Belső/TESZT megkeresés, nem külső hideg megkeresés | 1 |

**A korábbi „203 cég kapott hideg e-mailt” állítás nem helyes.** 120 jelölésnél a kimenőnek tekintett levél DRAFT, nem bizonyított kiküldés. Az egy további jelölés a `057b657a-aded-4193-aa07-139948c85de9` TESZT webes E2E céghez, `info@vibateam.hu` belső címhez kötődik; a megjegyzés egy negyedik postafiókot is felsorol. A mostani audit csak a három engedélyezett céges fiókot számolja.

A 82 sem jelent automatikusan 82 hideg megkeresést: a cím-/SENT-egyezés egy elküldött levelet bizonyít a tárolt Gmail-adat szerint, nem a levél üzleti célját. A tartalmat nem olvastuk és a Gmail élő állapotát nem kérdeztük le. A jelölések most változatlanul maradtak.

### Ellenőrzési definíció
SENT-bizonyíték: `is_outbound=true`, üzenetszintű `SENT` címke, **nincs `DRAFT`**, van Gmail-üzenetazonosító és időpont, és a pontos normalizált feladó a szinkrontulajdonos három engedélyezett postafiókjának egyike. Címzett-egyezés a TO/CC/BCC pontos, kisbetűs, szélső szóköz nélküli címével. Másik fiók beérkezett másolatát nem számoljuk új küldésnek. Ez a másolatok/Gmail-ID-k auditja, nem Gmail-lekérdezés.

## 2. A három céges postafiók – aktuális tárolt állapot

| Postafiók | Tárolt üzenet | Kimenő jelző | DRAFT | Kimenő DRAFT | SENT, nem DRAFT |
|---|---:|---:|---:|---:|---:|
| info@vibateam.hu | 9826 | 4420 | 1364 | 1359 | 3046 |
| ramon.dencsi@vibateam.hu | 281 | 163 | 29 | 29 | 134 |
| pretor.laszlo@vibateam.hu | 717 | 86 | 39 | 39 | 47 |

Az info fiókban további 15 kimenő jelzésű üzenetnek nincs SENT-címkéje és nem DRAFT: ezek sem tekinthetők bizonyított kiküldésnek. Viktor személyes Gmailje nem forrás; a jelenlegi profilforrásban nem találtunk ezzel a Gmail-címmel sort, de nem is támaszkodtunk pusztán tesztfiók-kizárásra: pozitív háromfiókos engedélylistát használtunk.

**Pretor történeti hiány:** 2026.09.08–10.25 (Budapest, teljes napok): 0 tárolt üzenet. A tágabb 09.07–10.29 intervallumban 30 üzenet van, ami a szélnapok miatt nem ellentmondás. A hiány továbbra is bizonyított a CRM-ben, a Gmailben levő tényleges levelek száma NEM IGAZOLT. Ramon első tárolt üzenete 10.29: a korábbi történet az ő fiókjánál sem tekinthető teljesnek. Nincs visszatöltés vagy tokenfrissítés.

## 3. Eredeti Excel és import – tételes összevetés

Az eredeti `VIBA_EMAIL_KIKULDES_ELLENORZES_2026-11-05.xlsx` hozzáférhető volt. A dokumentumfeldolgozó a két nagy listát nem adta vissza, ezért az eredeti munkafüzet minden sorát külön, csak olvasási Excel-kiolvasással vizsgáltuk. 200 generálos + 287 marketinges = **487 listabeli sor**, nem 487 új cég.

| Pontos listabeli címhez tartozó állapot, soronként | Darab |
|---|---:|
| SENT-bizonyíték és későbbi, ugyanazon fiók/szál/cím kapcsolatú bejövő | 11 |
| SENT-bizonyíték, ilyen bejövő nélkül | 282 |
| Csak piszkozat, SENT nélkül | 121 |
| Egyéb nem igazolt üzenetkapcsolat | 64 |
| Nincs tárolt címzetti bizonyíték | 7 |
| Nincs cím a listában | 2 |

**Külön egységek:** 539 egyedi listabeli cím; 291 címen van SENT-bizonyíték; ezek 289 jelenlegi kontakthoz és 289 jelenlegi cégazonosítóhoz kapcsolódnak; 366 külön elküldött üzenet érinti őket. 915 piszkozatüzenet is érinti a listát. 30 címen egynél több külön küldési azonosító látszik: ez **lehetséges ismétlés**, nem bizonyított véletlen dupla küldés vagy ugyanaz a megkeresés. A 41 azonos fiók/szál alapján későbbi bejövő üzenet 11 listabeli sorhoz kötődik; nem üzleti elfogadás és nem tartalmilag igazolt válasz.

Az Excel másodlagos, „Kiküldött cím” oszlopában lehet további kontakt; a fő összevetés a listabeli elsődleges címeken történt, nem domain alapján. A 6 külön felsorolt generálos kiküldés mind a 6 eredeti Gmail-azonosítóval és Ramon SENT-címkéjével visszaigazolható.

**Importegyezés:** 481 sorhoz pontos e-mail-egyezés ad egyetlen CRM-céget. 2 cím nélküli névjelölt: SÜGÉR-VILL (`3f675af6-5f87-4ab1-a9c4-bf9ef4379dcb`), FŐÉPSZER (`f1c51fbb-110a-4c74-8915-fdaa10b36ad2`). 3 sorhoz nincs pontos cím-/normalizált névegyezés: CB-ÉPÍTŐ GENERÁL, BUILD IT, FEJÉR-B.Á.L. Ez nem bizonyítja, hogy más néven nincsenek a CRM-ben; kézi ellenőrzés szükséges. Atenor névütközés: `04068c98-d6dc-48c0-8b1a-6a504fe0570e`, `9f79d990-1706-4eb5-b291-d0f4cea04cb1`. Nincs automatikus összevonás.

A forrásmegjelölés 195 generálos importcéget igazol. Az aktuális teljes CRM: **664 cég, 701 kontakt, 8 Sales-lead**. November 6-án 218 cég és 262 kontakt keletkezett, de ezeket nem lehet automatikusan mind az Excel-importnak tulajdonítani. A november 6-i 262 külön kontaktcímből csak **83** kap tárolt SENT-bizonyítékot, 258 elküldött és 452 piszkozatüzenet mellett; ez a napi kontaktpopuláció, nem az Excel vagy a 203 jelölés populációja.

## 4. Kapcsolati és személyazonossági kivételek

A 203 jelöléshez **514 cég–üzenet bizonyítéksor** készült; ez nem 514 külön kiküldés. Mind az 514-nél egyedi pontos kontakt–cég egyezés és azonos üzenet-/száltulajdonos látszik. 41 bizonyítéksornál a mentett szálcége eltér a kontakt cégétől; ezek közül 21 SENT-sor, 16 külön céget érint. A TO/CC/BCC egyezés önmagában nem engedélyez szálátkötést: több résztvevő és mentett kapcsolat külön ellenőrizendő.

30 november 6-i kontaktnév formailag az e-mail helyi részéből olvasható személynévnek felel meg. A név nem igazolt személyazonosság; a CSV csak ellenőrzendő jelölt, nem bizonyítja a név eredetét, helyes sorrendjét vagy ékezetét. Sem névjavítás, sem ellenőrzöttségi állapotírás nem történt.

## 5. Frissített adatkapcsolati térkép

| Munkafolyamat | Meglevő hiteles alap / kód | Jelenlegi korlát |
|---|---|---|
| Cég és kontakt | `companies`, `contacts`; pontos kontakt→company_id | Névjelöltek nem azonosság; nincs teljes személy/proveniencia-állapot |
| Levelezés | `emails` → `email_threads`; `owner_user_id`, Gmail ID, `email_thread_access` | Üzenettulajdonos adja a fiókot, nem a résztvevő; szálcég lehet téves |
| Importellenőrzés | `relink-review.functions.ts` → `relink-analysis.ts`; owner RPC-check, 1000-es adatlapok, 50-es eredményoldalak | Elemző nem választja el a SENT/DRAFT-ot; relink nincs végrehajtva |
| Kampány | `email_campaigns` → `email_campaign_recipients` → `contacts` | Jelenleg 1 draft „Hideg Email Kampány”, 0 címzett, nincs prechecked_at; jóváhagyás/küldés nincs |
| Előellenőrzés | `campaign-precheck.server.ts` → `campaign-eligibility.ts` | Nem kér SENT/DRAFT-címkét; csak teszttulajdonos-kizárás; bármely bejövő = replied; hiányos történet nem egységesen bizonyított |
| Marketing Ma | `marketing-daily.functions.ts` → `loadMarketingDaily`, `marketingMailFacts` | Saját scope, de egyszeri 1001-es lekérdezési korlát; `is_outbound` nem SENT-bizonyíték |
| Cégaktivitás | `company-activity.ts`, `marketing-timeline.ts` | RLS-es szálak, 25-ös oldalak; kapcsolt ID-k 150-es korlátja jelzett, teljes történet nem garantált |
| Hívás / feladat / utánkövetés | `phone_calls`, `tasks`, `followups`, `followup_events` | Meglevő út; új végigpróba nem történt |
| Webes érdeklődés | `quote_requests`, meglévő szerveroldali minősítés | Nyers igény nem automatikus Sales-lead |
| Sales-átadás | meglévő marketing-workspace és handoff guard → `leads` | Guard UI-ellenőrzés; átadás/átvétel/visszaadás teljes lánca nem igazolt |
| Scarlet | meglévő AI OS, közös napi és fiókspecifikus olvasók | Új AI-futtatás, eszköz- vagy jogosultságváltozás nincs |

## 6. Aktuális kampányjogok és visszaállítás

Mindkét kampánytáblán RLS aktív. Aktuális policy: owner minden kampányt, marketing saját created_by kampányt olvas/módosít; beszúrás owner/marketing és saját draft. Recipients csak elérhető kampányon keresztül olvasható. **Anon mindkét táblán semmilyen CRUD-joggal nem rendelkezik. Authenticated kampány SELECT/INSERT/UPDATE, DELETE nincs; recipients csak SELECT.** Ezek élő katalógus- és jogosultság-SELECT eredmények, nem új több szerepkörös végrehajtási tesztek.

- Cégnév-casing rollback: konkrét ID és elvárt új név feltétellel írt régi értékek – nem futtattuk, snapshothoz újraellenőrzendő.
- Gmail-jelölés rollback: marker utáni teljes megjegyzésrészt törölne, és kontaktnevet a cég nevéből következtetne vissza. **Nem pontos snapshot, későbbi jegyzetet is elveszíthet; így nem biztonságos általános visszaállítás.**
- Kampányrollback a korábbi 0 rekordos határra készült: címzett-táblát és felelősi mezőket töröl, anon CRUD-grantot és túl tág authenticated policyt állítana vissza. **A jelenlegi 1 kampány mellett ne futtassák; jogosultsági regressziót is okozna.**
- E körben egyik rollbacket sem módosítottuk/futtattuk. Későbbi célzott javítás előtt a tényleges régi/új értékekre, ID-kre és változásvédő feltételekre épülő új, szűk visszaállítás kell; külön engedéllyel.

## 7. Teszt és státusz

- Meglévő célzott Vitest: **32/32 PASS**, 5 fájl (relink-analysis, campaign-eligibility, marketing-mail, marketing-daily, marketing-handoff-guard). Nem bizonyítja a fenti új hitelességi követelmények teljesítését; a tesztek jelenleg a meglévő szabályokat ellenőrzik.
- Excel 487 soros és DB teljes JSON-aggregált adatösszevetés: lefutott; nem 1000 soros API-mintából számoltunk. SQL → egy aggregált eredmény, teljes mentett eszközkimenet kiolvasva. Nem használtunk levéltörzset, tokent vagy jelszót.
- Bejelentkezés nélküli böngészős próba `/import-review/mail` → `/auth`, 0 pageerror; képernyőkép ellenőrizve. **Tulajdonosi belső nézet, lapozás, Marketing/Sales/PM és kampány CRUD végigpróba: NEM TESZTELT**, külső Supabase és nincs használható átadott biztonságos munkamenet. Ez nem jogosultsági PASS.
- Alkalmazáskód nem változott; kézi build/typecheck nem indult. Legfrissebb elérhető preview build-bejegyzés: build OK. A route fejléce meglévő egyedi VIBA metaadatokat tartalmaz; más tartalmi route nem változott.

## 8. Tételes bizonyítékok és következő engedélyezési kapu

A `docs/system-map/marketing-01-audit-2026-11-06/` mappában:
- `excel-teteles.csv`: 487 sor, eredeti lap/sorszám, cím, cégjelölt és bizonyíték.
- `megkereses-jelolesek.csv`: 203 cég, jelenlegi jelölés vs SENT/DRAFT.
- `jeloles-bizonyitekok.csv`: 514 cég–üzenet kapcsolat, Gmail/CRM ID, tulajdonos, fiók, címke és mentett kapcsolati eltérés; levéltartalom nélkül.
- `ismetelt-cimek.csv`: 30 lehetséges ismételt cím; további üzleti ellenőrzés szükséges.
- `kontaktnev-ellenorzendo.csv`: 30 nem igazolt személynév-jelölt.

**Javasolt következő egyetlen célzott kör:** a meglévő relink/kampány/napi mutató olvasók SENT/DRAFT-védelmének és háromfiókos bizonyítékminősítésének javítása, azonos szálbeli válaszvizsgálattal, hiányos történet jelzésével és konkrét szabálytesztekkel; nem új modul. A 120 hibás megkeresésjegyzet és 1 TESZT/belső jelölés adatjavítása ettől külön kapu: előtte pontos állapotmentés, új visszaállítás és ID-s jóváhagyás. **Most STOP**, nincs 2–5. kör indítás.