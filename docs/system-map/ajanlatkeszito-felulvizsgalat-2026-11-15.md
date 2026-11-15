# Fő CRM ajánlatkészítő – felülvizsgálat (2026-11-15)

Mód: bejelentkezett böngészős végigpróba (info@, szerepkör: Értékesítő) + kódaudit. Csak olvasás: 0 író kérés, adat nem változott.
Nem próbált (írással járna): feltöltés, kalkuláció futtatása/átvétele, mentés, kiküldés, verzió/alternatíva, állapotváltás. Owner-only részek nem látszottak.

## Kritikus
1. „Új ajánlat” a listából ügy/ügyfél nélkül hoz létre piszkozatot (`NewQuoteButton` leadId=null), az ajánlat oldalán ügyfél/ügy nem választható, a kapcsolattartó ezért nem adható meg → zsákutca. Élő bizonyíték: 8 „Címzetlen ajánlat” piszkozat (12:12–12:17), ügyfél és ügy nélkül.
2. Ajánlat nem törölhető/archiválható a felületről – a félbehagyott piszkozatok végleg a listában maradnak.
3. Létrehozás két lépés (RPC, majd külön típusfrissítés); a lead-munkaterület régi gombja RPC nélkül, közvetlen inserttel hoz létre típus nélküli verziót.
4. Pipeline „külön ajánlat” valójában ugyanannak a csoportnak új verziója lesz (RPC), a korábbit lecseréli aktuálisként.

## Összefolyó / rosszul szétválasztott
- Pénzösszeg 6 helyen: tételek, megadott nettó, kapott Excel árazás, saját kalkuláció, ajánlatcsomag, fejléc. Eltérő átvételi szabály (egyik külön Mentést kér, másik azonnal ment).
- Dokumentum 3–4 helyen: Tervcsomagok, Ajánlati dokumentumok, tervellenőrzés bemenete, csomag generált fájljai.
- Saját ajánlat 2. lépés: belső kalkuláció (önköltség, tartalék, forrás) + ügyfélnek szóló árak + sablon/feltételek + A4 előnézet egy oldalon.
- Kapott Excel 2. lépés: árazás + tervellenőrzés/szekrény-BOM + árazási alapadatok egy oldalon; 3. lépésben a csomag újabb árazást/jóváhagyás-előkészítést hoz.
- Két nézet (Részletes 4 fül / Egyszerűsített 3 lépés) ugyanarra.
- Verziók/alternatívák és ajánlattípus a „további műveletek” alatt elrejtve, típus utólag átírható.
- Több „Mentés” gomb egy képernyőn (alapadat, árazás, sablon, állapot).
- Zárolt ajánlatnál a mezők szerkeszthetőnek tűnnek, csak a Mentés tiltott.

## Szakzsargon a felületen
TERVEZET, ujjlenyomat/azonosító, „nem mentett jóváhagyási napló”, normaórák (feltételezés), Célfedezet, „Megadott nettó összeg (fájlalapú ajánlat)”, „A alt.”, h1-ben csak „v1”.

## Javasolt egyszerűsítés (jóváhagyásra vár)
1. Új ajánlat csak ügyből/ügyfélből (vagy a listán kötelező ügyválasztással); típus a létrehozáskor, egy lépésben.
2. Félbehagyott piszkozat visszavonása/archiválása (meglévő állapot), a 8 címzetlen tétel tulajdonosi döntéssel.
3. Egy nézet, típusonként 4 lépés: Ügy és dokumentumok → Árazás (egy összeg-forrás) → Ügyfélnek szóló ajánlat (sablon, feltételek, előnézet) → Kiküldés és utánkövetés.
4. Belső számítás (önköltség, tartalék, normaóra, BOM, tervellenőrzés) külön összecsukott „Belső számítás” részbe, sosem az ügyféldokumentum mellett.
5. Egy dokumentumhely ajánlatonként, kategóriákkal; tervcsomag ennek egy fajtája.
6. Egy Mentés lépésenként, egységes átvételi szabály.
7. Szakszavak cseréje köznyelvire; zárolt ajánlatnál olvasható nézet.
