# V2.1/C – ellenőrzési jelentés

## Elkészült
- Owner által szerkeszthető, közös sablonalapok a meglévő `settings` táblában, névtér szerint szűkített hitelesített szerverfüggvényekkel; kizárólag owner írás, validált mezők és atomi verzióütközés-védelem. Nincs új tábla/RLS/migráció.
- Sales ajánlatonkénti feltételei változatlanul a quote-ra mentődnek. Általános alapmentés nem ír át korábbi ajánlatot.
- Közös `QuotePrintDocument` a meglévő PDF/nyomtatási oldal és az élő A4-előnézet számára. Nem készült új PDF-motor. Az előnézet a helyi szöveg-, helyszín-, műszaki-, árazási és címváltozásokat mutatja; a print a mentett ajánlatot használja.
- Zárolt ajánlatnál a helyi draft-felülírás elutasított, az ajánlat szerkesztési korlátai és A/B védelmei változatlanok.
- Kézikönyv: `docs/manuals/ajanlatkezelo-v21-C-2026-11-03.md`.

## PASS
- Teljes Vitest regresszió 126/126, 23 fájl. Öt új szabályteszt: owner-only általános írás; Sales olvasás/szerepkör nélküli tiltás; meglévő feltétel megőrzése; ismert szakaszok; 4000 karakterkorlát.
- AI acceptance 12/12.
- Fordítás: build OK (14:57:42 és 14:58:44 UTC).
- Elkülönített, memóriában előállított TESZT-ajánlat böngészős próba: helyi feltétel/helyszín frissül; közös preview/print dokumentumszöveg egyezik; logó betölt; A4 alapméret 794 CSS px; 390 px oldalon nincs külső vízszintes túlcsordulás; JS-hiba nincs. Ez nem éles vagy bejelentkezett végigpróba. A tesztindító eltávolítva.

## NEM TESZTELT / nyitott
- Hitelesített owner sablonalap-mentés és másik Sales felhasználó általi visszaolvasás.
- Teljes TESZT ajánlat létrehozás → árak → feltételek → mentés → PDF → feltöltés → Gmail-küldés → utánkövetés.
- Valódi hosszú, többoldalas ajánlat PDF-tördelése és minden munkaterület integrált megjelenése.
- Blokkoló: external_unmanaged Supabase, nincs átadható hitelesített munkamenet; korábbi chatjelszó nem használható. Emiatt a modul még nem minősül teljesen véglegesnek.

## Adatvédelem és STOP
Éles adat, e-mail, fájl, Gmail-hozzáférés és szerepkör nem módosult. Publikálás nem történt. Visszaállítás és hatás: `ajanlatkezelo-v21-C-hatas-2026-11-03.md`. Következő lépés kizárólag jóváhagyott, biztonságos TESZT végigpróba.