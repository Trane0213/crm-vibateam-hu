# Kapcsolattartók: adatforrás és ellenőrzöttség

## Egy összevont kör
A meglévő kapcsolattartó-adatlap és a marketing cégoldal kapcsolattartói kapnak egységes besorolást, adatforrást és külön ellenőrzöttséget. Nem készül új modul, nincs automatikus besorolás vagy történeti adatátírás.

## Megjelenítés és mentés
- Besorolás: **személy / gyűjtőcím / ismeretlen**. Hiányzó adat „Nincs rögzítve”, nem igazolt személy.
- Adatforrás: kézi adatfelvétel, kapott dokumentum/import, emailből következtetett vagy közvetlenül megerősített adat. A forrás önmagában nem bizonyít személyazonosságot.
- Ellenőrzöttség: nem ellenőrzött vagy ember által ellenőrzött. Emailből következtetett adat önmagában soha nem lehet ellenőrzött; közvetlen megerősítés vagy dokumentált emberi ellenőrzés szükséges. Az ellenőrzés nem email-kézbesítési bizonyíték vagy küldési engedély.
- A meglévő adatlapokon látszik a besorolás, forrás és ellenőrzés időpontja. A kézi ellenőrzés külön menthető; nem módosít nevet, címet, céget vagy Sales-ügyet.
- Csak tulajdonos és Marketing menthet ilyen ellenőrzést, meglévő hozzáférésén belül. Sales/PM továbbra is ugyanúgy szerkesztheti a jelenleg engedett kontaktadatokat, de nem hamisíthat ellenőrzöttséget.
- Név, email vagy cég változásakor a korábbi ellenőrzés automatikusan érvényét veszti; új emberi ellenőrzés kell. Telefon és beosztás módosítása önmagában nem igazolja és nem törli a név/email/cég ellenőrzését.

## Hatás és visszaállítási kapu
A friss olvasás szerint **701 kontakt**, 9 meglévő oszlop, alkalmazási trigger nélkül. A meglévő négy contacts policy owner/Marketing/Sales/PM hozzáférést ad; ezek változatlanok maradnak. A teljes kontaktpillanatkép hash: `f3f306821706e79fe3324f9dee0bd294`.

A meglévő `contacts` táblán nullable, alapérték nélküli mezők készülnek: besorolás, adatforrás, ellenőrzési állapot, ellenőrző, időpont és rövid ellenőrzési hivatkozás. Nem töltjük vissza a régi importokból vagy email-nevekből. Új mezők közvetlen hamisítását védő trigger és jogosított mentési művelet védi; szerveridő és hitelesített ellenőrző kötelező, mentés és meglévő activities audit atomikus. Auditba nem kerül emailtartalom.

**Séma/jogosultság alkalmazása előtt pontos SQL, hatáselemzés és adatvesztés nélküli rollback készül, elkülönített teszttel; az éles alkalmazás a migráció jóváhagyási kapuján megy át.** Visszaállításkor új ellenőrzés letiltható, a mezők és audit megmaradnak, jogosultságot nem nyitunk vissza, már kitöltött bizonyítékot nem törlünk.

## Ellenőrzés és lezárás
Egy összevont tesztkör: owner/Marketing mentés és readback; Sales/PM/no-role tiltás; hamisított ellenőrző/időpont; emailből következtetett név nem igazolható automatikusan; név/email/cég módosítása érvénytelenít; konkurens kontaktmódosítás konfliktust ad; audit hibája visszavonja a mentést. Meglévő kontakt- és marketingregresszió, asztali/mobil megjelenítés, éles read-only változatlanság-ellenőrzés.

Bejelentkezett valódi owner/Marketing/Sales/PM végigpróba jelenleg nem áll rendelkezésre a külső Supabase miatt: **NEM TESZTELT**, ezt izolált próbával nem nevezzük éles sikernek.

## Hatókörhatár
Nincs cégösszevonás, új kontaktok tömeges felvétele, emailcím-javítás, automatikus email-nevesítés, Sales-átadás, küldés, Gmail-jogváltozás, AI-fejlesztés vagy publikálás. E kör után STOP; a kampánykör csak külön elfogadás után indul.