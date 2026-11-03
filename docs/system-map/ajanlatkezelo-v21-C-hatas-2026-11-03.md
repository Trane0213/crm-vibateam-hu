# V2.1/C hatáselemzés és visszaállítás

A sablonalapok a meglévő `settings` táblában két névtérbe (`quote_template:private`, `quote_template:b2b`) kerülnek, kizárólag kifejezett tulajdonosi mentéskor. Nincs új tábla, séma/RLS/grant módosítás vagy ajánlatátírás. A jelenlegi táblában a key egyedi; a két sablonhoz nem található korábbi beállítás. A kliens nem kap általános settings hozzáférést: hitelesített szerverfüggvény ellenőrzi a meglévő `crm_role_of` szerepkört, csak a két sablonkulcsra használja a meglévő admin klienst. Olvasás: owner, sales, project_manager; írás: owner. A szövegmezők allowlist és hossz alapján ellenőrzöttek; verzióütközés elutasított.

Az alapérték csak kézi betöltéskor, az adott ajánlat üres feltételeibe kerül. Meglévő vagy kiküldött ajánlatot általános sablonmentés nem módosít. Új verzió/alternatíva a korábbi A forráshű öröklését használja. Nincs Gmail-küldés, éles fájlművelet vagy TESZT-adatírás ebben a fejlesztésben.

Az előnézet és a nyomtatási nézet egyetlen közös dokumentumkomponenst használ. Az előnézet helyi, még nem mentett ajánlatszövegeket jelenít meg; a külön nyomtatási oldal továbbra is csak a mentett ajánlatból dolgozik, a mentett kapcsolattartó szabályával.

Visszaállítás: a C kódváltoztatásainak visszavonása. A felhasználó által később elmentett sablonalapokat visszaállítás előtt key/value pillanatképpel meg kell őrizni; csak a két névtér érinthető. Adatbázis-visszaállítás most nem szükséges, mert migráció és adatmentés nem történik.