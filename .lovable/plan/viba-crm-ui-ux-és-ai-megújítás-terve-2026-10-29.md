# VIBA CRM – UI/UX és AI megújítás terve

Képernyőtervek a Fájlok között: `ui-terv/1_asztali_sales_ma.jpg`, `ui-terv/2_asztali_projekt_ai_osszecsukva.jpg`, `ui-terv/3_mobil_ma_es_ai.jpg`.

## 1. UI/UX audit – mai állapot
| Terület | Probléma | Hatás |
|---|---|---|
| Menü | 6 csoport, kb. 20 menüpont, szerepkörönként eltérő sorrendben | Nehezen tanulható, sok görgetés |
| Kezdőoldal | Szerepkörönként más felépítés (Ma, PM Today, marketing munkafelület) | Nincs közös kezelési logika |
| AI | Az asszisztensek külön oldalon vannak, oldalváltáskor a beszélgetés elvész | Ritkán használják, nem látja, min dolgozol |
| Fejléc | Az ajánlat-pulzus csíkja, a gyors hozzáadás menü és az értesítések szétszórtan helyezkednek el | Vizuális zaj |
| Táblázatok | Sima listák, nincs mentett szűrő, mobilon vízszintesen kell görgetni | Telefonon nehezen használható |
| Adatlapok | Sok, azonos súlyú kártya és 10+ fül (projekt) | Nem látszik, mi a következő lépés |
| Visszajelzés | Toastok vannak, de üres és betöltési állapot sokszor nincs | Bizonytalanság |
| Arculat | A színek közel vannak a weboldalhoz, de a betűk és a „villamos” jelleg hiányzik | Nem érződik VIBA-márkának |
| Mobil | Asztali elrendezés összenyomva, nincs alsó navigáció | Terepen alig használható |

## 2. Designrendszer (a vibateam.hu alapján)
- **Színek:** sötét navy `#0a1530` (oldalsáv, fejlécek), villamoskék `#1a8cff` (elsődleges), cián ragyogás `#33b5ff` (kiemelés, AI), világos munkaterület `#f6f8fb`. Státuszszínek: zöld, borostyán, piros, finoman tompítva. Sötét mód ugyanezekkel a tokenekkel.
- **Betűk:** Space Grotesk a címekhez és a nagy számokhoz, Inter a szövegekhez (a weboldal betűpárja).
- **Formák:** 14 px-es lekerekítés, puha árnyék, vékony keretek; a kártyák ritmusa 8 px-es rácsra épül.
- **Mozgás:** 150–200 ms-os átmenetek, finom cián „feszültség” ragyogás az AI-n és az aktív elemeken. A mozgáscsökkentési beállítást tiszteletben tartja.
- **Közös elemek:** KPI-kártya, feladatsor, státusz-lépésjelző, adattábla (szűrő, rendezés, mobilon kártyanézet), üres és betöltési állapot, megerősítő ablak.

## 3. Közös kezelési logika minden szerepkörnek
```text
[Oldalsáv]  [Felső sáv: munkafelület-váltó | keresés ⌘K | + Új | értesítés | profil]  [AI-panel]
            [Munkaterület: "Ma" → teendők → listák → adatlap]
```
- **Rövid menü (max. 6 pont) szerepkörönként:** Ma · Pipeline/Projektek · Cégek · Ajánlatok · Emailek · Továbbiak. A ritkán használt oldalak a „Továbbiak” alá kerülnek.
- **„Ma” oldal mindenkinek:** üdvözlés, 4 KPI-kártya, a mai teendők egy listában (feladat, utánkövetés és találkozó együtt), egy kattintásos műveletek.
- **Adatlapok:** fejléc státusz-lépésjelzővel, 3 fő kártya, idővonal az „Előzmények”-hez, alul műveletsor a „következő lépés” gombbal.

## 4. Állandó AI-panel
- **Asztali nézet:** jobb oldali, 380 px-es dokkolt panel. Összecsukva keskeny sáv George gombjával (2. kép). Állapota megmarad oldalváltáskor és újratöltéskor.
- **Beszélgetés:** a meglévő AI-beszélgetés táblákban tárolódik. Oldalváltáskor nem vész el, a panelen az előző beszélgetések is visszanyithatók.
- **Ügynökök:** George az alapértelmezett, mellette Scarlet, Timothy, Boss és Michael (Michael csak tulajdonosnak). Csak az jelenik meg, akit az adott szerepkör láthat; ezt a meglévő jogosultsági szabályok döntik el.
- **Kontextus:** a panel felismeri a megnyitott céget, leadet, ajánlatot vagy projektet. Ez egy „Kontextus: …” címkén látszik, ami kikapcsolható. A válasz a meglévő AI-eszközökön keresztül, a felhasználó saját jogosultságával olvas adatot, így senki nem lát többet, mint a CRM-ben.
- **Gyors javaslatok:** a kontextushoz illő 2–3 gomb, például „Foglald össze”, „Írj utánkövető e-mailt”, „Mi a következő lépés?”.
- **Mobilon:** alsó lapként nyíló, teljes magasságú panel, középső AI gombbal (3. kép).

## 5. Tulajdonosi munkafelület-váltó
- A felső sávban egy kapcsoló: **Vezetői · Marketing · Sales · Projektvezetés · Jelenlét**. Csak tulajdonosnak jelenik meg.
- A váltás csak a **nézetet** módosítja: a menüt, a „Ma” oldal tartalmát és az alapértelmezett AI-ügynököt. A tulajdonosi jogosultság és az adatbázis-szabályok nem változnak.
- A választás eszközönként megmarad. Egy kis címke mutatja: „Sales nézetben vagy”.
- A többi szerepkör a saját munkafelületét látja, és nincs nézetváltója.

## 6. Mobil és tablet
- Telefonon alsó navigáció 5 elemmel és középső AI gombbal; a táblázatok helyén kártyalista, nagy érintési felületek.
- Tableten összecsukott, csak ikonos oldalsáv; az AI-panel fedőrétegként nyílik.

## 7. Megvalósítás lépésenként
Minden lépés után: fordítás, jogosultsági és AI-ellenőrző tesztek, böngészős regressziós kör, és a te jóváhagyásod.
1. **Designrendszer:** színek, betűk, alapelemek. Csak megjelenés, logika nem változik.
2. **Keret:** új oldalsáv, felső sáv, mobil alsó navigáció.
3. **Állandó AI-panel:** dokkolás, megmaradó beszélgetés, ügynökváltó, kontextus. A régi AI-oldal csak ezután szűnik meg.
4. **Tulajdonosi nézetváltó.**
5. **„Ma” oldalak** egységesítése (vezetői, marketing, sales, PM, jelenlét).
6. **Listák és táblázatok** (cégek, leadek, ajánlatok, projektek, utánkövetések), mobil kártyanézettel.
7. **Adatlapok** (cég, lead-munkafelület, ajánlat, projekt), lépésjelzővel és műveletsorral.
8. **Végső teljes körű teszt** szerepkörönként, asztalon és mobilon, majd jelentés.

## 8. Mi nem változik
Üzleti szabályok, megnyerési és pipeline-védelmek, adatok, Gmail-kapcsolat, jogosultságok, AI Operating System (az ügynökök neve, jogai és modellje). Nem épül párhuzamos rendszer; a régi felületek elemei egyenként cserélődnek.

## Technikai részletek
- A tokenek a `src/styles.css` fájlban vannak (oklch, `@theme inline`), a betűk a `__root` linkjeiből töltődnek; csak shadcn-variánsokat használunk.
- Az AI-panel a meglévő AI OS futtatót és szálkezelést (`ai_threads`, `ai_messages`) használja. A kontextust az útvonal-paraméterekből építjük, és csak azonosítóként adjuk át; az adatot az ügynök a meglévő, RLS-sel védett eszközökkel olvassa. A provider és a modell (OpenAI `gpt-4o-mini`) változatlan.
- A nézetváltó egy kliensoldali `viewAs` állapot. Csak a navigációra és a kezdőoldalra hat, a jogosultság-ellenőrzés továbbra is a valódi szerepkörre épül. Ehhez egységteszt is készül.
- A meglévő élő frissítés, a lead-mentési útvonalak és a jogosultsági tesztek változatlanok maradnak; minden lépés után lefutnak.
