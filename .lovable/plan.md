# Sales és Marketing új frontend – teljes tervcsomag (csak tervezés)

Cél: egy összefüggő csomag az új, munkavégző Sales és Marketing felülethez. Az élő CRM-ben semmi nem változik (adat, jogosultság, felület, publikálás). A végén STOP, bemutatás jóváhagyásra.

## Alapelv
Az AI előkészít, és csak a már engedélyezett műveleteket hajtja végre. A felhasználó ellenőriz, módosít, jóváhagy. Ami ehhez hiányzik, azt „fejlesztendő” jelöléssel mutatjuk, nem kész automatizmusként.

## Leadandók
1. **Frontend–backend függőségi audit** – minden fő funkcióhoz: oldal és komponens fájllal, használt táblák/RPC-k/szerverfüggvények, külső API-k és AI-eszközök (Timothy, Scarlet), frontendben lévő üzleti logika, jogosultsági ellenőrzések. Három osztály: változatlanul használható / átalakítandó / hiányzik. Forrás: kódkeresés és csak olvasó lekérdezések.
2. **Új frontend architektúra** – új navigáció (Sales és Marketing munkaterület), közös komponensrendszer, a munkaterület a feladathoz igazodik. Öt egységes állapotjelzés: automatikusan kész / ellenőrizendő / hiányzó vagy bizonytalan / jóváhagyásra vár / befejezett és dokumentált. AI-eredmények a munkaterületen, nem csak chatben; ugyanaz az egy AI OS és jóváhagyási réteg.
3. **Teljes képernyőterv a két munkakörhöz**
   - Sales: érdeklődő → ügyfél → ajánlat (kapott Excel árazott táblája külön, saját VIBA-ajánlat külön) → kiküldés → utánkövetés → szerződés-előkészítés → tulajdonosi jóváhagyás → projektátadás.
   - Marketing: kampányterv → tartalom → jóváhagyás → ütemezés → publikálás → eredmény → érdeklődő átadása; Scarlet beépítve.
   - Asztali és mobil látványtervek.
4. **Kattintható prototípus** (önálló HTML, kitalált TESZT-adat, nincs hálózati hívás) a fenti valódi folyamatokkal; a meglévő prototípusra építve, a valódi Pipeline-szabályokkal.
5. **Működő vs. fejlesztendő** funkciók táblázata (pl. tartalomnaptár, kreatívtár, közösségi publikálás, Meta-mérés, szerződés-adatmodell, e-aláírás, ártörzs, tartós kalkulációmentés, nagyfájl-feldolgozó).
6. **Szakaszos, visszaállítható lecserélési terv** – új felület a régi mellett, kapcsolóval; szakaszonként visszaállítás és átvételi feltétel; meglévő írási útvonalak és jogosultságok változatlanok.
7. **Önellenőrzési jelentés** – 7 forgatókönyv végigjárása Playwrighttal a prototípuson (Excel árazás, saját ajánlat, kiküldés+utánkövetés, szerződés+jóváhagyás, weboldali érdeklődő, tartalom+jóváhagyás, kampány+eredmény), talált ellentmondások javítva; fennmaradó kockázatok. Kifejezetten jelölve: a prototípusteszt nem igazolja az éles működést.

Végül egy összesített üzleti döntési lista (csak valódi döntések), PDF és a Fájlok között egy mappa.

## Technikai részletek
- Kimenet: `docs/system-map/sales-marketing-frontend-csomag-2026-11-15/` (audit, architektúra, lecserélési terv, önellenőrzés .md) és `/mnt/documents/sales-marketing-frontend-csomag/` (PDF, prototípus HTML, képernyőképek).
- Audit: `rg` a `src/routes/_authenticated`, `src/components`, `src/lib` alatt; `*.functions.ts`, `supabase.rpc`, `.from(` hívások; AI OS eszközlista és agent-jogosultságok; csak olvasó DB-lekérdezések.
- Nincs migráció, nincs kódváltozás az alkalmazásban, nincs publikálás.
