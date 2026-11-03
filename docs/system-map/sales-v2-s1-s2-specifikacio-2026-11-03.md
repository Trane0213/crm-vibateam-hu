# Sales V2.0 – S1 és S2 specifikáció (csak olvasás) – 2026-11-03

Állapot: olvasásos vizsgálat. Kód, adat, RLS, séma nem változott, nincs publikálás.
Adatpillanatkép: 2026-11-03 ~12:15 UTC. Leadek összesen: 8.

## S1 – Ügyenkénti állapottábla

| Lead (rövid id) | Jelleg | Státusz | Felelős | Köv. lépés határidő (UTC) | Ajánlat | Megjegyzés |
|---|---|---|---|---|---|---|
| 7898c643 | Excel-import | follow_up (Pipeline 11-03 10:48) | Ramon | 11-03 15:00 | – | rendben |
| 8e70667a (VIV Zrt.) | Excel-import | follow_up (Pipeline 11-03 10:47) | Ramon | 11-05 08:00 | draft v1 | „megtörtént” hívás 11-05-i dátummal |
| ac3fcf54 | Excel-import | quote_prep (Pipeline 11-03 10:49) | Ramon | 11-03 15:00 | – | rendben |
| cf2b2089 | Excel-import | follow_up (Pipeline 11-03 10:49) | Ramon | 11-04 08:00 | – | rendben |
| e1d4afb6 | Excel-import | new (Workspace) | Ramon | NINCS | – | 2 azonos találkozó 11-04 12:00, „info” rögzítette, „megtörtént” jelöléssel |
| 43b05791 | TESZT | won | Viktor | – | draft v1 | 1 projekt |
| 50e89907 | TESZT | won | info | – | – | 1 projekt |
| 8a13d658 | TESZT | lost | Viktor | – | – | előzmények megvannak (3 státuszbejegyzés) |

Az 5 importált ügyből 4-et Ramon ma Pipeline-ba léptetett (a 11-03-i javítás után), 1 még Workspace-ben van határidő nélkül.

## S1 – Szabályonkénti eredmény

| # | Szabály | Eredmény | Bizonyíték |
|---|---|---|---|
| 1 | Minden aktív ügynek egyértelmű felelőse | PASS | mind a 6 nem lezárt leadnek van felelőse (5 Ramon) |
| 2 | Más ügye ne legyen saját teendő | **FAIL** | a „Ma” oldal teendő-számlálói és a /sales/todo nem szűrnek felelősre (`v_lead_due_buckets` minden nyitott leadet ad) |
| 3 | Kiosztatlan közös leadek külön | TESZTELENDŐ | most nincs kiosztatlan lead; a Workspace kollektív szűrő nem választja szét a saját/kiosztatlan ügyet |
| 4 | Megtörtént aktivitás ≠ jövőbeli teendő | **FAIL** | az „Aktivitás rögzítése” a followups táblába `completed=true`-val ír, a dátum jövőbeli is lehet (VIV: hívás 11-05, e1d4: 2 db 11-04-i találkozó „megtörtént”). Nincs jövőbeli-dátum tiltás és dupla-rögzítés védelem |
| 5 | Következő lépés típus+dátum+idő mentése | PASS (adat) | a 11-03-i javítás után a 4 Pipeline-lead mind kapott határidőt; böngészős Ramon-próba NEM TESZTELT |
| 6 | Pipeline-ba csak előkészített lead | PASS | DB trigger + javított gomb feltétel; minden Pipeline-leadnek van típusa és határideje |
| 7 | Ajánlat ne duplikálódjon; draft ≠ kiküldött | PASS | leadenként max. 1 aktuális verzió; mindkét ajánlat draft; „Ajánlat kiadva” draft mellett engedett szabály dokumentált, változatlan |
| 8 | Megnyertből 1 projekt; elveszettnél előzmény | PASS | 2 won → 1-1 projekt; lost lead előzményei megvannak |
| 9 | 5 importált ügy állapota | PASS / 1 hiány | e1d4afb6: nincs köv. lépés; egyik importált leadhez sincs kontaktszemély |

## S2 – A jelenlegi Sales „Ma” oldal leltára

| Blokk | Adatforrás | Kinek a száma | Probléma |
|---|---|---|---|
| Workspace / Pipeline / Elveszett / Projektek | leads, projects darabszám | mindenkié | statisztika, nem napi munka; nem saját |
| Lejárt teendő / Ma esedékes | `v_lead_due_buckets` | mindenkié | **UTC nap**, nem Budapest (00:00–01:00 közti határidő rossz napra esik); nem saját |
| Ajánlatok | quotes, lead_id nem üres | mindenkié | minden verziót számol, nem „válaszra vár” |
| Hibakezelés | `data ?? 0` | – | lekérdezési hibánál **hamis 0** |
| Rekordlinkek | listaoldalra visz | – | nincs egy kattintásos ugrás a konkrét lead Workspace-ére |
| Felső sáv (pulse bar) | külön számlálók | – | párhuzamos teendő-szám, más forrásból („lejárt utánkövetés”) |

## S2 – Javasolt végleges „Ma” specifikáció

Közös adatforrás: a leadek következő lépése (`next_step_type`, `next_step_due_at`), nyitott státusz, Budapest helyi nap. A followups tábla csak előzmény, teendőként nem számol. Alapértelmezés: saját ügyek (felelős = belépett felhasználó); tulajdonosnál csapatszintű váltó.

| Prioritás | Lista | Szabály | Mezők | Kattintás |
|---|---|---|---|---|
| P1 | Lejárt teendők | határidő < Budapest ma 00:00 | ügyfél, felelős, hány napja, teendő | lead Workspace |
| P2 | Mai feladatok | határidő Budapest ma | ügyfél, teendő, időpont | lead Workspace |
| P3 | Friss feldolgozatlan | státusz new, nincs köv. lépés, ≤7 nap | forrás, beérkezés, felelős/kiosztatlan | lead Workspace |
| P4 | Válaszra váró ajánlat | státusz quote_sent / follow_up, aktuális ajánlat nem draft | ajánlat, kiadás ideje, következő kontakt | lead (Pipeline) |
| P5 | Hiányos / elakadt | nyitott lead köv. lépés nélkül, vagy kontakt nélkül | pontos hiány | lead Workspace |

Minden sor: TESZT jelölés; lezárás után azonnali frissülés; hiba esetén hibaüzenet, nem 0. A felső statisztikai kártyák a P1–P5 alá kerülnek vagy megszűnnek – új dashboard nem készül.

## Priorizált javítási lista (jóváhagyásra)

| # | Tétel | Érintett | Kockázat | Teszt | Visszaállítás |
|---|---|---|---|---|---|
| J1 | Teendő-számlálók és /sales/todo: saját ügyek + Budapest nap | Ma oldal, Teendők oldal (csak képernyő-oldali szűrés; a nézet változatlan) | alacsony | unit: napszámítás 23:30 / 00:30 Budapest | fájl-visszaállítás |
| J2 | Hamis 0 helyett hibaüzenet | Ma oldal | alacsony | unit | fájl-visszaállítás |
| J3 | Aktivitás: jövőbeli dátum tiltása, dupla rögzítés figyelmeztetés | Sales előkészítő panel | alacsony | unit | fájl-visszaállítás |
| J4 | P1–P5 munkalisták a Ma oldalon, rekordlinkkel | Ma oldal | közepes | unit + TESZT böngészős | fájl-visszaállítás |
| J5 | Felső sáv számlálóinak összehangolása a P1/P2-vel | pulse bar | alacsony | unit | fájl-visszaállítás |
| D1 | Döntés: e1d4afb6 két azonos „megtörtént” találkozója – meghagyjuk vagy egyet kézzel jelölünk | adat | – | – | – |
| D2 | Döntés: a VIV jövőbeli dátumú „megtörtént” hívása – meghagyjuk vagy kézi javítás | adat | – | – | – |

Adatbázis, RLS, Pipeline-szabály, Marketing→Sales átadás egyik tételben sem változik. STOP – jóváhagyásra vár.
