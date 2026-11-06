# Marketingmutatók – rövid read-only ellenőrzés

## Ellenőrzött eredmény
- Éles SELECT: 664 cég, 701 kontakt, 8 lead, 18 webes igény, 0 felvételi receipt, 1 kampány. Üzleti írás, Gmail-művelet és publikálás nem történt.
- Meglévő céltesztek: 7 fájl / 31 PASS (owner-kpis, marketing-daily, company-marketing-state, marketing-timeline, marketing-refresh, marketing-handoff-guard, web-request-intake.server).
- Valódi böngésző: /today és /dashboard egyaránt /auth oldalra irányít, 0 pageerror. Hitelesített Owner/Marketing próba NEM TESZTELT: external_unmanaged, nem áll rendelkezésre átadható munkamenet. A bejelentkezési oldal képe ezt igazolja, nem a belső felület működését.

## Forrásból megállapított kockázatok
- `marketing-home.tsx` marketingcégeket 500, új cégeket és emailaktivitást 1000 sorra korlátoz, majd teljes számlálóként jeleníti meg őket. Hiba esetén több mutató üres listából nullát mutathat. A friss levélszálak 100-as listája csak bemutatási lista, nem összesítő.
- Az új cégek szándékosan minden új céget jelentenek, a kézzel felvett cégeket is. Ezt nem tekintjük hibának, és nem szűkítjük automatikusan marketingcégekre.
- A 30 napos átadási arány más halmazt és más eseményt hasonlít: időszakban átadott marketingcégek / időszakban létrehozott összes cég. Korábban létrehozott cég is átadható; ez nem az új cégek konverziós aránya, akár 100% feletti értéket is adhat.
- A „contacted” felirat emailküldést sugall, bár a marketingállapot önmagában nem Gmail SENT-bizonyíték. A válaszarány saját tárolt postafiókadatból származik; a teljes Gmail-történet nincs igazolva.
- OwnerHome és dashboard ugyanazt az OwnerKpiStrip útvonalat használja. Scarlet napi adaptere a közös loadMarketingDaily olvasót használja. Ezekhez nincs megállapított, célzottan javítandó eltérés; nincs új vezetői panel vagy AI-réteg.

## Következő kapu
Célzott marketing Ma számláló-/feliratjavítás terve, a meglévő újcég-definíció megőrzésével. Séma, RLS, adat, Sales, modell és küldési jog nem változik. Hosted szerepkörös mentés/readback, kampány TESZT-küldés és Scarlet valódi modellpróba továbbra is nyitott hozzáférési kapu, nem PASS. STOP.