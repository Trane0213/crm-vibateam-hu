# Timothy P3/B1 — következő lépés jóváhagyott módosítása

## Hatókör
Timothy kizárólag a meglévő lead következő lépésének **típusát, dátumát/időpontját és jegyzetét** módosíthatja, kifejezett P0 jóváhagyás után. Elsőként csak ez az egy művelet készül; a teljes P3/B nem indul egyszerre.

- Sales: csak saját felelősű ügy. Tulajdonos: meglévő hozzáférése szerint. Marketing/PM nem kap új műveletet.
- Minden meglévő típus megmarad: Telefon, Email, Találkozó, Helyszín, Dokumentum, Ajánlat, Utánkövetés, Egyéb.
- Kötelező típus és érvényes, egyértelmű dátum/idő. Timothy nem találhat ki hiányzó időpontot. Budapesti idő és pontos időzóna jelenik meg a jóváhagyásban; az adat ISO időpontként mentődik.
- A jelenlegi kézi mentés nem követel jövőbeli dátumot; ilyen új üzleti korlátozást nem vezetünk be.
- A jóváhagyás mutatja az ügyet, kapcsolódó céget, kapcsolattartót, felelőst, valamint a **régi és új következő lépést**, teljes jegyzettel.
- Ha a jóváhagyásra várakozás közben az ügy kapcsolatai, státusza vagy következő lépése változott, a művelet nem írja felül a frissebb adatot; új jóváhagyás szükséges.

## Nem része
Nincs lépéstörlés, új utánkövetés, aktivitás-, kontakt-, felelős- vagy státuszmódosítás, Pipeline-ba léptetés, vesztes lezárás, projektátadás vagy levélküldés. Meglévő Sales Ma, kézi szerkesztő, Pipeline és ajánlatkezelő változatlan.

## Műszaki megvalósítás és adatvédelmi hatás
1. Egyetlen új, szűk AI OS eszköz, a meglévő két chat és P0 jóváhagyási útján. A régi következő lépés és ügykontextus szerveroldali, felhasználói RLS-es olvasásból kerül a változtathatatlan jóváhagyásba.
2. Egy új `SECURITY INVOKER` SQL-függvény, bemenetként csak a végrehajtás alatt álló P0 action UUID-val. A jóváhagyás tulajdonosa, Timothy/eszköz, végrehajtási állapot, szerepkör és saját lead ellenőrzése. Lead-zárolás és régi értékek összevetése után csak a három `next_step_*` mező frissítése.
3. Mentés és `activities` audit egy tranzakció: előtte/utána értékek és jóváhagyásazonosító. Action-szintű zárolás és auditazonosító megakadályozza az ismételt alkalmazást; ismeretlen végrehajtás nem indíthat automatikus újrapróbálást. Siker csak pontos mentett visszaolvasás alapján.
4. Nincs új tábla/oszlop, RLS- vagy meglévő trigger-módosítás; csak az új függvény végrehajtási joga az authenticated szerepnek, anon/Public tiltva. A meglévő felhasználói RLS minden olvasáson és íráson érvényes marad. Közös sikeres jóváhagyás után leads/pipeline/napi listák frissülnek.

## Visszaállítás
Előzetes hatásjelentés és SQL készül. A bevezetés visszaállítása csak az új függvény/eszköz eltávolítása, auditot vagy üzleti adatot nem töröl. Egy adott mentés kézi helyreállításához az audit régi értékei szolgálnak alapul, kizárólag tulajdonosi jóváhagyással és az aktuális értékek összevetésével — nincs tömeges automatikus visszaírás.

## Ellenőrzés és lezárás
- Konkrét típus/dátum/idő/jegyzet validáció; hiányos és extra mezők elutasítása; időzóna és mentett érték ellenőrzése.
- Izolált SQL: saját Sales és tulajdonos; idegen ügy/felhasználó és Marketing/PM tiltás; lejárt/elvetett/ismeretlen action tiltás; közben megváltozott ügy tiltás.
- Párhuzamos végrehajtás csak egy módosítást/auditot eredményez; audit-hiba esetén teljes visszagörgetés. Más leadmező nem változik.
- Teljes regresszió, AI acceptance, előnézet ellenőrzése és közös jóváhagyási kártya izolált böngészős próbája.
- Valódi bejelentkezett két-chat → mentés → CRM-visszaolvasás csak biztonságos hozzáféréssel. Ennek hiányát **NEM TESZTELT** jelöléssel dokumentáljuk, nem állítjuk igazoltnak.
- Kézikönyv, változáslista és PASS/FAIL/NEM TESZTELT jelentés, majd **STOP**. Éles üzleti próbaírás, emailküldés és automatikus publikálás nélkül.