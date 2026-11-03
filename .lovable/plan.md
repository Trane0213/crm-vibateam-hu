# Timothy — kockázatalapú minőségbiztosítás

## Cél és kiindulópont
A meglévő Timothy általános hibaforrásainak megszüntetése, természetes magyar segítséggel és ellenőrizhető munkalépésekkel. Nem új AI-rendszer vagy teljes felületi átalakítás.

A legutóbbi 15 hitelesített próbából 8 PASS / 7 FAIL. Bizonyított hibák: leadazonosító cégazonosítóként, befejezett utánkövetés tervezettként, egyes időpontok téves átváltása, üres levéllista túlértelmezése, Owner szerepkör helyett „lead tulajdonosa”, hiányzó adatok kitalált magyarázata. Ez nem reprezentatív megbízhatósági mérés.

## Egyetlen összevont végrehajtási kör
1. **Kockázattérkép:** kérdés → értelmezés → eszköz → jogosultság → adat → értékelés → válasz → következő lépés → jóváhagyás/végrehajtás. Minden kategória bizonyított hiba vagy előzetes kockázat, üzleti súlyossággal és érintett funkciókkal. Többértelmű név, elírás, hibás paraméter, verzió/státusz, szinkron, kontextusváltás, adatvédelmi utasítás és ismételt végrehajtás is szerepel.
2. **Közös megelőzés:** egységes entitás- és paraméterellenőrzés; mentett kapcsolatokból feloldott cég/kontakt; állapot és időpont egyszeri értelmezése; jogosultsági magyarázat a tényleges szerepkörből; üres/részleges/nem ellenőrzött adat megkülönböztetése. A modell tévedését ne fedje el sikerüzenet vagy automatikus, más ügyre mutató találgatás.
3. **Segítőkész működés:** rövid, emberi magyar válasz; elakadáskor tisztázás és használható következő lépés. Ügykontextus megőrzése és korrekció kezelése mindkét meglévő chatben; a régi hibás állítás nem bizonyíték. Rövid állapotjelzés csak tényleges szerveroldali munkalépésből, tartalom és technikai napló nélkül. Jóváhagyás és végrehajtás továbbra is külön állapot.
4. **Tesztelés és mérés:** az alábbi katalógus elvárásait a mérés előtt rögzítjük, a javítás utáni eredményekkel nem írjuk át. Meglévő tesztek újrahasználása, érintett területek regressziója, reprezentatív modellpróbák és hozzáférhető szerepkörös TESZT-végigpróbák. Sikertelen/nem futtatott esetet nem jelölünk sikeresnek.

## 300 változatos forgatókönyv
| Kockázati csoport | Esetszám |
|---|---:|
| Szándék, természetes magyar, elírás, rövidítés, névazonosság | 40 |
| Azonosítók, kapcsolatfeloldás, paraméterek és lapozás | 40 |
| Ajánlatverzió, nettó összeg, státusz, forráshivatkozás | 35 |
| Teendők, befejezés, lezárt ügy, Budapest-időpont | 35 |
| Gmail-hozzárendelés, szinkron, részleges/hiányzó tartalom | 35 |
| Szerepkör, láthatóság, adatvédelem, rosszindulatú tartalom | 35 |
| Többfordulós kontextus, javítás, ügyváltás, segítség | 35 |
| P0, téves művelet, ismétlésvédelem, siker-visszaellenőrzés | 45 |
| **Összesen** | **300** |

Esetenként: azonosító, kockázat/súlyosság, bemenet és előfeltétel, elvárt eszköz/adat/viselkedés, ellenőrzés módja, tényleges eredmény, PASS/FAIL/NEM TESZTELT, bizonyíték. Nem 300 átfogalmazott azonos kérdés és nem 300 költséges modellhívás. A modellmintát kategóriák, normál/hibás/hiányos adatok és többfordulós esetek szerint előre választjuk ki; kis, függő mintából nem állítunk statisztikai megbízhatóságot.

## Elfogadás és rövid jelentés
- Külön mutató: technikai siker, tényszerű válaszhelyesség, CRM-adat/linkpontosság, teljes értékesítési feladatsiker, kritikus/jogosulatlan művelet és nem tesztelt arány; funkciónként, a nevező és tesztmód megadásával.
- **Legalább 95% tényhelyesség és feladatsiker** az előre rögzített valós Sales-készleten cél, nem előre igazolt eredmény.
- Kritikus jogosultsági, adatvédelmi, téves küldési vagy jóváhagyás nélküli végrehajtási hiba nem fogadható el. Nem tesztelt kritikus út lezárási akadály, nem nulla hiba bizonyítéka.
- Egy rövid összefoglaló: javított és fennmaradó hibakategóriák, valódi válaszok aránya, igazolt munkafolyamatok, hozzáférési/tesztkorlátok, szükséges döntés. STOP; publikálás csak külön jóváhagyással.

## Műszaki és biztonsági keret
Meglévő AI OS, közös chat és tesztkeret; új agent, párhuzamos modul, adatbázis vagy AI-memóriaírási jogosultság nélkül. Az olvasások user-RLS-esek, Gmail pontos fiók/ügy/szál alapján, P0 változatlan. Műveleti jelzés csak saját futás igazolt, tartalommentes metaadatából, nem a modell kitalált köztes szövegéből.

Éles ügyféladatot nem módosítunk, éles levelet nem küldünk. Végrehajtási próbák elkülönített vagy visszagörgethető TESZT-környezetben; levélküldés-szimuláció nem igazolt Gmail-kézbesítés. Nincs folyamatos modellfuttatás. Hitelesített mérés csak ténylegesen hozzáférhető munkamenettel; a korábban egyszer használatos belépést nem használjuk újra. Hiányzó munkamenet esetén az érintett próbák NEM TESZTELT állapotúak.

Visszaállítás: e kör közös ellenőrzési, válasz- és állapotjelzési változtatásainak visszavonása; üzleti adatok és biztonsági invariánsok változatlanok.