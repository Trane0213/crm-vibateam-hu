# Webes igény tartós felvétele – 2026-11-06

## Elkészült
- Jóváhagyott migráció: quote_requests négy nullable eredménymező, teljes/üres receipt constraint és törlést megakadályozó cég/kontakt referenciák. Régi 18 igény nincs kitöltve.
- Service-only security-invoker website_request_intake: Owner/Marketing actor ellenőrzés, tárolt igényből adat/TESZT-döntés, igénysorzár és determinisztikus email/név advisory zárak. Cég, kontakt, kötelező audit és receipt egy tranzakció; visszatérő kérés azonos mentett eredmény. Más CRM-írók globális név/email egyediségére nincs garancia.
- Pontos email-egyezés meglévő cég megnyitását jelenti, nem összevonást. Többcéges/név/korábbi notes vagy audit felvételi nyom kézi ellenőrzés, nem régi részleges sor javítása.
- Hitelesített szerverfunkció ID-only, Owner/Marketing saját klienssel ellenőrzött szerep, majd service RPC. Siker csak saját RLS-es cég+kontakt+kötelező audit visszaolvasása után. Külön read-only receipt recovery; nincs vak újrapróbálás.
- Meglévő igénykártya szerverfunkciót használ, korábbi kliensinsert és memóriabeli írási helper törölve. Nem készült lead, nincs Gmail/AI változás.
- quote_requests klienspolicy továbbra nincs, anon/authenticated nem hívhatja a mentő RPC-t. Meglévő cég/kontakt/lead RLS és triggerei nem módosultak; nullable marketing/proveniencia mezők továbbra üresek új insertnél.

## Ellenőrzés
- Izolált PostgreSQL PASS: owner/marketing actor, anon/authenticated/Sales/PM/admin tiltás, két párhuzamos azonos igény egyetlen cég/kontakt/audit, replay azonos receipt, más igény azonos email mellett saved+existing ugyanarra a cégre, kontakt/audit/receipt-hiba teljes rollback, legacy no repair, RLS és execute grant.
- 707 Vitest PASS, 67 fájl, AI acceptance 21 PASS. A három régi memóriabeli helper teszt kivezetve; négy új user-RLS/audit/hiányos receipt teszt.
- Build OK. Elkülönített TESZT-megjelenítés asztal/mobil: meglévő cég megnyitás, nincs túlcsordulás/pageerror. Valódi szervermentési böngészőpróba nem futott.
- Friss éles SELECT: 18 igény, 0 receipt, 664 cég, 701 kontakt, 8 lead; anon/authenticated execute=false. Nincs éles felvétel, adatjavítás, levélküldés vagy publikálás.
- Migráció nem vezetett be új linterjelzést; 16 korábbi jelzés külön kezelendő (policy nélküli RLS, függvényjogok/search_path, public extension, jelszóvédelmi beállítás).

## Nyitott / STOP
Hitelesített hosted Owner/Marketing mentés→readback és több szerepkör próba NEM TESZTELT: external_unmanaged, nincs átadható munkamenet. Az izolált SQL fixtures nem a teljes hosted trigger/rendszer vagy modellteszt. Weboldali receiver unchanged insert/duplicate-no-write útja forrásból ellenőrzött, új élő beküldési próba nem futott. A kampány TESZT/ügyfélküldési és Scarlet modellkapuk nyitva maradnak.

Visszaállítás: database/rollback_website_request_intake_2026-11-06.sql + felvételi gomb letiltása; mezők/audit/üzleti sorok megmaradnak, régi kétlépéses insertet nem állítunk vissza. SQL forrás: database/website_request_intake_2026-11-06.sql.