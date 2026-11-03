# Ajánlatkezelő V2.1/B – munkaterületek

## Hatókör
Kizárólag a meglévő ajánlatadatlap átrendezése; A védelmei megmaradnak. Nincs adatírás, migráció, RLS-változtatás vagy publikálás. V2.1/C nem indult.

## Megvalósult
- Áttekintés és alapadatok: meglévő verzió/alternatíva-kezelő, kapcsolattartó, felelős, határidők és műszaki alapadatok.
- Dokumentumok és Excel: meglévő R2 dokumentumkezelő, változatlan feltöltés/letöltés/törlés.
- Tételek és árak: kedvezmény, ÁFA, megadott nettó, számított összegek és meglévő tételpanel.
- Sablon és előnézet: meglévő sablonpanel és a meglévő mentett PDF/nyomtatási nézet megnyitása. Élő A4-előnézet csak C-ben készülhet.
- Kiküldés és előzmények: meglévő Gmail-küldő és kiküldési napló.
- Állapot és utánkövetés: meglévő státuszpanel.
- Rögzített fejléc: ügyfél, státusz, verzió/alternatíva, mentett felelős és mentett nettó összeg. Hiányzó összeg nem 0 Ft.
- A munkaterületek rejtve is csatolva maradnak, ezért váltáskor nem szűnik meg a helyi szerkesztési állapot. A mentések és a jogosultsági korlátok a meglévő útvonalakon maradnak.

## Ellenőrzés
- PASS: fordítás (2026-11-03 14:52:18 UTC).
- PASS: AI acceptance 12/12.
- Az első teljes regresszió 120/121: a korábban is hibás tulajdonosi menüteszt az ownernek szándékosan rejtett Gmail-menüpontot is követelte. A teszt most a meglévő hideForRoles-szabályt figyelembe veszi, és külön ellenőrzi, hogy az owner Gmail-oldali jogosultsága megmaradt. Navigációs működés nem változott.
- Hitelesített böngészős végigpróba NEM TESZTELT: external_unmanaged Supabase, átadható munkamenet nincs. Mentés, lapváltás közbeni szerkesztési állapot, rögzített fejléc asztali/mobil megjelenése, fájlkezelés és Gmail végigpróba nem tekinthető böngészőben igazoltnak.

## Visszaállítás és STOP
Kódoldali visszaállítás: az ajánlatadatlap előző változatára visszatérés; adatbázis-visszaállítás nem szükséges. Teljes C szakasz és publikálás csak külön jóváhagyással.