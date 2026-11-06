# Marketinges teljes napi munka a CRM-ben – felmérés és terv

Cél: egy marketinges reggeltől estig a CRM-ben dolgozhasson (napindítás, kampány, hívás, levelezés, utánkövetés, weboldali igények, átadás Sales-nek, Scarlet), új modul és párhuzamos funkció nélkül. Minden lépés után STOP és jóváhagyás.

## 1. Mi ismert ma (kód és 2026-11-06-i jelentés alapján)

Megvan: Marketing menü (Munkafelület, Weboldali igények, Kampánylista, Emailek), Marketing Ma, kampánylista „Aktív kampány / Minden cég”, hívásrögzítés visszahívási időponttal, Gmail-szál cégválasztó, Marketing→Sales átadás meglévő-lead figyelmeztetéssel, Scarlet (csak javaslat), Marketing súgó.

Ismert hiányok / nem működő pontok:
- Marketinges nem tud saját utánkövetést írni (jelenlegi jogosultság nem engedi) – csak hívásos visszahívás létezik, ez kettős „teendő” logikát okoz.
- A Hívások, Ügyfelek, Cégek, Kapcsolattartók csak a „Továbbiak” alatt érhetők el; nincs egy kattintásos napi útvonal.
- Weboldali igény → minősítés → Sales-átadás híd hiányzik (18 igény, kézi átvitel nincs kiépítve).
- 2426 kapcsolat nélküli és ~4267 tévesen Viba-Teamhez kötött levélszál, 213 cég/kontakt eltérés: a marketinges levelezési képe és válaszmutatója emiatt hiányos.
- Napi adatforrás 1000 sornál részleges – a válaszarány ilyenkor nem jelenik meg.
- Bejelentkezett marketinges teljes munkanap egyszer sem lett végigtesztelve (Gmail→CRM→Marketing→Ramon, Scarlet valódi válasz).
- Nincs ellenőrizve: marketinges láthat/szerkeszthet-e cégeket, kontaktokat, találkozót rögzíthet-e, és van-e saját Gmail-fiók csatlakoztatva.

## 2. Első lépés: read-only audit (nem módosít semmit)

1. Szerepkörönkénti jogosultsági mátrix marketingre: cég, kontakt, hívás, utánkövetés, találkozó, levél, quote_requests, lead létrehozás/átadás – éles RLS-szabályok lekérdezésével.
2. Marketing menü- és gombinventár: minden gomb működik-e, hova visz, kap-e hibát vagy hamis sikert.
3. Adatállapot friss számokkal: kampánycégek, marketinghez tartozó levelek, kapcsolat nélküli szálak, nyitott visszahívások, weboldali igények állapota.
4. Bejelentkezett marketinges munkanap-próba TESZT-adatokkal (ha munkamenet elérhető): reggeli Ma → kampányhívás → visszahívás → levél → válasz felismerése → weboldali igény → átadás Ramonnak → Scarlet kérdés.
5. Eredmény: rövid hibalista (Működik / Hibás / Hiányzik / Nem tesztelhető) prioritással. STOP.

## 3. Javítási szakaszok (audit után, egyenként jóváhagyva)

- M1 – Napi útvonal: Hívások, Cégek, Kapcsolattartók a marketing főmenübe; Ma oldalról közvetlen linkek. Csak láthatóság.
- M2 – Egységes teendő: döntés kell, hogy a marketinges saját utánkövetést írhasson (szűk, saját sorokra korlátozott jogosultság, hatáselemzés + rollback), vagy maradjon a visszahívás – egy út legyen, ne kettő.
- M3 – Weboldali igény minősítése és átadása: a meglévő Marketing→Sales átadást használja, nyers igény nem lesz automatikusan lead.
- M4 – Levélszál-tisztítás előkészítése: tételes dry-run (promó és pontos egyezés), snapshot és rollback; élesítés csak külön tulajdonosi jóváhagyással, nem tömegesen.
- M5 – Napi lista korlátok: 1000 soros részleges adat helyett lapozott, teljes számítás.
- M6 – Súgó frissítése és egy összevont regresszió + bejelentkezett marketinges munkanap-próba.

## Technikai rögzítés
Nincs új tábla/modul; Sales, Pipeline, ajánlat, 1/B, 1/C, Gmail-hozzáférések és AI-jogosultságok változatlanok. Éles adatírás, levélküldés, postafiók-csatlakoztatás és publikálás csak külön jóváhagyással. Rövid, összevont dokumentáció.
