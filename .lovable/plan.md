# Közös ügyjegyzék: célzott bővítés jóváhagyása

## Ellenőrzött kiindulópont
- A korábbi hibajegytároló már alkalmazva lett a korábbi jóváhagyással. Friss Supabase SELECT: `issue_reports` létezik, **0 jegy**, saját/Owner olvasási és Owner státuszírási RLS aktív. Nem hajtjuk végre újra a régi CREATE TABLE-t.
- A négy kereshető szerepkörsúgó, George megnyitása és a korábbi működésihiba-beküldés megmarad.
- A friss súgó jelenleg nincs George eszközeként bekötve. Nincs jogosult technikai naplóolvasója. A meglévő gyökérhiba-kezelő csak opcionális Lovable-eseményhorgot hív; ennek tényleges telemetria-hozzáférése nem igazolt.
- Nem találtunk telepített Sentry vagy más külső monitoringot; nincs itt hozzáférhető Sentry-kapcsolat.

## Most elkészült, nem színlelt felület
`/help`: négy kategória választása, saját szavas leírás, elvárt/tapasztalt eredmény és opcionális hibakód. A működési hiba a már engedélyezett úton menthető. Használati kérdés, UX-probléma és fejlesztési igény előkészíthető, de **külön kategóriaként még nem menthető**; ezt az oldal jelzi és nem küld megtévesztő régi hibajegyet. Nincs automatikus AI-hívás. Oldalváltáskor a nem mentett szöveg nem tárolódik.

## Kért adatbázis-jóváhagyás
**Csak a meglévő egy tároló bővítése**, nincs második tábla és nincs üzleti tábla módosítása.
Pontos, még nem alkalmazott SQL: `database/issue_reports_extension_proposal_2026-11-06.sql`.

- Kategória: használati / működési / UX / fejlesztési; a bejelentő választása külön az ember által megerősített besorolástól.
- Bizonyítottság: igazolt / nem igazolt / nem vizsgálható. Súlyosság kezdetben nem értékelt, nem AI által kitalált.
- Üzleti hatás, reprodukció, szerver által generált korrelációazonosító, kezelő, időpontok, megőrzött eredeti jegy és duplikációs kapcsolat.
- Fejlesztési állapot: nem értékelt / javasolt / jóváhagyott / halasztott / elutasított. Becslés csak kifejezett emberi forrásindokkal, különben üres.
- Fenntartott AI-javaslat és vizsgálati lépések, valamint külső esemény/fingerprint/build mezők **inaktívak** a későbbi jogosult bekötésig; a kliens nem írhatja őket.
- Elvárt/tapasztalt eredmény opcionális lesz: egy természetes nyelvű leírás önmagában elég a használati kérdéshez vagy javaslathoz.

## Jogosultság és adatvédelem
- Saját/Owner RLS megtartva; anon tiltva. Eredeti bejelentő/szerepkör/idő/útvonal/leírás/kategória immutable; Owner csak értékelést és kezelési állapotot módosít.
- Az Owner sem állíthat forrás nélküli „igazolt” állapotot; emberi vizsgálati megjegyzés kell. Ez nem automatikus technikai igazolás.
- Belső duplikációs link csak azonos bejelentőn belül látható; önlink/ciklus tiltott. Különböző dolgozók ismétlődése Owner-only összesítésben csoportosítható később, idegen jegyazonosító átadása nélkül.
- Nincs automatikus diagnózis, lezárás, küldés, publikálás, szerepkörmódosítás vagy kódjavítás.

## Hatás és visszaállítás
Additív bővítés; meglévő jegyek maradnak működési hiba/nem igazolt/nem értékelt állapotban. Most 0 sor, de alkalmazás előtt új darabszám és sémaellenőrzés szükséges.
Visszaállítás: visszatérés a jelenlegi UI/server útvonalhoz; az új oszlopok megtartása, új Owner UPDATE oszlopjogok visszavonása és a korábbi guard törzs visszaállítása célzott, külön jóváhagyott migrációval. **Nincs DROP TABLE vagy új jegyek törlése**. Ez adatmegőrző működési rollback; nem az új információt megsemmisítő teljes séma-visszavonás.

## Jóváhagyás után megvalósítandó
Mind a négy kategória mentése/readback; saját/Owner szűrés, Owner értékelés és fejlesztési lista a meglévő `/help`-en. Gyakoriság csak mentett jegyszámokból, becslés üres, amíg ember nem adja meg. Súgóval megoldott ügy megmarad. George read-only szerepkörsúgó-hozzáférését külön, az AI OS meglévő eszközeivel kell bekötni és tesztelni; Timothy/Scarlet működése változatlan.

## Külső hibagyűjtés: külön kapu, most nem aktiválódik
**Egy javaslat: Sentry**, böngésző- és szerverhibákhoz. Ez a tervkártya kizárólag az ügytároló bővítését engedélyezi; Sentryt nem kapcsol be.
Kapcsolat létrehozásának helye: https://lovable.dev/connectors/sentry/connect?workspace=Yowmw6f3nnUPUA3oJByl

Külön bekötési tervben: kifejezett opt-in, kikapcsolható gyűjtés; nincs replay/tracing, request body/URL query/header/cookie/user/DOM/breadcrumb vagy nyers hibaszöveg/üzleti érték. Engedélyezett csak normalizált útvonalminta, allowlistelt hibakód, véletlen korrelációazonosító, fingerprint és build-verzió. DSN kapcsolaton keresztül, szerver credential soha nem böngészőben. Adatmegőrzés/szolgáltatói költség külön egyeztetendő.

Egyszeri, nem tolakodó hibakódos segítségfelkérés és read-only korrelált diagnosztika **NYITOTT**, nem aktiválódik hitelesített eszköz nélkül. Fejlesztői Sentry MCP hozzáférés nem azonos George alkalmazásbeli jogosultságával. AI vizsgálat később csak explicit kérésre: javasolt ad-hoc limit napi 5/user, azonos korrelációra egyszer, legfeljebb 3 olvasási ellenőrzés; ez külön implementációs jóváhagyást igényel, nincs standard backend limiter.

## Ellenőrzések és STOP
- 791 unit teszt PASS, build OK.
- Négy szerepkör desktop/mobil TESZT-próba: kategóriakapu/szövegmegőrzés/nincs automatikus beküldés PASS.
- Pontos SQL-javaslat csak izolált PostgreSQL-en: négy kategória/role, saját/idegen/Owner/anon, hamis igazolás tiltása, becslésforrás, eredeti adatvédelem, ön-duplikáció tiltás PASS.
- Éles bejelentkezett mentés, tényleges error-boundary felkérés, külső anonimizálás és AI téves pozitív/negatív diagnosztika **NEM TESZTELT / NYITOTT**. Nem állítjuk, hogy diagnózis működik.

**Első szakasz RÉSZBEN KÉSZ. Jóváhagyod a pontos meglévő ügytároló-bővítést?**