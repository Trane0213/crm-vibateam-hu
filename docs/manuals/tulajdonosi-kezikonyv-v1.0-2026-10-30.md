# VIBA CRM – Tulajdonosi kézikönyv (Ma + Irányítópult)

**Verzió:** v1.0 · 2026-10-30 · Szerepkör: Tulajdonos
**Kapcsolódó jelentés:** `docs/system-map/tulajdonosi-dashboard-v1.0-jelentes-2026-10-30.md`

> A tulajdonosnak két vezetői oldala van: **Ma** (gyors napi fókusz) és **Irányítópult** (részletes bontás). Mindkettő ugyanazt a KPI-sávot és ugyanazokat a definíciókat használja, ezért a számok a két helyen azonosak.

---

## 1. Ma (`/today`)

### 1.1 Felső KPI-sáv (4 nagy kártya)
| Kártya | Mit számol | Kattintás |
|---|---|---|
| **Lejárt utókövetés** | nyitott (nem lezárt) utókövetés, határideje elmúlt | Utókövetések lista |
| **Ma esedékes** | nyitott utókövetés, határideje a mai **budapesti** napra esik | Utókövetések lista |
| **Lejárt feladat** | nem kész feladat, határidőn túl | Feladatok lista |
| **Nyitott ajánlat** | nem megnyert / nem elveszett, aktuális verziójú ajánlat darabszáma; alatta a **nettó** érték a tételekből | Ajánlatok lista |

Az ajánlat értéke mindig **nettó, a tételekből számolva** (ugyanúgy, mint a Pipeline kártyán és a nyomtatható nézetben). Tétel nélküli ajánlatnál: „érték nincs rögzítve” / „n db tétel nélkül”. TESZT ajánlat: „ebből TESZT: n”.

### 1.2 Sales és projekt sáv (6 kis kártya)
| Kártya | Jelentés | Kattintás |
|---|---|---|
| Sales-előkészítés | Új / Kapcsolat alatt lead, még nincs Pipeline-ban | Sales munkafelület |
| Pipeline (nyitott) | Pipeline-ban lévő, nem lezárt lead | Pipeline |
| Megnyert lead | „Megnyert” lead (TESZT külön jelölve) | Pipeline |
| Elveszett lead | „Elveszett” lead (TESZT külön jelölve) | Elveszett leadek |
| Átadásra vár | „Átadás / előkészítés” státuszú projekt | Projektek |
| Felelős nélküli projekt | projekt projektvezető nélkül — **piros, ha van ilyen: vezetői teendő** | Projektek |

### 1.3 Jelölések
- **„…”** = betöltés, **„hiba”** = lekérdezési hiba (nem 0!), **„—”** = nincs adat.
- A számok a saját jogosultságod szerint látható adatokból készülnek.

### 1.4 AI napi briefing (George)
Sales / PM nézet váltható, „Frissítés” újrakészíti. Az AI szöveg tájékoztató; pénzügyi összeget csak a CRM-ben ténylegesen rögzített adatból vehet. Ha összeget ír, ellenőrizd az Ajánlatok listában.

### 1.5 Linkek
„Részletes irányítópult →”, „Irányítópult”, „AI Asszisztensek”.

---

## 2. Irányítópult (`/dashboard`)

1. **KPI-sáv** – ugyanaz, mint a „Ma” oldalon.
2. **AI briefing** és **AI napi összefoglaló** gomb.
3. **Kritikus · azonnal kezelendő:** lejárt utókövetés, lejárt feladat, veszélyes projektek (lejárt teendővel).
4. **Ajánlatok · pipeline (nem számlázott bevétel):**
   - Nyitott ajánlatok nettó értéke (tételekből), TESZT rész külön.
   - **Lead-konverzió** = megnyert / (megnyert + elveszett) lead.
   - Új érdeklődők 7 / 30 nap.
5. **Projekt · kivitelezés:** aktív projektek, ma esedékes feladat, közelgő utókövetés (7 nap).
6. **Projektek státusz szerint** – kattintással a Projektek lista.
7. **Utókövetés esedékesség** – lejárt / 3 / 7 / 14 / 30 nap.
8. **Ügyfelek · egységes nézet** – legaktívabb ügyfelek, utolsó aktivitások, nyitott ajánlatok és lejárt utókövetések ügyfelenként; minden név a cég adatlapjára visz.
9. **Vezetői áttekintés:**
   - *Projekt pipeline*: projektek darabszáma státuszonként. **Projekt szerződéses érték nincs rögzítve** a rendszerben.
   - *Megnyert ajánlatok értéke (12 hónap)*: megnyertnek jelölt ajánlatok végösszege — **nem számlázott, nem befolyt bevétel**. Jelenleg nincs megnyertnek számító ajánlati státusz beállítva, ezért „Nincs adat”.
   - *Felelős terheltség*: nyitott / lejárt / kész feladatok felhasználónként.
   - *Utókövetés aktivitás (90 nap)*: nyitott vs. lezárt típusonként.
10. **Következő teendők**, **Érdeklődő státuszok** (kattintható a megfelelő listára), **Közelgő utókövetések** (leadhez kötöttnél a konkrét lead nyílik a Sales munkafelületen).

---

## 3. Mit NEM mutat a rendszer (jelenleg nem mérhető)
- Kiszámlázott árbevétel, befolyt összeg, cash flow, profit — nincs számla/banki adat.
- Projekt szerződéses értéke — nincs ilyen mező.
- Megnyert ajánlat érték — a megnyert ajánlati státusz nincs beállítva.

## 4. Projektek (csak átvétel szint)
Projekt adatlapon: projektvezető, státusz, cég, lead, ajánlat. A részletes projektvezetés külön, későbbi szakasz.
