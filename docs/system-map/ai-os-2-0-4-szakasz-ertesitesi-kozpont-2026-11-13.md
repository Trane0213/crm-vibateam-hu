# AI OS 2.0 — 4. szakasz: Egységes értesítési központ (2026-11-13)

Állapot: **RÉSZBEN KÉSZ** — adatbázis-oldal, események, jogosultság és felület kész; bejelentkezett felületi próba NEM TESZTELT.

## Felépítés
- `crm_notifications`: egyetlen eseménytár (kategória: AI / dokumentum / üzleti / rendszer / visszajelzés; súlyosság; döntést igényel; hivatkozás; forrásrekord; címzett szerepkörök vagy felhasználó; ismétlésszám; lezárás).
- `crm_notification_reads`: saját olvasottság.
- Írás kizárólag adatbázis-triggerekből (`crm_notify`, egyedi `dedupe_key`); kliens nem írhat, a belső függvény nem hívható.
- Láthatóság: címzett ÉS a forrásrekord a néző saját jogosultságával látható. Webes ajánlatkérésnél nincs személyes adat.
- Kézbesítés: Owner azonnal csak kritikus/döntést igénylő; a többi „Napi összesítőbe” (6. szakasz). Más szerepkörnél a figyelmeztetés is azonnali. Csak CRM-en belül, email nincs.

## Események
| Esemény | Címzett | Jelleg |
|---|---|---|
| Új hibaközpont-bejelentés | Owner | döntést igényel; triázskor lezárul |
| Javítás kész, próbáld ki | bejelentő | döntést igényel; visszaigazoláskor lezárul |
| Bejelentői visszaigazolás | Owner | „nem oldódott meg” = döntést igényel |
| George-vizsgálat elkészült | kérő | AI-megállapítás |
| Hozzád rendelt ügy | új felelős Sales | figyelmeztetés (saját magának nem) |
| Megnyert / elvesztett ügy | Owner | napi |
| Igazolt ajánlatkiküldés | Owner | napi |
| Új weboldali ajánlatkérés | Owner + Marketing | döntést igényel; feldolgozáskor lezárul |
| Dokumentum ellenőrzést igényel / sikertelen | Owner | napi; sikeres újrafeldolgozáskor lezárul |
| Elfogyott OpenAI-egyenleg | Owner | kritikus, naponta 1 összevont |
| Egyéb AI-futási hiba | Owner | napi, agentenként összevont |

Egyszeri felvétel: 1 nyitott bejelentés + 28 ellenőrzést igénylő dokumentum. Üzleti adat nem változott.
Gmail-szinkronhibák (130 687 hibás futás) szándékosan nem kerültek be egyenként — az 5. szakasz összevont ellenőrzése kezeli.

## Tesztek
- 835 unit teszt PASS (11 új: kézbesítési szabály, számláló, hivatkozás-védelem); 21 acceptance PASS; TypeScript PASS; build OK.
- Visszagörgetett DB-próba: hozzárendelés → csak az új felelős látja; kredithiba 2× → 1 kritikus jelzés, 2 előfordulás; webes TESZT-kérés → Owner + Marketing látja, Sales/PM nem; javításellenőrzés → csak a bejelentő; dokumentumok → csak Owner; dokumentum újrafeldolgozás és triázs → automatikus lezárás; idegen nevében olvasottság, kliensírás és belső függvényhívás → tiltva. PASS.
- NEM TESZTELT: bejelentkezett csengőmenü és /notifications oldal, élő valós idejű frissítés.
