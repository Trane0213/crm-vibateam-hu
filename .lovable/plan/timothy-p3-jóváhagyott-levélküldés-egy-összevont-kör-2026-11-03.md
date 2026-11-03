# Timothy P3 — jóváhagyott levélküldés, egy összevont kör

## Eredmény
Timothy teljes, javítható levéljavaslatot készít a meglévő ügyhöz. Küldés előtt a két meglévő chat közös jóváhagyási kártyáján látszik a saját feladó, To/CC/BCC, tárgy, teljes szöveg, pontos CRM-ügy és valamennyi melléklet. Módosítás új jóváhagyást igényel; nincs jóváhagyás utáni újragenerálás vagy önálló küldés.

## Megvalósítás
- A meglévő `/api/gmail/send` küldési logikájának szerveroldali közösítése; ugyanazt használja a kézi küldés és Timothy. Nem készül második Gmail-küldő.
- Saját aktív Gmail-fiók és tényleges Google-feladó újraellenőrzése; Sales saját ügy, Owner meglévő hozzáférés. CRM-kapcsolatok egyezése, pontos válaszszál és fiók-hozzárendelés ellenőrzése.
- Kötelező, változatlan jóváhagyási tartalom: címzettek, teljes üzenet, ügyazonosítók; dokumentumazonosító, fájlverzió/kulcs, név, méret és tartalomhash. Megváltozott melléklet, ügykapcsolat vagy hozzáférés esetén nincs küldés. Nincs automatikus PDF-generálás, fájlátírás, árazás vagy feltételmódosítás.
- Ajánlatküldés a meglévő `quote_sends` bizonyítékkal és action-alapú idempotenciakulccsal; sima levél nem módosít ajánlatot, lead státuszt, következő lépést vagy felelőst. A meglévő kézi küldés mellékhatásait nem változtatjuk meg.
- Valódi Gmail SENT-visszaolvasás és saját fiókhoz/ügyhöz kötött mentett levél igazolja a sikert. Elküldött levél, de sikertelen CRM-rögzítés: külön bizonytalan/részleges eredmény, újraküldés nélkül.

## Szükséges adatvédelmi változás
A sima levél jelenleg nem kap tartós küldési ismétlésvédelmet. Új tábla helyett a meglévő `agent_run_steps.approval_events` tárol egy egyszeri dispatch-foglalást. Egy **service-only atomi SQL-függvény** ellenőrzi az eredeti action tulajdonosát, Timothy/küldőtool azonosságát, executing állapotát és változatlan paramétereit, majd sorzárral egyszer foglal küldést. Közvetlen ismétlés, párhuzamos kérés vagy folyamatleállás után nincs automatikus újrapróba. A P0 meglévő claim/lifecycle-függvényei, üzleti táblák, kliensjogosultságok és RLS nem változnak.

Végrehajtás előtt pontos SQL és jogosultsági ellenőrzés kerül a rövid közös munkajegyzet mellé; az izolált próba megelőzi az éles migrációt. Migráció üzleti adatot nem ír át. Visszaállítás: új tool és dispatch-függvény kikötése, meglévő küldési belépés visszaállítása; levelek és audit megmaradnak. Az elküldött e-mail nem vonható vissza adatbázis-rollbackkel.

## Egy összevont ellenőrzés és STOP
- Dupla/párhuzamos jóváhagyás és dispatch; elutasítás, lejárat, idegen user/Marketing/PM, más feladó, hozzáférésvesztés, módosult ügy/melléklet, Gmail-hiba és küldés utáni mentési hiba.
- Regresszió, AI acceptance és közös kártya izolált TESZT-böngészőpróba; rövid közös jelentés és kézikönyvfrissítés.
- Éles levél, valódi ügyféladat-írás és publikálás nélkül. Hitelesített két-chat/valódi Gmail végigpróba a jelenlegi külső Supabase mellett **NEM TESZTELT**, bevezetési akadály marad.
- P4–P5 nem indul; a kör végén STOP.