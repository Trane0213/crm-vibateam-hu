# VIBA CRM – Munkakörönkénti egyszerűsítési terv (2026-11-15)

Közös minta minden munkakörnek: **Ma oldal → „Következő teendő” kártya → egy gomb**; legfeljebb 5 fő menüpont; részletek „Szakértői beállítások” alatt; a beépített asszisztens az adott rekord kontextusával nyílik (URL alapján, a felhasználó saját jogával). Látványterv: `/mnt/documents/ux-latvanyterv/` (01–03).

## 1. Értékesítő (első szakasz)
- Most: Ma → Pipeline → lead → ajánlatlista → ajánlat 4 fül → külön AI-oldal.
- Terv: Ma (következő teendő + mai feladatok + Timothy javaslata) → ajánlat egy oldalon (prototípus kész).
- Timothy-pontok: ajánlat 2. lépés (gyorsparancsok, saját utasítás), lead adatlap („mi a következő lépés”), Ma kártya.
- Feladatok: [kész] ajánlat egyszerű nézet, Timothy előtöltés; [hátra] Ma oldal egy kártyás fejléc, menü 5 pontra, egyszerű nézet alapértelmezetté tétele.
- Kockázat: díjtörzs nélkül Timothy nem áraz (D4–D5). Elfogadás: új ajánlat ≤3 művelet, 0 fülváltás, mobilon vízszintes görgetés nélkül.

## 2. Tulajdonos
- Terv: Ma (OwnerKpiStrip + „Most ezzel kezdj” már létezik) — jóváhagyásra váró tételek egy listában; Beállítások és Ellenőrzések szakértői nézetben.
- AI: George a Ma oldalon; Michael marad Owner-only.
- Elfogadás: napi jóváhagyások egy képernyőről, ≤2 kattintással.

## 3. Projektvezető (második szakasz)
- Terv: Ma (ma induló / késésben / jóváhagyásra vár + következő teendő) → projekt napi lap; Feladatok és Találkozók a projekten belül.
- AI: Boss a projekt adatlapon a projekt kontextusával.
- Elfogadás: tegnapi jelenlét jóváhagyása ≤2 kattintás a Ma oldalról.

## 4. Marketing
- Terv: Ma → Érdeklődők / Weboldali igények; hívás és email a lead adatlapon.
- AI: Scarlet a lead adatlapon. Kampányküldés továbbra is külön jóváhagyással.

## 5. Admin / pénzügy
- Terv: külön menücsomag a meglévő `admin` szerepkörhöz (csak láthatóság): Jelenlét, Kifizetések, Dokumentumok.
- Függőség: számla/bank adatkapcsolat nincs (korábbi döntés), ezt nem pótoljuk.

## Fejlesztési sorrend (szakaszonként STOP és tulajdonosi jóváhagyás)
1. Ajánlatkészítés + Sales Ma (prototípus átvétele után alapértelmezett nézet)
2. Projektvezető és terepi munka
3. Marketing, admin/pénzügy, tulajdonos

## Kockázatok, függőségek
- Bejelentkezett éles próba nem érhető el (izolált TESZT-próbák csak) — D1.
- Díjtörzs (D4–D5) nélkül az automatikus árazás csak hiánylistát ad.
- A régi részletes nézet megmarad, amíg az új nincs elfogadva — nincs párhuzamos mentési/küldési út.
