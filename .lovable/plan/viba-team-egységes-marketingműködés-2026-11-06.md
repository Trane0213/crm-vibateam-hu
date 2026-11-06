# VIBA-TEAM – egységes marketingműködés

## Cél és határok
A feltöltött 2026.11.06-i terv a következő körök közös célállapota. A meglévő CRM-et egységesítjük; nem készül új rendszer, párhuzamos cégnyilvántartás vagy küldőmegoldás. A teljes terv elfogadása nem engedélyez automatikus adatjavítást, jogosultságmódosítást vagy kampányküldést.

**Most jóváhagyásra: kizárólag a 0–1. kör összevont, csak olvasási ellenőrzése.** Minden további kör külön elfogadás után indul. Üzleti adatok, Gmail-hozzáférések, checkpointok és működő Sales/ajánlatfolyamatok megmaradnak; nincs automatikus publikálás.

## Mi van már meg, és mit kell ellenőrizni?
- Van Gmail–CRM importellenőrző nézet, lapozás, külön saját-Viba-Team kategóriák, szinkronhiány-riport és javított checkpoint-hibatűrés. Ezeket nem építjük újra; a történeti kapcsolatok helyessége és Pretor hiányzó időszakának teljes lefedettsége még nem igazolt.
- Van tartós kampánytervezet, mentés/szerkesztés/archiválás, címzett-ellenőrzés és öt minősítési csoport. A korábbi jelentés szerint a két kampánytábla jogosultságai szűkültek; az aktuális állapotot újra ellenőrizzük. A „prechecked” nem küldési engedély. Bejelentkezett teljes kampánypróba nincs igazolva.
- Van Marketing Ma, közös cégaktivitás, hívás, saját feladat/utánkövetés és meglévő Sales-átadás. A teljes napi ügyfeldolgozás és az átadás–átvétel–visszaadás lánca még ellenőrizendő.
- A marketingállapot jelenleg részben megjegyzésjelölésekből működik. A strukturált állapot és a kézbesítési állapot elkülönítése még feladat.
- Az előző import, névjavítás és megkeresésjelölés eredményeit nem tekintjük új ellenőrzés nélkül hitelesnek. Az e-mailből levezetett kontaktnevek nem igazolt személyazonosságok.

## 0–1. kör – először a bizonyítékok rendbetétele
1. A meglévő rendszertérképet célzottan frissítjük: cégek, kontaktok, kampányok, Gmail, napi feladatok, webes igények és Sales-átadás tényleges kapcsolatai; korábbi kész/nem tesztelt állapotok elkülönítése.
2. Az eredeti Excel, az import és a későbbi módosítások tételes összevetése cég-/kontaktazonosító szerint. A korábbi 203-as megkeresésszámot újraszámoljuk: cím, kontakt, cég és küldés külön darabszám, nem felcserélhető egységek. Ha az eredeti Excel nem hozzáférhető, az import egyezősége nem igazolt.
3. A három céges postafiók tárolt adataiból ellenőrizzük a tényleges SENT-bizonyítékot, a DRAFT-kizárást, a száltulajdonost és a pontos kontakt–cég egyezést. Viktor személyes Gmailje nem üzleti forrás. Beérkező levél önmagában nem bizonyítja, hogy egy korábbi hideg megkeresésre válaszoltak: ehhez azonos fiókhoz tartozó szál és időrendi bizonyíték kell.
4. Szétválasztjuk: bizonyított megkeresés; piszkozat/nem igazolt küldés; igazolt szálbeli válasz; bizonytalan cég/kontakt; lehetséges ismétlés; hiányos történet. A Pretor 2026.09.07–10.29 időszakban a CRM-beli hiány nem bizonyít Gmail-beli levélhiányt. Backfill, tokenfrissítés és checkpointírás nem része ennek a körnek.
5. Ellenőrizzük a jelenlegi kampányminősítés és a megjegyzések eltéréseit. Készül egy rövid, azonosítós kivétellista és javítási javaslat; nincs automatikus összevonás, névjavítás, relink vagy státuszátírás.
6. Megvizsgáljuk a korábbi visszaállítások pontosságát. Későbbi adatjavításhoz pontos régi/új értékpárok és azóta történt változásokat védő visszaállítás szükséges, nem általános név- vagy megjegyzésminta.

**Kimenet:** egy frissített kapcsolati térkép és rövid számszerű bizonyíték-/hibajegyzék; automatizált ellenőrzések és a hozzáférhető olvasási felület próbája. Utána STOP. A tényleges javítás terjedelmét és érintett rekordjait külön jóváhagyásra mutatjuk be.

## További körök – csak az előző elfogadása után
### 2. Közös cégadatlap és marketingfolyamat
A meglévő cégadatlap, kontaktminőség, kampánytagság és eseménytörténet közösítése. Strukturált marketingállapot és ellenőrzöttségi/source információ; a régi jelölések átvezetése csak jóváhagyott, visszaállítható módon. Cégazonosító nem változik bizonytalan névegyezés miatt.

### 3. Kontrollált teljes kampány
A meglevő tervezetből kijelölt cégek/kontaktok, személyre szabott üzenet, ellenőrzés és jóváhagyás. Ütemezés csak engedélyezett postafiókkal, tiltás/leiratkozás/limit kezelésével, végső újraellenőrzéssel, tartós ismétlésvédelemmel és igazolt Gmail-eredménnyel. Bizonytalan kézbesítés nem indít vak újraküldést. Aktiválás és TESZT-küldés külön engedélyt igényel.

### 4. Intézhető napi munka és érdeklődésfeldolgozás
A meglévő Ma oldalon hívás, egyetlen visszahívás/utánkövetés, ügyfélválasz, webes igény, ellenőrizendő adat és kampányteendő. Minősített Sales-átadás forrással, releváns előzményekkel, következő lépéssel és felelőssel; átvétel/visszaadás a meglévő munkafelületen, célzott levéljogokkal. Új cég, hideg levél és válasz nem generál automatikus leadet.

### 5. Scarlet és közös elfogadás
Scarlet csak a jogosult, forrással alátámasztott CRM-adatokból dolgozik; a meglévő AI OS, modell, eszközök és jóváhagyások maradnak. Windsor.ai nem része e körnek. Teljes elfogadás: önálló kampány + beérkező érdeklődés + Sales-átvétel igazolt, szerepkörös végigpróbája.

## Műszaki ellenőrzések és kapuk
- Most: adatbázison kizárólag SELECT, nincs séma/RLS/migráció vagy szerveroldali küldés. A forrásellenőrzés nem élő adat- vagy működési bizonyíték.
- Konkrétan vizsgálandó: `campaign-precheck.server.ts` jelenleg `is_outbound` szerint minősít, nem kér le Gmail SENT/DRAFT-címkéket; Viktor tulajdonosát kizárja, de a három céges fiókra nem pozitív engedélylistával szűr. A `campaign-eligibility.ts` bármely bejövő találatot „replied”-ként kezel. Ezek kódban látható kockázatok, nem újonnan igazolt hibás rekordok.
- Újrahasználat: `relink-analysis.ts`, `relink-review.functions.ts`, kampánytervezet/előellenőrzés, közös cégaktivitás és Marketing Ma. Nincs párhuzamos adatmodell vagy napló.
- Módosító kör előtt: minimális hatáselemzés, pontos snapshot és rollback; csak érintett táblák/jogok, külön engedély. Teszt kizárólag TESZT-rekordokon.
- Körönként célzott szabályteszt, jogosultság- és nagylistás lapozásellenőrzés; kódváltozásnál regresszió és fordításellenőrzés. Bejelentkezett böngészős próba csak biztonságosan rendelkezésre álló munkamenettel. Nem futtatott, nem hozzáférhető vagy csak forrásból látott út: **NEM TESZTELT**, konkrét indokkal.
- Sem adatjavítás, sem migráció, sem Gmail-küldés, sem publikálás nem indul e teljes terv általános elfogadásából.