# Marketing Ma – pontos számlálók, változatlan működés

## Cél
A meglévő marketing Ma oldal számai ne legyenek észrevétlenül csonkoltak, és ne állítsanak igazolatlan emailküldést vagy konverziót. Nem készül új felület vagy vezetői modul.

## Célzott változtatások
- Megmarad az eddigi szabály: az „Új cégek” minden új CRM-céget számol, a kézzel felvett cégeket is. A marketingállapotok halmaza továbbra is a közös marketingcégek definíciója.
- Az 500/1000 soros korlátok helyett teljes, jogosultsággal szűrt számlálás a marketingállapotoknál, új cégeknél és 7 napos emailaktivitásnál. A bemutatott rövid listák továbbra is rövidek maradnak.
- Betöltési vagy olvasási hiba ne jelenjen meg valódi nullaként; nem igazolt teljességnél ne legyen pontos összesítőként feltüntetett szám.
- A félreérthető „Átadási arány · 30 nap” helyett „Átadott cégek · 30 nap” darabszám jelenjen meg. Nem alkotunk új konverziós üzleti szabályt, és nem keverjük az időszakban átadott cégeket az időszakban létrehozottakkal.
- A megkeresésként jelölt marketingállapot felirata ne állítson emailkézbesítést. A válaszmutató nevezze meg a saját tárolt levelezési forrást; hiányos adatból továbbra se jelenjen meg igazolt arány.

## Határok
Nincs séma-, RLS-, szerepkör-, élesadat-, Sales-, Gmail-hozzáférés-, AI-modell- vagy küldésmódosítás. Nincs backfill, ügyfélküldés vagy publikálás. OwnerHome/dashboard közös KPI-útja és a Scarlet napi olvasója változatlan.

## Műszaki megvalósítás és ellenőrzés
- A meglévő `marketing-home.tsx`, `marketing-universe.ts` és közös állapotolvasás újrahasználata; szűrt count lekérdezések, illetve ahol listára is szükség van, stabil sorrendű lapozás. Emailaktivitás az eddigi internal_date/created_at értelmezést őrzi meg.
- Céltesztek: 1001+ cég, 500+ marketingcég, 1001+ email; strukturált/legacy állapot, régi cég mai átadása, kézi új cég beszámítása, olvasási hiba nem nulla. Meglévő kapcsolódó regresszió egy összevont körben.
- Asztali/mobil megjelenítés ellenőrzése elkülönített TESZT-adatokkal. Ez nem helyettesíti a hosted szerepkörös végigpróbát.
- A belépett éles próba jelenleg nem elérhető (`external_unmanaged`); nem jelöljük sikeresnek. Egy rövid szakaszjegyzet és STOP a következő kör előtt.

## Visszaállítás
Csak az érintett olvasási és megjelenítési változások visszavonása szükséges; üzleti sorokhoz és jogosultságokhoz nem nyúlunk.