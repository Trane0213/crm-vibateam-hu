# VIBA CRM – Sales munkatársi kézikönyv

**Verzió:** v1.1 · 2026-11-03 · Szerepkör: Értékesítő (Sales)
**Állapot:** az eredeti folyamat élő TESZT-próbája 2026-10-30; a november 3-i Ma/aktivitás-javítások automatikusan ellenőrizve, bejelentkezett böngészős próbájuk még nem történt meg.

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

- **Ma** – saját ügyek: lejárt teendők → mai feladatok → új érdeklődők → válaszra váró ajánlatok → hiányos ügyek. Tulajdonosnál a teljes csapat látszik. A határidőket Budapest naptári napja szerint sorolja be; a felső sáv ugyanezekből az adatokból számol. Sikertelen betöltéskor hibaüzenet jelenik meg. A sorokra kattintva a konkrét ügy munkafelülete nyílik meg.
- **Sales munkafelület** – a még nem Pipeline-ban lévő, neked/közös poolba átadott leadek, 3 oszlopban.
- **Pipeline** – a Pipeline-ba léptetett ügyek fázisonként.
- **Ajánlatok** – az összes általad látható ajánlat.
- **Projektek** – a megnyert ügyekből létrejött projektek (olvasásra).
- **Sales súgó** – ez a kézikönyv.

Tulajdonosi, beállítási és jelenléti oldalak Sales szerepkörben „Nincs jogosultságod” üzenetet adnak – ez helyes működés.

---

## 3. Sales munkafelület (3 oszlop)

### Timothy értékesítési intelligencia — V3.1
Timothy meglévő chatjében kérheted egy konkrét ajánlat CRM–Gmail összhangjának és dokumentált eredményének értékelését. A küldési naplót, ügyelőzményt és pontos jogosult levelet külön ellenőrzi; hiányos szinkronból nem állít levélhiányt. A válasz külön kezeli a tényeket, ellenőrizendő eseteket, feltételezéseket és javaslatokat. A generálkivitelező elvesztett főpályázata nem jelenti a VIBA árhibáját; ismeretlen okot nem talál ki. Elemzési kérés nem módosít CRM-et.
Egységárkereséshez például: **„Keress korábbi nettó egységárakat 300 mm-es kábeltálca szerelésre.”** A keresés a mentett VIBA-tételnevekben történik, ezért rövid műszaki szavak és ismert mértékegység segítik. A válasz az ajánlatot, dátumot, projektet, verziót/alternatívát és ismert ügyeredményt jelöli. A régi ajánlati ár nem önköltség vagy fedezet; anyag/munkadíj külön nincs tárolva. Verziókat ne tekints külön megnyert munkának. A teljes bejelentkezett chatpróba **NEM TESZTELT**; TESZT-adaton ellenőrizd a hivatkozásokat és egységeket.

### Timothy ügyjelzések — P4
A Ma-oldalon, a lead dossziéján és Timothy mindkét chatfelületén az **Ügyjelzések** mutatja a saját nyitott ügyek ellenőrzött metaadatait: ügyféllevél egy kiküldött levél után, ajánlati kiküldési szálon érkező levél, lejárt nyitott utánkövetés, hiányzó/lejárt következő lépés és lejáró ajánlat. A sor az ügyre, a **Levél megnyitása** a konkrét szálra vezet; több mint öt jelzés lapozható. Frissítéskor a korábbi ellenőrzés időpontja látszik, hibás betöltés nem jelent üres teendőlistát.
Ezek tárolt jelzések, nem teljes Gmail-ellenőrzés és nem ajánlatelfogadás. A figyelés legfeljebb 20 szálat, szálanként 50 levelet és cégenként 100 kapcsolattartót ellenőriz; részlegességet és hiányos szinkront jelöl. Tartalmi hiánypótláshoz, műszaki kérdéshez vagy sürgősséghez kérd Timothyt a konkrét levél elolvasására. A figyelés nem indít AI-t, nem hoz létre feladatot, nem küld levelet és nem módosít ügyet. Csak saját aktív postafiók és saját felelősű nyitott ügy; a tulajdonosi csapatnézet változatlan. Hitelesített teljes működési próba még **NEM TESZTELT**.

### Timothy jóváhagyott levélküldés
Konkrét saját ügyhöz kérj levéltervezetet, a saját Gmail-fiók és címzettek megadásával. A szöveget előbb a chatben javíthatod; módosítás után új jóváhagyás készül, a régi kártyát vesd el. Küldés előtt ellenőrizd a feladót, Címzett/Másolat/Titkos másolat mezőket, teljes tárgyat és szöveget, ügyet, valamint minden melléklet nevét és pontos verzióazonosítóját. A **MEGERŐSÍTEM** begépelése és **Jóváhagy és végrehajt** szükséges. Csak saját aktív fiókból, külön engedélyeddel küldhet; nem küld automatikusan.
Melléklet meglévő ajánlati/céges/projekt-dokumentum lehet, legfeljebb 5 MB fájlonként és 20 MB összesen; új PDF-et nem készít. Ajánlati küldésnél a meglévő kiküldési napló és zárolás érvényes. Sima levél nem lépteti a Pipeline-t, nem módosít következő lépést vagy felelőst. **Nem igazolt** eredménynél ne kérj új küldést: ellenőrizd a Gmail Elküldött leveleit és a CRM szálat. Hitelesített két-chat/Gmail végigpróba **NEM TESZTELT**, csak elkülönített TESZT-próbák történtek; automatikus publikálás nincs.

### Timothy nyitott Pipeline-státusz
Már Pipeline-ban lévő saját ügyön kérheted a meglévő, engedett nyitott státuszváltást. A kártyán ellenőrizd a régi/új státuszt és a mentett következő lépést; külön jóváhagyás szükséges. Közben megváltozott ügy vagy határidő nem íródik felül. Nem léptet be új ügyet, nem nyer/elveszít, nem módosít ajánlatot/felelőst/következő lépést és nem küld levelet. **Ajánlat kiadva** leadstátusz továbbra sem bizonyítja a tényleges kiküldést, piszkozat mellett is engedett. Hitelesített teljes végigpróba **NEM TESZTELT**; izolált TESZT-próba történt.

### Timothy felelős-átadás — csak tulajdonos
Tulajdonos kérheti egy nyitott ügy átadását egy megnevezett, aktív értékesítőnek. A jóváhagyási kártya mutatja a régi/új felelőst; csak külön jóváhagyás után történik mentés. A lead és kapcsolt ajánlat láthatósága az új értékesítőhöz kerül, de az ajánlat és utánkövetés felelőse, Gmail-hozzáférés és projekt nem változik. Sales nem adhat át, lezárt ügy nem adható át; megváltozott ügy/átvevő új jóváhagyást igényel. Bejelentkezett teljes végigpróba **NEM TESZTELT**, csak elkülönített TESZT-próba történt.

### Timothy aktivitásrögzítés — P3/A
Timothynak megadhatod a konkrét előkészítő ügyhöz már megtörtént Hívás vagy E-mail eredményét. A jóváhagyási kártyán ellenőrizd az ügyet, céget, kapcsolattartót, felelőst és teljes eredményt. **Jóváhagy és végrehajt** után a rögzítés időpontja szerveridő, nem visszadátumozható. **Elvet** esetén nem rögzül. Következő lépés, felelős és státusz nem változik, levél nem megy ki. Ismeretlen eredménynél ne indíts új műveletet; ellenőrizd az állapotot. Hitelesített két-chat végigpróba még **NEM TESZTELT**.

### Timothy következő lépés — P3/B1
Megadhatod Timothynak a konkrét ügy következő lépésének típusát, teljes dátumát, időpontját és jegyzetét. Ellenőrizd a kártyán a **régi és új lépést**, a teljes jegyzetet és a budapesti időzónát. Hiányzó időpontot tisztázni kell. Külön **Jóváhagy és végrehajt** szükséges, ez nem aktivitásrögzítés. Közben megváltozott ügyet nem ír felül. Nem készül új utánkövetés, nem változik státusz/felelős/kontakt, nem megy ki levél. Törlés csak a meglévő kézi munkafelületen. Hitelesített két-chat mentés/visszaolvasás még **NEM TESZTELT**.

### Timothy napi fókusz — P2 (2026-11-03)
A **Ma** oldalon Timothy legfeljebb öt kiemelt ügyet mutat ugyanabban a sorrendben, mint a napi munkalista. A sorra kattintva az adott ügy munkafelülete nyílik meg. A számok aktuális CRM-adatok, az AI rövid **Javaslata** külön szöveg, nem rögzített teendő és nem végrehajtás.

Budapesti naponként legfeljebb egy automatikus AI-javaslat készül; újranyitás nem generál ismét. A környíl külön kézi frissítés. Adatváltozásnál az elavult javaslat rejtve marad és figyelmeztetés jelenik meg; a napi ügylista ettől függetlenül frissül. Hiba/ismeretlen futási eredmény után nincs automatikus újrapróbálás. A készítési idő budapesti idő. Ez a funkció bejelentkezett élő végigpróbával még **NEM TESZTELT**.

1. **Bal oszlop – Érdeklődők:** keresés, státusz- és forrásszűrő. Kattintással kiválasztod a leadet.
2. **Középső oszlop – Lead dosszié:** cég, kapcsolattartó, marketing minősítés, marketing jegyzet, cég jegyzetek, Kapcsolatok és Emailek fül.
3. **Jobb oszlop – Sales előkészítő:**
   - **Aktivitás rögzítése:** kizárólag Hívás / E-mail, már megtörtént eseményhez. Eredmény/jegyzet megadható (például „Nem vette fel”). Dátummező nincs: az időpont a szerveroldali rögzítési idő. A naplózás nem vált státuszt.
   - **Következő lépés:** jövőbeli feladat típusa (Találkozó is), külön dátum és időpont, jegyzet → **Mentés**. Mindkét időmező kötelező; gyors dátumgomb nincs. „Lépés törlése” törli.
   - **Döntés:** **Pipeline-ba** (megerősítő ablakkal) vagy **Elveszett**.

**Fontos:**
- Más értékesítőhöz rendelt leadet nem módosíthatsz. Ilyenkor a rendszer hibát jelez: „A lead nem módosult: nincs jogosultságod, vagy a lead nem létezik. A beírt adatok megmaradtak.” – siker üzenet ilyenkor nem jelenik meg.
- A Pipeline-ba léptetés **egyirányú**: onnan nem lehet visszahozni az előkészítésbe.
- A Pipeline-ba gombhoz legalább egy megtörtént aktivitás és mentett típus + határidő szükséges. A léptetés előtt a rendszer újból ellenőrzi a mentett adatokat.
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
