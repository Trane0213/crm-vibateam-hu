# Marketinges teljes munkanap – read-only audit (2026-11-06)

Semmi nem módosult. Forrás: éles RLS-szabályok, éles darabszámok, kód.

## Jogosultság (marketing szerepkör, éles RLS)
| Terület | Olvas | Ír |
|---|---|---|
| Cégek, kontaktok | igen | létrehoz + szerkeszt |
| Hívások | igen | létrehoz + szerkeszt |
| Leadek | igen (mind) | létrehoz; szerkeszt csak `new` státuszban |
| Utánkövetések | igen | **NEM** (followups_write: owner/pm/sales) |
| Találkozók | igen | **NEM** (insert/update: owner/pm/sales) |
| Feladatok | igen | **NEM** |
| Levélszálak | csak hozzáférési jog szerint | csak saját hozzáférésű szál |

## Adatállapot
446 cég; 2427 cég nélküli levélszál; 18 weboldali igény; **1 hívás összesen, 0 nyitott visszahívás**; felhasználók: 3 marketing, 1 owner, 1 sales.

## Hibalista
- HIÁNYZIK (P1): marketinges nem rögzíthet utánkövetést, találkozót, feladatot – egész napos munkához ez a fő akadály. Döntés kell (M2).
- HIÁNYZIK (P1): weboldali igény adatlapon nincs „minősítés / átadás Sales-nek” – csak megjelenítés (M3).
- HIBÁS/HIÁNYOS (P2): 2427 cég nélküli + Viba-Teamhez tévesen kötött szálak → levelezési kép és válaszmutató hiányos (M4).
- KÉNYELMI (P2): Hívások, Cégek, Kapcsolattartók csak „Továbbiak” alatt (M1).
- KORLÁT (P3): napi lista 1000 sornál részleges (M5).
- GYAKORLAT: 1 hívás a rendszerben – a hívásrögzítést a marketing gyakorlatilag nem használja.

## Nem tesztelhető
Bejelentkezett marketinges munkanap-próba: a projekt munkamenete nem injektált (`external_unmanaged`), marketinges TESZT-fiók jelszavát nem kérem chatben. Gmail-csatlakozás szerepkörönként nem ellenőrizhető a token-oszlopok védelme miatt.
