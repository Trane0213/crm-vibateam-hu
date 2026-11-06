# Strukturált marketingállapot – külön jóváhagyásra váró kapu

**Nem alkalmazott terv.** A jelenlegi `companies.notes` markerek átmeneti források, a mostani megjelenítési kör nem váltotta ki őket.

## Minimális következő változtatás
- A meglévő `companies` táblán strukturált marketingállapot, módosító auth-user, szerveridőpont és forrás mezők; nem új cég-/CRM-tábla. Az első változat a meglévő öt workflow-kódot őrzi meg, új üzleti átmenetek külön döntés tárgyai.
- Kontakt személy/gyűjtőcím/ismeretlen és forrás/ellenőrzöttség csak bizonyított vagy felhasználó által ellenőrzött adatból, a meglévő `contacts` táblán. E-mailből következtetett név nem ellenőrzött személy.
- Jogosított mentés a felhasználó meglévő RLS-kliensével, `crm_role_of` szerverellenőrzéssel; owner/marketing írhat, más szerep nem. A kliens nem választhat módosítót/időpontot vagy hamisított küldési bizonyítékot.
- A jelenlegi company policykat nem tágítjuk; oszlopjogok és védő trigger szükségesek a közvetlen klienshamisítás tiltásához. A meglévő `activities` napló az állapotváltozás hiteles auditja; Gmail-küldést továbbra sem helyettesít.
- Közös olvasó elsőként strukturált adatból, ennek hiányában egyértelműen jelzett legacy markerből. A strukturált állapot nem kézbesítési állapot.

## Alkalmazás előtti feltételek
Aktuális oszlopok, policyk, grantok, triggerek és minden markeríró enumerálása; név szerinti migráció és rollback SQL; TESZT owner/marketing/sales/PM szereppróba, no-role tiltás; régi/új olvasó regresszió. A nulla/hiányzó struktúrából nem keletkezhet hamis „Új” vagy „küldhető” döntés.

## Adatvédelem / visszaállítás
A schema-kapu nem engedélyez backfillt vagy markereltávolítást. Ha később külön jóváhagyott visszatöltés kell, azonosítós régi/új snapshot és változásvédő javítás szükséges. Visszaállás először a legacy olvasóra; kitöltött oszlopokat nem törlünk adatvesztéssel, jogosultságot nem nyitunk vissza. Pontos végrehajtható SQL csak friss séma- és szerepellenőrzés után készül. Most nincs migráció, RLS- vagy üzleti adatváltozás.