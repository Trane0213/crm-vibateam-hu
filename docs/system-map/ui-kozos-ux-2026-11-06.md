# Közös használhatósági kör – 2026-11-06 19:09 UTC

## Elkészült
- Marketing/Sales munkasáv teljes feladatnevekkel, jól megkülönböztetett aktív oldallal.
- Közös fejlécek, billentyűzetfókusz, 150–180 ms belépési/fülváltási mozgás; csökkentett mozgásnál animáció nélkül.
- Közös listák szerkesztés/törlés ikonjai megnevezettek, késleltetett tooltip; konkrét új/szerkesztő címek, mobil ablakmagasság.
- Ajánlatlistán kereső és állapotszűrő megnevezés, meglévő verziókapcsoló checkbox, billentyűzettel elérhető ajánlatlink.
- Utánkövetés egységes név, állapotot jelző designrendszer-szűrők; kontakt/projekt megnevezések pontosítva.

## Érintett fájlok
`src/components/work-navigation.tsx`, `src/components/page-header.tsx`, `src/components/ui/button.tsx`, `src/components/ui/tabs.tsx`, `src/components/resource/resource-page.tsx`, `src/styles.css`, `src/lib/nav-config.ts`, `src/routes/_authenticated/quotes.index.tsx`, `src/routes/_authenticated/contacts.index.tsx`, `src/routes/_authenticated/projects.index.tsx`, `src/routes/_authenticated/tasks.tsx`, `src/routes/_authenticated/followups.tsx`.

## Ellenőrzés
- 779/779 Vitest, 78 fájl PASS; legutolsó harness build OK.
- Valódi signed-out hét útvonal `/auth`-ra irányít, nincs pageerror.
- Eredeti route tree, elkülönített TESZT-válaszok, minden külső írás blokkolva: Marketing/Sales `/emails`, Sales `/quotes`, Marketing `/contacts`, PM `/projects`, Marketing `/tasks` és `/followups`, 1440×1100 és 390×844 PASS; nincs pageerror vagy oldalszintű vízszintes túlfutás.
- Mappaváltás/keresés/Ma navigáció, aktuális/minden ajánlatverzió, ajánlatkeresés, tooltip, feladatszerkesztő visszatöltött értéke és Mégse, utánkövetési szűrő, reduced-motion PASS. Képernyőképek vizuálisan ellenőrizve; széles táblázatok továbbra saját keretükben görgethetők.
- A tooltippróba elsőként nem várta meg a késleltetést; a formapróba a kötelező csillag nélküli pontos mezőnevet kereste. Tesztvárakozás/szelektor helyesbítése után PASS; alkalmazáshiba nem igazolódott.

## Korlátok / STOP
- Valódi hitelesített CRM/Gmail/R2 és mentett readback **NEM TESZTELT** (`external_unmanaged`). TESZT-router nem éles jogosultsági bizonyíték.
- Nem teljes UI-lezárás: részletes adatlapok további elrendezése, korábbi kampány/adatminőség/AI és hitelesített ellenőrzési hiányok megmaradnak.
- DB, RLS, adatkapcsolatok, Sales/AI üzleti logika változatlan; nincs import, ügyfélküldés vagy publikálás.
- AGENTS kiegészítése méretkorlát miatt nem menthető; meglévő felhasználói szabály nem rövidült.