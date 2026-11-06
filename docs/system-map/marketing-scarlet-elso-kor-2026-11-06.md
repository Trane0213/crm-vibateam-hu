# Marketing és Scarlet — első kör

## Javítások
- A két Gmail-szinkron pontos email-egyezésből a kontakt mentett cégét használja. Több cég/lead esetén nem választ véletlenszerű rekordot; figyelmeztet. Domain-egyezés nem bizonyít céget.
- Válasz új üzenete örökli a meglévő szál cégkapcsolatát, ha nincs ellentmondás. Korábbi szálak/levelek nem kerültek átírásra. Kézi szál-cégválasztó csak RLS-látható kapcsolatot ment; eltérő kontakt/lead blokkol, régi értékre feltételes frissítés védi az elavult mentést.
- Kézi küldés és Timothy közös Gmail-útja még küldés előtt ellenőrzi a cég/kontakt/lead összetartozását; eltérő válaszszál blokkolva. Gmail-siker utáni CRM-hibánál nincs hamis mentési siker, nincs újraküldés.
- Marketing Ma és Scarlet közös napi adatokból olvas: kampánycégek, saját levelek, saját nyitott utánkövetések, látható céges visszahívások. Külső válasz = saját fiók azonos szálán korábbi kimenő után későbbi, pontos kontaktfeladójú bejövő. Nem tartalmi elfogadás.
- Kampánylista Minden cég nézet: kereshető látható cégállomány, kampányküldési/elutasítási műveletek nélkül. Kampányküldés visszajelzése cég-ID-val, nem megosztott emailcím alapján.
- Hívásnál meglévő callback_date, kontakt-cég ellenőrzés és visszahíváskor kötelező időpont. Nincs új tábla vagy jogosultság.
- Scarlet központi GPT-6 Astra/high konfigurációja változatlan; céges aktivitás és ugyanazzal az exact mailbox olvasóval védett tartalom. Levéltartalom nincs auditba másolva. Csak javaslat, nincs küldés/üzleti írás.

## Igazolt és nem igazolt
- 47 célzott Vitest teszt, 21 AI acceptance sikeres. Küldési tesztek kizárólag mock Gmail-lel.
- Valós DB csak olvasva: 446 cég, 213 company/contact eltérés, 2426 kapcsolatlan szál; korábbi brief számai már nem aktuálisak. Nem javítottuk tömegesen.
- Böngésző: védett kampányoldal belépésre irányít, asztali/mobil belépő megjelenik, 0 pageerror. Ez NEM marketing bejelentkezett funkcióteszt.
- Nem tesztelt: hitelesített teljes Gmail→CRM→Marketing→Ramon és Scarlet valódi modellválasz. Nincs használható munkamenet, external_unmanaged projekt; régi jelszó nem használható.
- Marketing followup írása a jelenlegi RLS szerint nem engedett; nem módosítottuk. Visszahívás a meglévő phone_calls.callback_date útján kezelhető. Automatikus levélválasz nem ír át teendőt.
- Napi forrás 1000 sornál részleges jelzést ad, ilyenkor a válaszarány nem jelenik meg teljes mutatóként. Szinkron-címjegyzék 1000 sornál leállítja az automatikus egyezést, nem találgat.
- Régi üzenet és szál ellentmondásának javítása továbbra is kézi ellenőrzést igényel; a szálválasztó nem írja át a régi email-sorokat.

## Visszaállítás és védelem
Nincs migráció/RLS-módosítás vagy éles adatírás. Kódvisszaállítás: e kör Gmail-, marketing-, Scarlet- és realtime-bekötéseinek visszavonása; meglévő üzleti táblák érintetlenek. Nem publikáltunk, nem küldtünk ügyféllevelet, nem csatlakoztattunk postafiókot.