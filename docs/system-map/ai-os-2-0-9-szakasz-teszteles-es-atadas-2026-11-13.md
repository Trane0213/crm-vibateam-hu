# AI OS 2.0 – 9. szakasz: kötelező tesztelés és átadás (2026-11-13)

## Döntések a 8. szakasz pontjaira
- **A:** a törölt dokumentum szövege megmarad az adatbázisban (az AI és a felhasználók nem érik el). Nem módosítottam.
- **B:** a közös AI-memória szabálya nem szigorodott.
- **C:** elkészült a `knowledge_ingest_runs` napló: ki, mikor, hány dokumentum, eredmény, dokumentumazonosítók, hiba. Owner olvassa, kliens nem írhat. Owner-kártyán az utolsó 5 indítás.

## A teszt által talált és javított hibák
1. **Új projekt-, cég- és ajánlatdokumentum feltöltése és átnevezése hibára futott** (a 2. szakasz triggere egy csak e-mail-mellékletnél létező mezőt is olvasott). 2026-11-03 óta nem volt ilyen feltöltés, ezért éles hibát nem okozott. Javítva (migráció).
2. **Sérült dokumentumról nem jött figyelmeztetés** (az értesítő 'failed' állapotot figyelt, a valós állapot 'error'). Javítva (migráció). A 2 már korábban hibás melléklet utólagos értesítést nem kapott.
3. **Azonos tartalmú fájl több helyen** (26 csoport, 65 dokumentum, főleg ismételt e-mail-mellékletek): a tudásbázis-keresés most egy találatot ad, a másolatokat forrásként felsorolja.

## Eredmények
Élő adatbázis-próbák visszavont tranzakcióban (nem maradt nyomuk); szerepkör-próbák valós felhasználói azonosítókkal, adatbázis-szintű jogosultságszimulációval.

| # | Teszt | Eredmény | Bizonyíték |
|---|---|---|---|
| 1 | Feltöltés és automatikus indexelés | PASS (javítás után) | feltöltés → sorba kerül → indexelve, 1 szövegrész; a javítás előtt FAIL |
| 2 | Módosított dokumentum új verziója | PASS | új verzió, régi elavult, 1 aktív verzió |
| 3 | Duplikált fájl | PASS | visszaállított azonos tartalom = korábbi verzió újraaktiválása; azonos hash helyben; keresésben másolatok összevonva (unit) |
| 4 | Szkennelt / túl nagy / sérült | PASS (javítás után) | szkennelt: ellenőrzést igényel + tájékoztatás; sérült: hiba + figyelmeztetés; túl nagy: unit + élő adat (18 db too_large) |
| 5 | George és specialisták közös forrás-visszakeresése | PASS (3. szakasz, élő) | George→Timothy, 30 ellenőrzött forrás; user-RLS-sel élőben NEM TESZTELT |
| 6 | Marketing, Sales, PM, Owner jogosultság | PASS | a tudásbázis pontosan a forrás szabályát követi: projektdokumentumot minden CRM-szerepkör lát (meglévő szabály), szerepkör nélküli fiók 0; napló: Owner 1, Sales 0, kliensírás tiltva |
| 7 | Strukturált jelentésátadás AI-k között | PASS (3. szakasz, élő + unit) | egységes jelentés, forrás-ellenőrzés |
| 8 | Kritikus esemény, azonnali értesítés | PASS | AI-kredithiba → kritikus, döntést igényel, Owner |
| 9 | Azonos esemény duplikációmentesen | PASS | 2 azonos hiba → 1 értesítés, 2× előfordulás |
| 10 | Óránkénti futás változás nélkül, AI nélkül | PASS | kikapcsolva: nem fut; 1. futás 53 jelzés, 2. futás 0 új, 0 AI-hívás |
| 11 | OpenAI-kredithiány / kiesés | PASS (szimulált + unit) | kritikus értesítés, közös keret leáll; érthető hibaüzenet; élő szolgáltatás most elérhető (próbahívás 200) |
| 12 | Napi/heti összesítők forráshűsége | PASS (6. szakasz, élő) | 15/21 ellenőrzött forrás, 0 nem ellenőrzött |
| – | Bejelentkezett felület (minden szerepkör) | NEM TESZTELT | a fejlesztői környezetben nem lehet bejelentkezni |

Automatikus tesztek: 865 PASS (88 fájl); AI acceptance 21/21; típusellenőrzés és build PASS.

## AI OS 2.0 – RÉSZBEN KÉSZ
| Terület | Állapot |
|---|---|
| Közös tudásbázis | **Működik** (élő adat, jogosultság igazolva); bejelentkezett felületen nem próbált |
| Dokumentumfeldolgozás | **Működik**, Owner-gombbal indítva; OCR nincs (szkennelt fájl „ellenőrzést igényel”) |
| AI-koordináció (George + specialisták) | **Működik** élő OpenAI-val; felhasználói jogosultsággal élőben nem próbált |
| Értesítési központ | **Működik** adatbázis-szinten; felület és élő frissítés nem próbált |
| Automatikus ellenőrzés | **Kód kész, kikapcsolva.** AI nélküli óránkénti gyűjtés működik bekapcsolva; a fizetős George-vizsgálat csak Owner-gombbal; automatikus fizetős futtatás külön jóváhagyásra vár |

Nyitott döntések: OCR, fizetős automatikus időzítés, bejelentkezett végigpróba szerepkörönként.
