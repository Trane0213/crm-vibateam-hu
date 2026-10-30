# VIBA CRM – Teljes Sales E2E jelentés (2026-10-30)

Fiók: viktor.csotai@gmail.com (Sales). Böngésző: Playwright, 1280×1800. Minden mentés DB-visszaolvasással.

| # | Lépés | Eredmény |
|---|---|---|
| 1 | Bejelentkezés, Sales menü | PASS |
| 2 | D2-1 Pipeline kártya: „Nettó ajánlat: 200 000 Ft (piszkozat)” | PASS |
| 3 | D2-2 „Megnyitás Workspace-ben” → `/leads?lead=43b05791…`, a kért lead nyílik | PASS |
| 4 | Státuszváltás Ajánlat kiadva → Utánkövetés → Szerződés | PASS (toast + DB) |
| 5 | Megnyerés + projekt (PM: Viktor, indulás 2026-10-30) | PASS – lead `won`, won_at DB-ből; projekt 3c69f3f3…, status `atadas`, 1 ajánlat + 2 utánkövetés automatikusan a projekthez kötve; oldal újratöltés után megmarad |
| 6 | Elveszett ág külön TESZT leaden (8a13d658…): Pipeline-ba → Elveszett (indok: ár) | PASS – status `lost`, lost_at DB-ből, lost_stage `quote_prep` |
| 7 | D2-3 Utánkövetések „Ügyfél” oszlop | PASS – cégnév látszik |
| 8 | Ajánlatok lista, cég adatlap (Projektek 1, Ajánlatok 1, Leadek 2) | PASS |
| 9 | Sales súgó = teljes kézikönyv (`/help/sales`) | PASS (újraellenőrizve) |

## Talált és javított hiba
- Sales munkafelület dosszié: betöltés közben „Cég nélkül / Nincs cég hozzárendelve” jelent meg (első futásnál tartósan látszott a képernyőképen). Javítva: betöltés közben „Betöltés…”.

## Ismert, nem javított (döntés kell / nem hatókör)
- Projekt oldal érték: „0 Ft” (projekt érték mező nincs kitöltve, az ajánlatból nem számol).
- Cég adatlap „Utókövetés (0)”: csak nyitott utánkövetést számol, a lezártakat nem.
- D2-4: „Ajánlat kiadva” piszkozat ajánlattal is engedett (dokumentálva, nem módosítva).

## NEM TESZTELT
- Ramon saját belépése; marketinges szerepkör ugyanezen az úton.

## TESZT adatok maradtak
- Lead 43b05791… (won) + projekt 3c69f3f3…, TESZT ajánlat, utánkövetések.
- Lead 8a13d658… (lost) + 1 TESZT hívás-utánkövetés.
