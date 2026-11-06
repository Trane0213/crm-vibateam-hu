# Napi marketingmunka és Scarlet – célzott javítás, 2026-11-06

## Elkészült
- Webes igény: kattintás előtt friss egyezésellenőrzés; megkísérelt írás után nincs vak ismétlés. Visszaigazolt cég-ID megmarad kontakt/audithiba esetén és megnyitható; bizonytalan cégírás esetén céglista-ellenőrzés szükséges. Nincs automatikus lead. A védelem a jelenlegi felületi munkamenetre szól, nem tartós többablakos tranzakciós garancia.
- Marketingátadás: siker/részleges hiba frissíti a cégeket, leadeket, Pipeline-t, napi és kampánylistákat, webes egyezést. Frissítés alatt az átadás tiltott; a meglévő részleges lead-ID megmarad. Nem módosult a lead létrehozási vagy Pipeline üzleti szabály.
- Közös realtime-frissítésben a cégek/kontaktok a webes egyezést, leadek a marketing napi/kampánylistákat is érvénytelenítik; nincs külön csatorna.
- Közös AI-levélolvasó: SENT+DRAFT mindig unknown_or_automated, soha nem sent. Ez determinisztikus eszközadat-védelem, nem bizonyított modellválasz-minőség.
- Meglévő CRM olvasó projekciók tartalmazzák a strukturált marketingállapotot és kontaktprovenienciát; közös olvasóértelmezésben a mentett állapot megelőzi a notes-markert, nem kézbesítési bizonyíték. Emailből következtetett gyűjtőcím nem igazolt személy.
- Napi loader: RLS-es, korlátozott tiltásolvasás; tiltott/hibás email és külön telefonelérhetőség, küldési engedély mindig false. Hiányos tiltáslista explicit részleges; közös visszahívás nem saját feladat. Ma oldal meglévő listájában emailfigyelmeztetés és közös visszahívás címke.

## Ellenőrzött eredmény
- 706/706 Vitest PASS, 67 fájl; új tesztek: részleges kontakt/auditmentés és timeout nem ismétel cégírást; megmaradó ID; shared invalidation; SENT+DRAFT; strukturált állapot elsőbbsége; nem igazolt gyűjtőcím; tiltott email nem engedély; telefon nem tiltott email miatt; hibás email és közös callback scope.
- AI acceptance: 5 agent, 21 forgatókönyv, 0 hiba/figyelmeztetés. Modell/provider/agent/tool/jóváhagyás unchanged.
- Build OK. Elkülönített asztali 1280×1800 és mobil 390×844 TESZT-megjelenítés: tiltott email + külön telefon, közös visszahívás, meglévő cég megnyitás, nincs túlcsordulás vagy pageerror. A fixture nem használ éles felhasználói munkamenetet, nem végzett üzleti írást.
- Friss SELECT-alap: 664 cég, 701 kontakt, 8 lead, 1 kampány, 0 küldési audit, 0 tiltás. E kör nem alkalmazott migrációt és nem írt üzleti adatot.

## Nyitott kapuk / NEM TESZTELT
- Hitelesített Marketing/Owner/Sales/PM mentési és teljes nap/átadás/readback próba: external_unmanaged, /today és /campaign-list → /auth; a felhasználó szerkesztőbeli belépése nem ad át munkamenetet. Nem kérünk jelszót és nem kerülünk meg jogosultságot.
- Scarlet valódi modellválasza új állapot/proveniencia/tiltás esetén nem futott; 706 determinisztikus teszt és acceptance nem bizonyít modellmegbízhatóságot.
- Webes konkurens többablakos/reload felvétel teljes tartós idempotenciája külön tranzakciós tervet és jóváhagyást igényel; nem állítjuk lezártnak.
- Teljes kampány → válasz → Sales-átvétel elfogadás, valódi engedélyezett TESZT-küldés és ügyfélküldési aktiválás továbbra is nyitott. Nincs küldés, időzítés vagy publikálás. STOP.

Visszaállítás: e kör célzott kódmódosításainak visszavonása, éles adat/levél/audit módosítása nélkül.