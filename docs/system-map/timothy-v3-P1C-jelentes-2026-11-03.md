# Timothy V3.0 – P1/C ajánlatértelmezés

Dátum: 2026-11-03. A P1/B utáni „mehet tovább” jóváhagyás alapján. P1/D–P5 nem indult.

## Változáslista

- A meglévő AI OS CRM-adapter regisztrálja az ajánlati olvasásokat; mindkét chat ugyanazon bootstrap/runtime útvonalon használja. Nincs új chat, provider, ajánlatszerkesztő vagy végrehajtási útvonal.
- `crm_list_quotes`: nettó, munkamód, aktuális jelölés, csoport, alternatíva, verzió, felelős/kontakt, létrehozás/küldés/érvényesség és mentett műszaki szöveg. `company_id`, `lead_id`, `project_id` szűrők, látható darabszám és folytatható lapozás.
- Céglista: két diszjunkt ág – leadhez kapcsolt, majd lead nélküli projektajánlatok. Áganként létrehozás szerint csökkenő, ID szerint stabil sorrend. Nyertes leadhez és projekthez egyszerre kapcsolt ajánlat nem duplikálódik; nincs 1000 lead/projekt ID-s előzetes letöltés. A sorrend nem globális időrend, ezt az eredmény jelzi.
- `crm_quote_context`: előbb az ajánlat RLS-es olvashatósága, utána summary/items/versions/sends/followups/content szekció. Minden gyermeklista pontos quote_id szerint olvasott. A versions csoporton belüli, RLS-látható rekordokat ad, nem választ automatikusan alternatívát.
- Hosszú mentett műszaki szöveg: content + field + text_offset folytatás, forrásazonosítóval; érzékeny szöveg minden szöveglap előtt teljes mezőre ellenőrzött és visszatartott. A listák jelzik a csonkolást/visszatartást.
- `crm_compare_quotes`: két explicit olvasható ajánlat azonos group_id és pontos mentett lead_id/project_id kapcsolat mellett. Alapadat-változáslista és két külön lapozható tételhalmaz. Eltérő ügy nem összehasonlítható. Név/munkarész/egység szerinti tétel-összevetés AI-javaslat, nem bizonyított egyedi sorazonosság; másolt tételazonosítók nem tekinthetők állandónak.
- Új értelmezési eszközök: Timothy, owner/admin/sales a meglévő szerepkörlistából; minden üzleti olvasás `ctx.supabaseUser` klienssel. Új DB-jogosultság nincs, admin kliens nem szükséges.

## Megőrzött üzleti számítások és korlátok

- Nettó: meglévő `quoteAmounts`, tétel meglétekor DB által számított total_amount; egyébként manual_net_amount; hiányzó érték NULL, nem 0 Ft. Tétel/manual eltérés jelezve. ÁFA/bruttó szintén a közös függvényből.
- Nyitott állomány: `summarizeActiveQuotes` és `isActiveQuote`, nem új KPI. Korábbi verzió kizárt; accepted/rejected/withdrawn és legacy won/lost lezárt. Lead/projekt/önálló ügyenként legnagyobb ismert aktuális nyitott nettó, nem alternatívák összege. Részleges lap csak oldalösszesítés, nem teljes állomány; teljes látható kiválasztás sem a teljes adatbázis.
- Kapott költségvetés és saját VIBA-mód a mentett quote_kind alapján; legacy hiányzó típus ismeretlen. Fájlt nem olvas, a kapott költségvetés árazottságát nem találja ki.
- Kiküldési bizonyíték a meglévő quote_lock_sent feltétele: quote_sends status sent/recorded + sent_at + nem üres Gmail message ID. Az eredmény tárolt küldési naplót bizonyít, nem új élő Gmail-lekérdezést. sent_at/locked_at önmagában nem levélbizonyíték.
- Ügyfélválasz csak P1/B eszközzel olvasható pontos ügy/fiók/szál/tartalom alapján. Státusz, teljesített utánkövetés vagy küldési napló önmagában nem bizonyít választ/elfogadást. Hiányos szinkron továbbra is korlát.
- Műszaki kérdés/hiány/kísérőlevél/utánkövetési javaslat csak mentett releváns tartalom alapján, tény és javaslat elkülönítve. Ár, mennyiség, szerződéses feltétel nem írható át. Dokumentumtartalom P1/D előtt nem vizsgált.

## PASS / FAIL / NEM TESZTELT

| Ellenőrzés | Eredmény |
|---|---|
| Teljes Vitest regresszió | PASS: 204/204, 29 fájl |
| P1/C célzott tesztek | PASS: 19/19 |
| AI acceptance | PASS: 5 agent, 15 strukturális forgatókönyv, 0 hiba/figyelmeztetés |
| Automatikus fordítás/típusellenőrzés | PASS: build OK, 2026-11-03 16:25:36 UTC |
| 1012 mesterséges ajánlat több lapból, két cégkapcsolati ág | PASS, hiány/duplikáció nélkül |
| Rejtett ajánlat gyermekolvasásának és összehasonlításának tiltása | PASS izolált kliens-fixture; nincs admin kliens |
| Tárolt küldésbizonyíték, üres Gmail ID, más verzió kizárása | PASS izolált TESZT-adattal |
| Titok visszatartása, hosszú szöveg folytatása, részlegesség | PASS |
| Hitelesített valós RLS / két-chat / Timothy modellminőségi próba | NEM TESZTELT: external_unmanaged Supabase, nincs átadható biztonságos munkamenet |
| Éles CRM/PDF/Gmail/R2 végigpróba | NEM TESZTELT; küldés vagy fájlművelet nem történt |

A strukturális AI acceptance nem valódi modellválasz-minőségi teszt. Az izolált hozzáférési fixture nem helyettesíti az éles RLS ellenőrzését. A központi payload-védelem túlméretes összeredményt explicit hiányos hibára cserél; nem vág JSON-t és nem állít teljes feldolgozást.

## Használati ellenőrzés a saját bejelentkezésből

Egy egyértelműen TESZT jelölt saját ajánlatnál kérdezd: „Mi a nettó értéke, melyik az aktuális alternatíva és milyen bizonyíték van a kiküldésre?” Majd két konkrét verzió ID-val: „Hasonlítsd össze ezt a két verziót, és jelezd a hiányos adatokat.” Ellenőrizendő: mentett nettó egyezése, külön alternatívák, pontos ajánlatlink/forrás, régi verzió nem kerül állományba, utánkövetés nem ügyfélválasz, hosszú szöveg részlegessége, írás/küldés nem történik.

## Visszaállítás és hatás

Nincs migráció, DB-adatírás, RLS/szerepkör-módosítás, Gmail-szinkron, fájlművelet vagy publikálás. P0-jóváhagyás, Sales Ma, Pipeline, ajánlatkezelő üzleti funkciói változatlanok.

Kód-visszaállítás: a projekt előző verziójából visszaállítandó a CRM-adapter, Timothy prompt, acceptance fixture, P1/A teszt és AGENTS szabály; az új quote-context(.test), quote-read.server és quote-tools.server fájlok ezután eltávolíthatók. DB rollback nem szükséges. Visszaállítás után teljes Vitest és AI acceptance futtatandó. Nincs visszaállítandó éles üzleti adat.

Oldalcímek olvasásos ellenőrzése: index és érintett AI/ajánlatoldalak meglévő metaadatai maradtak; több más, nem érintett régi oldalon nincs saját head. Ezeket a kizárólag AI-értelmezési szakasz nem módosította.

STOP: P1/C kód és izolált ellenőrzések elkészültek. Hitelesített végigpróba nyitott; P1/D külön jóváhagyást igényel, nem indult.