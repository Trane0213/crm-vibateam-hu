# AI OS P0 – biztonságos jóváhagyás és igazolt végrehajtás

## Cél és hatókör
Az eredeti, felhasználó által látott AI-művelet hajtódjon végre, legfeljebb egyszer, szerveroldali jóváhagyással. A jóváhagyás nem indít új modellválaszt. Sikerjelzés csak ellenőrzött végrehajtási eredményből származhat.

A meglévő AI OS, asszisztensregiszter, szerepkörök és RLS-es üzleti adathozzáférés megmarad. Sales Ma, Pipeline, ajánlatkezelés, navigáció, Gmail és dokumentumkezelés nem változik. Nincs új üzleti végrehajtási funkció, éles tesztírás vagy automatikus publikálás.

## Ellenőrzött kiindulás
- Mindkét chatfelület új `runAiAgent` hívással próbál jóváhagyni, régi modellhívás-azonosítót küldve. A szerver nem az eredeti műveletet folytatja.
- A felület a sikeresen visszaérkező kérést végrehajtásnak tekinti; elutasítás csak helyben tárolódik.
- Az `agent_run_steps` jelenleg tartalmazza a művelet bemenetét, de nincs tartós végrehajtási állapota vagy atomikus foglalása.
- Éles, csak olvasásos sémaellenőrzés: a két naplótáblán RLS aktív; a felhasználó csak saját futásainak naplóját olvashatja. A lépéssorszám futásonként egyedi. Ezeket a szabályokat megtartjuk.

## Végrehajtási sorrend
### P0/A – Tartós jóváhagyás és egyszeri végrehajtás
1. A jóváhagyási kérés a meglévő `agent_run_steps` egy `approval` sorában rögzül. A sor UUID-ja lesz a szerveroldali műveletazonosító; tulajdonosa az `agent_runs.user_id`.
2. A szerver tárolja az eredeti eszközt, pontos végrehajtási paramétereket, agentet, jóváhagyási szintet, az eszközszerződés lenyomatát és lejáratot. Érvénytelen JSON vagy nem rögzíthető bemenet esetén nincs jóváhagyási kártya és nincs írás. Megváltozott eszközszerződéshez új jóváhagyás kell.
3. Jóváhagyás, elutasítás és állapotlekérdezés hitelesített szerverfüggvényen történik. A döntési kérés csak műveletazonosítót, döntést és veszélyes műveletnél a meglévő gépelt megerősítést fogadja; eszköz, paraméter, felhasználó és beszélgetés-előzmény nem küldhető végrehajtási utasításként.
4. A szerver minden döntésnél újraellenőrzi a munkamenetet, tulajdonost, aktuális szerepkört, agentelérést és registry-jogosultságot. Az üzleti művelet továbbra is a felhasználó RLS-es kliensével fut.
5. Atomikus adatbázis-állapotváltás foglalja le a műveletet. Egyidejű vagy ismételt jóváhagyás nem indít új végrehajtást; elutasítás és jóváhagyás versenyét is ez rendezi.
6. A kliens által küldött `approvedToolCallIds` nem adhat többé végrehajtási engedélyt; a régi helyettesítő modellgenerálás megszűnik.

### P0/B – Megbízható eredmény és két meglévő chatfelület
- Állapotok: **Jóváhagyásra vár → Végrehajtás folyamatban → Sikeresen végrehajtva / Sikertelen**, illetve **Elutasítva / Lejárt**.
- A szerver ellenőrzi az eszköz eredményét. `{ok:false}`, hibaburok, régi `{error:...}` vagy hiányos végrehajtási bizonyíték nem siker. A Timothy- és Michael-eszközök jelenlegi eredményszerződése alapján célzottan ellenőrizhető visszaigazolást használunk, nem az AI szövegét.
- Michaelnél a meglévő Google-válasz és célazonosító ellenőrzése szükség esetén az érintett adapterben szigorodik; puszta HTTP-siker vagy hiányos válasz nem bizonyíték. Bizonyított „már a kívánt állapotban van” eredmény külön jelölést kap, nem állít új módosítást.
- A két felület közös állapot- és eredménykezelést kap. Jóváhagyás alatt a gombok letiltva; a frissítés a kezdeményező beszélgetést érinti akkor is, ha közben másik beszélgetés nyílik meg.
- Hálózati megszakadáskor: **„A végrehajtás eredménye még nem igazolt.”** Állapotellenőrzés ugyanarra az azonosítóra, új végrehajtás vagy modellhívás nélkül.
- A helyi beszélgetés csak megjelenítési gyorsítótár. Újranyitáskor a kártyák szerverállapotot kérdeznek le. Régi, tartós azonosító nélküli kártya nem végrehajtható; a helyi „approved” érték nem bizonyíték.

### P0/C – Visszakereshető napló
- A meglévő `agent_runs` és `agent_run_steps` napló megmarad.
- Jóváhagyási döntés, felhasználó, eredeti művelet, végrehajtási eredmény és biztonságosan megjeleníthető hiba a műveletazonosítóhoz kapcsolódik.
- A végrehajtás előtt kötelező a jóváhagyás és foglalás sikeres mentése; naplózási hibát nem nyelhet el a szerver.
- Titok-, token-, Authorization- és aláírt URL-adatok nem kerülhetnek bemenet-, eredmény- vagy hibalogba. Az üzleti paramétereket nem változtatjuk meg észrevétlen szűréssel: tiltott hozzáférési adatot tartalmazó jóváhagyási bemenet elutasításra kerül.

### P0/D – Ellenőrzés és lezárás
Izolált, TESZT-adatos vagy visszagörgethető SQL-próbák és determinisztikus végrehajtótesztek:
1. Sikeres jóváhagyás: eredeti paraméterek, egyetlen mellékhatás, nulla további modellhívás.
2. Elutasított és lejárt művelet: nulla végrehajtás.
3. Ismételt és párhuzamos jóváhagyás: legfeljebb egy végrehajtás.
4. Jogosulatlan felhasználó és időközben elvesztett jogosultság: tiltás.
5. Módosított paramétereket tartalmazó kérés: elutasítás.
6. Adatbázishiba a rögzítés vagy foglalás előtt: nulla mellékhatás.
7. `{ok:false}`, régi hibaválasz és kivétel: nincs sikerjelzés.
8. Hálózati megszakadás és ismeretlen korábbi eredmény: állapot-visszaolvasás, nincs megismételt írás.
9. Timothy meglévő megnyerési művelete és Michael meglévő jóváhagyásköteles művelete: izolált végrehajtás, éles lead/kampány nélkül.
10. Mindkét chatfelület jóváhagyás/elutasítás/újranyitás útja; régi kártyák biztonságos kezelése.

Teljes meglévő tesztsor, `bun run ai:acceptance`, fordítási visszajelzés. Fájlonkénti változáslista, migráció/rollback és PASS/FAIL/NEM TESZTELT jelentés, majd STOP. Hitelesített éles böngészőpróba hiánya nem helyettesíthető ál-hitelesített teszttel.

## Technikai terv – migráció és idempotencia
**Nem készül új tábla vagy párhuzamos végrehajtó.** A meglévő `agent_run_steps` jóváhagyási sorai bővülnek nullable mezőkkel:
- állapot, szerveridős lejárat, döntés időpontja és döntéshozó;
- végrehajtás kezdete/vége, egyszeri foglalási UUID;
- paraméterlenyomat és ellenőrzött eredmény/hibakód.

A forrásmodell-hívás azonosítója külön mezőben rögzül; a `(run_id, forrásmodell-hívás-azonosító)` pár jóváhagyási sorokra érvényes egyedi indexe megakadályozza ugyanazon javaslat kétszeri rögzítését. A két általános naplótábla státusz- és kind-korlátait nem bővítjük; a jóváhagyási életciklus külön mezőkre kerül.

Javasolt lejárat: létrehozástól **30 perc**, adatbázis-idővel ellenőrizve. A régi sorok mezői NULL maradnak, régi jóváhagyások nem válnak végrehajthatóvá.

Atomikus, szűkített RPC-k a jóváhagyási sor létrehozására, `pending → executing/rejected/expired` döntésre és a foglalási azonosítóhoz kötött lezárásra. Rögzítés után az eszköz, paraméterek, agent, tulajdonoshoz tartozó futás és lejárat nem írhatók át. Közvetlen kliensírás tiltva; új RPC-kre nincs anon/authenticated EXECUTE, csak ellenőrzött szerveroldali hívás. A meglévő SELECT RLS változatlan.

A külső Google-művelet és a naplómentés nem alkot közös tranzakciót. Ezért **legfeljebb egyszeri indítást**, nem minden meghibásodás mellett garantált pontosan egyszeri teljesülést vállalunk. Foglalás után megszakadó kérés nem kerül automatikusan újra sorba. Nem igazolt kimenet külön eredményjelzővel marad ellenőrzésre váró; új kérés csak állapotot olvas, nem ismétli a műveletet. Külső siker után meghiúsult naplómentés sem eredményez újrafuttatást vagy hamis sikert.

Az opcionális céladatokat is rögzíteni kell: például Michael kihagyott `customer_id` értékét a felhasználó aktuális kapcsolatából a jóváhagyási kártya létrehozása előtt oldjuk fel. Későbbi fiókváltás nem terelheti más célra a jóváhagyott műveletet. Ez kizárólag meglévő eszközparaméterek befagyasztása, nem új Ads-funkció.

## Hatáselemzés és visszaállítás
- Éles üzleti adatok, szerepkörök és üzleti RLS nem változnak; a bővítés a közös AI-napló életciklusát érinti.
- Migráció előtt pontos séma-, constraint-, grant- és policy-pillanatkép, előre elkészített SQL és rollback dokumentum szükséges.
- Függő és folyamatban lévő műveletek számlálása migráció/visszaállítás előtt és után. Futó művelet mellett destruktív rollback nem végezhető.
- Visszaállításkor először a végrehajtás letiltása, a P0-sorok és eredmények megőrzése/exportja; csak ezután új RPC-k/trigger/mezők célzott visszavonása.
- A hibás régi `approvedToolCallIds` végrehajtási engedélyt rollback sem állíthatja vissza: a jóváhagyásköteles írások inkább maradjanak tiltva.
- A rollback nem fordít vissza üzleti műveletet és nem töröl éles üzleti adatot.

## Várható fájlhatókör
- A kért öt fájl: `runtime.server.ts`, `runtime.functions.ts`, `ai-assistant.tsx`, `ai-panel.tsx`, `chat-shared.tsx`.
- Szükséges közös típus/napló módosítás: `types.ts`, `audit.server.ts`; kis AI OS jóváhagyási segéd és célzott tesztek ugyanitt.
- Kizárólag szükséges meglévő adaptereredmény/célparaméter-ellenőrzés; nincs új tool vagy üzleti RPC.
- Migrációs SQL, rollback, hatáselemzés, zárójelentés; `AGENTS.md` és `roadmap.md` követése.

**Jelen állapot:** csak vizsgálat és terv készült; alkalmazáskód, adatbázis és éles adat nem módosult. A terv jóváhagyása után indul a célzott megvalósítás.