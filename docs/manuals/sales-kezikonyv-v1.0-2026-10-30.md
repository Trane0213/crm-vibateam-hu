# VIBA CRM – Sales munkatársi kézikönyv

**Verzió:** v1.0 · 2026-10-30 · Szerepkör: Értékesítő (Sales)
**Állapot:** élő böngészős végigteszt alapján (TESZT adatokkal), lásd `docs/system-map/sales-e2e-jelentes-2026-10-30.md`.

> Ez a kézikönyv a CRM-ben már meglévő Sales-folyamatot írja le. Új státusz, új menü vagy új átadási út nincs.

---

## 1. A Sales munka útja egy mondatban

**Marketing átadja a leadet → Sales munkafelületen felveszed a kapcsolatot → Pipeline-ba lépteted → ajánlat → utánkövetés → szerződés → Megnyerés + projekt (vagy Elveszett).**

| Szakasz | Hol dolgozol | Mi kell a továbblépéshez |
|---|---|---|
| Sales-előkészítés (státusz: Új / Kapcsolat alatt) | **Sales munkafelület** (`/leads`) | ≥1 rögzített aktivitás **és** kitöltött következő lépés |
| Pipeline (Ajánlat előkészítés → Ajánlat kiadva → Utánkövetés → Szerződés) | **Pipeline** menü | engedélyezett státuszváltás |
| Lezárás | Pipeline adatlap | Megnyerés: csak *Szerződés* fázisból, projektvezetővel; Elveszett: indokkal |

---

## 2. Menü (Értékesítő szerepkör)

- **Ma** – napi áttekintés, esedékes teendők.
- **Sales munkafelület** – a még nem Pipeline-ban lévő, neked/közös poolba átadott leadek, 3 oszlopban.
- **Pipeline** – a Pipeline-ba léptetett ügyek fázisonként.
- **Ajánlatok** – az összes általad látható ajánlat.
- **Projektek** – a megnyert ügyekből létrejött projektek (olvasásra).
- **Sales súgó** – ez a kézikönyv.

Tulajdonosi, beállítási és jelenléti oldalak Sales szerepkörben „Nincs jogosultságod” üzenetet adnak – ez helyes működés.

---

## 3. Sales munkafelület (3 oszlop)

1. **Bal oszlop – Érdeklődők:** keresés, státusz- és forrásszűrő. Kattintással kiválasztod a leadet.
2. **Középső oszlop – Lead dosszié:** cég, kapcsolattartó, marketing minősítés, marketing jegyzet, cég jegyzetek, Kapcsolatok és Emailek fül.
3. **Jobb oszlop – Sales előkészítő:**
   - **Aktivitás rögzítése:** Hívás / Email / Találkozó. A naplózás nem vált státuszt.
   - **Következő lépés:** típus, esedékesség (budapesti idő), jegyzet → **Mentés**. „Lépés törlése” törli.
   - **Döntés:** **Pipeline-ba** (megerősítő ablakkal) vagy **Elveszett**.

**Fontos:**
- Más értékesítőhöz rendelt leadet nem módosíthatsz. Ilyenkor a rendszer hibát jelez: „A lead nem módosult: nincs jogosultságod, vagy a lead nem létezik. A beírt adatok megmaradtak.” – siker üzenet ilyenkor nem jelenik meg.
- A Pipeline-ba léptetés **egyirányú**: onnan nem lehet visszahozni az előkészítésbe.
- Ha egy Pipeline-ban lévő leadet nyitsz meg itt, zöld sáv jelzi: „Ez a lead … óta a Pipeline-ban van.”

---

## 4. Pipeline

- Minden kártyán: cég, összegzés, forrás, felelős, **„Nettó ajánlat: … Ft”** (az ajánlat tételeiből, ÁFA nélkül), a következő lépés típusa és dátuma.
  - Ha nincs ajánlat: „Nincs ajánlat”.
  - Piszkozat ajánlatnál: „(piszkozat)” jelölés.
- Kártyára kattintva nyílik a **Pipeline adatlap**:
  - Bal: alapadatok, **„Megnyitás Workspace-ben”** – pontosan ezt a leadet nyitja meg a Sales munkafelületen.
  - Közép: aktivitásnapló.
  - Jobb: **Státuszváltás** (csak az engedélyezett átmenetek választhatók, a többi „tiltott”), **Megnyerés**, **Elveszett**, **Új ajánlat**.

### Megjegyzés az „Ajánlat kiadva” fázisról
A rendszer jelenleg piszkozat ajánlat mellett is engedi az „Ajánlat kiadva” fázist. A kártyán ilyenkor „(piszkozat)” látszik – ellenőrizd, hogy az ajánlatot ténylegesen kiküldted-e.

---

## 5. Ajánlatok

1. Pipeline adatlapon **Új ajánlat** → megnyílik az ajánlatszerkesztő.
2. Töltsd ki az alapadatokat (ÁFA kulcs is), majd **Tételek**: megnevezés, mennyiség, egységár.
3. Mentés után az ajánlat újranyitáskor is megmarad.
4. **Nyomtatható nézet:** nettó, ÁFA és bruttó végösszeg.
5. Az ajánlat „Lead” hivatkozása a hozzá tartozó leadet nyitja meg.
6. Az **Ajánlatok** menüben és a cég adatlapján („Ajánlatok (n)”) is megjelenik.

---

## 6. Utánkövetés

- Utánkövetést (hívás, e-mail, találkozó) a leadhez rögzítesz; a listában megjelenik a **cég neve** („Ügyfél” oszlop) és – ha már van – a projekt.
- Lezáráskor „Lezárt” állapotba kerül.
- A határidő mindig budapesti idő szerint látszik.

---

## 7. Lezárás

### 7.1 Megnyerés (projekt létrehozással)
1. Léptesd a leadet **Szerződés** fázisba.
2. **Megnyerés** → „Projekt létrehozása a megnyert leadből” ablak:
   - Projekt címe (előre kitöltve), **Projektvezető** (kötelező, keresővel), **Indulás dátuma** (kötelező), Átadási jegyzet.
3. **Megnyerés és projekt** → a lead „Megnyert” lesz, a projekt létrejön, és a rendszer a projekt oldalára visz.
4. A lead ajánlatai, utánkövetései és kapcsolattartója automatikusan a projekthez kapcsolódnak (nem másolat).
5. A Megnyert állapot végleges, nem vonható vissza.

Csak a lead felelőse (vagy tulajdonos) nyerheti meg a leadet.

### 7.2 Elveszett
1. Pipeline adatlap vagy Sales munkafelület → **Elveszett**.
2. Válassz **indokot** (kötelező), írhatsz megjegyzést.
3. **Elveszett megjelölése** → a lead lezárul; a rendszer megjegyzi, melyik fázisban veszett el.

---

## 8. Gyakori hibaüzenetek

| Üzenet | Jelentés | Teendő |
|---|---|---|
| „A lead nem módosult: nincs jogosultságod…” | más felelős leadje vagy nem létező lead | kérd a tulajdonost átrendelésre |
| Pipeline-ba gomb szürke | hiányzik aktivitás vagy következő lépés | rögzíts hívást / mentsd a következő lépést |
| „Csak szerződés fázisú pipeline lead nyerhető meg” | nem Szerződés fázisban vagy | léptesd Szerződés fázisba |
| „Érvénytelen projektvezető” | a kiválasztott felhasználó nem lehet projektvezető | válassz másik személyt |

---

## 9. Adatvédelem

- Csak a jogosultságodnak megfelelő cégeket, leveleket és dokumentumokat látod.
- Teszteléshez kizárólag egyértelműen **TESZT** jelölésű adatot használj.
