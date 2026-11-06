# Kontrollált kampány – előkészítés, küldés nélkül

## E kör eredménye
A meglévő Kampánylista és kampánytervezet egészül ki: tudatos cég-/kontaktkijelölés, mentett tárgy és üzenet, címzettenkénti előnézet és egyértelmű ellenőrzési eredmény. Nem készül új kampánykezelő vagy levélküldő.

**Kiküldés, ütemezésaktiválás és TESZT-levél ebben a körben nincs.** Ezek külön tulajdonosi engedélyt és a későbbi küldési védelem elkészültét igénylik. Nem változik cég, kontakt, Sales-lead, Gmail-hozzáférés vagy publikált oldal.

## Mit egészítünk ki?
- A keresés és a kijelölés különválik: szűrés önmagában nem teszi kampánycímzetté a cégeket. A felhasználó kifejezetten jelöli ki a cégeket és a kontaktokat; nem vágunk le listákat észrevétlenül.
- A tervezet tárgya és szövege menthető, újranyitáskor visszatöltődik. Előnézet a ténylegesen kijelölt kontakt/cég adataiból, nem kitalált személynévből; emailből következtetett név nem jelenik meg igazolt személyes megszólításként.
- Címzettlista mutatja a kontakt besorolását/ellenőrzöttségét és a már meglévő öt előellenőrzési kategóriát. Hibás, belső/TESZT, több céghez tartozó, korábban megkeresett, válaszoló és bizonytalan cím nem válik automatikusan küldhetővé.
- Hiányos Gmail-történet továbbra is bizonytalanság: a három céges fiók marad a bizonyítékforrás, személyes tesztfiók kizárva. Az ellenőrzött tervezet továbbra sem küldési engedély.
- Mentés/ellenőrzés előtt az aktuális tervezetet ellenőrizzük; másik mentést nem írhat felül észrevétlenül. Címzettcsere részleges hibánál nem hagy fél listát és hamis sikerjelzést.

## Műszaki határ és hatáselemzés
- Jelenlegi állapot olvasással ellenőrizve: **664 cég, 701 kontakt, 8 lead, 1 tervezet, 0 tárolt kampánycímzett**. A meglévő `email_campaigns` csak név/célcsoport/állapot mezőket tárol; a `email_campaign_recipients` nem tárol tudatos kijelölést. Az általános `email_drafts` nem használható kampánytárolóként: nincs kampánykapcsolata és jelenleg túl tág a hozzáférése; nem nyitunk rá új kampányutat.
- A meglévő kampánytáblák minimális bővítése nullable tárgy/szöveg mezőkkel és címzett-kijelöléssel. Régi kampányhoz nincs automatikus tartalom vagy kijelölés, nincs backfill vagy új üzleti tábla.
- Owner minden kampányt, Marketing csak sajátját szerkeszti; Sales/PM nem kap kampányjogot. A meglévő szerveroldali bejelentkezés- és RLS-védelem marad. A kampányőr a tartalom/kijelölés változását is visszaveti tervezetbe; ellenőrzési időt továbbra sem írhat kliens.
- A címzettcsere és ellenőrzési eredmény egy tranzakcióban, kampánysorzárolással és friss előállapot-védelemmel készül; a meglévő előellenőrző dolgozik, nem új Gmail-olvasó vagy küldő.
- Érintett helyek: kampánylista, meglévő tervezetpanel, kampánymentési szerverfüggvények, közös előellenőrző és annak tesztjei. Gmail-küldés, AI OS, Sales és ajánlatok nem változnak.

## Visszaállítás és ellenőrzés
- Migráció előtt mentjük az érintett táblaszerkezetet, jogosultságokat, kampányőrt és meglévő kampány-/címzettsorokat. A visszaállítás letiltja az új mentési utat, de megőrzi az újonnan mentett tartalmat; nincs vak oszlop-/adattörlés és jogosultságnyitás.
- Egy összevont TESZT-kör: kijelölés nem követi automatikusan a keresést, nincs listacsonkítás, üzenet mentés/readback, emailből következtetett név védelme, hibás/bizonytalan cím tiltása, párhuzamos mentés, tranzakciós hibavisszagörgetés, Owner/saját Marketing/Sales/PM jogosultságok.
- Bejelentkezett valódi mentési végigpróba a jelenlegi külső Supabase mellett nem elérhető; elkülönített teszt nem helyettesíti. Ezt **NEM TESZTELT** státusszal jelöljük, nem kérünk jelszót.
- A kör végén rövid közös eredményjegyzet és **STOP**; következő szakasz és bármilyen küldés csak külön engedéllyel.