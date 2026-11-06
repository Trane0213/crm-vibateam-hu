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
Célzott marketing Ma számláló-/feliratjavítás jóváhagyva és megvalósítva, a meglévő újcég-definíció megőrzésével. Séma, RLS, adat, Sales, modell és küldési jog nem változott. Hosted szerepkörös mentés/readback, kampány TESZT-küldés és Scarlet valódi modellpróba továbbra is nyitott hozzáférési kapu, nem PASS. STOP.

## Jóváhagyott javítás és összevont ellenőrzés
- `marketing-home-read.ts`: közös marketingfilter, stabil created_at/id sorrendű 500-as lapozás; összegzés csak befejezett olvasásból. Duplikált olvasott ID, hiányzó adat vagy elért biztonsági plafon elutasítás, nem részleges pontos szám. Párhuzamos adatváltozás teljes snapshot-konzisztenciája nem garantált REST-lapozásnál.
- Emailaktivitás user-klienssel pontos count, az eddigi created_at 30 napos ablak és internal_date ?? created_at hét napos feltétel megmaradt; nincs 1000-es számlálólimit.
- Marketing Ma olvasási hiba/betöltés esetén nem mutat valódi nullát; az átadási arány helyén átadott cégek száma, a megkeresés felirata nem küldési bizonyíték, válaszarány saját tárolt levelezésként jelölt.
- Hat új szabályteszt: 1001 kézi új cég, 1001+ strukturált/legacy marketingcég, régi cég mai Budapest-átadása, későbbi oldal olvasási hibája, 1501 exact email count/dátumpredikátum, hiányzó count elutasítása. Teljes Vitest: 713 PASS / 68 fájl. Aktuális build OK.
- Elkülönített TESZT-böngésző: 1001 céges és 1501 leveles kijelzés, átadási darabszám és új feliratok láthatók; 1280×1800 és 390×844, nincs vízszintes túlcsordulás vagy pageerror. Ez előre feltöltött memóriabeli tesztadat, nem hosted mentés vagy tényleges jogosultságpróba.
- Nincs éles írás, Gmail-küldés vagy publikálás. Visszaállítás az érintett olvasó és MarketingHome kód visszavonásával; nincs adat-visszaállítási feladat.