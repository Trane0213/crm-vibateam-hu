# Marketing Workspace — Workflow-vezérelt redesign

A jelenlegi képernyő státusz-központú: a marketinges látja a 4 státuszt és próbálja kitalálni, mit kéne tennie. Az új koncepció ezt megfordítja: **a rendszer mondja meg a következő lépést**, a státusz csak származtatott melléktermék.

## 1. Központi elem: „Next Best Action" kártya

A fejléc alatt, a tabok fölött egyetlen, nagy, vizuálisan domináns kártya. Ez a képernyő szíve.

Felépítése:
- **Lépés címe** (pl. „Kapcsolattartó felvétele szükséges")
- **Egy mondatos magyarázat** miért ez a következő lépés
- **Elsődleges CTA gomb** ami pontosan oda navigál / azt a dialógust nyitja (pl. „Kapcsolattartó hozzáadása")
- **Másodlagos link** („Miért ez a lépés?" → tooltip a feltételekkel)
- Bal oldalon ikon + szín a lépés jellegéhez (info / warning / success)

## 2. A workflow szabályai (determinisztikus, sorrendben kiértékelve)

```text
ha status === 'handoff'
   → ÁTADVA   „Sales-nek átadva {dátum}. Lead: {link}"
                CTA: „Lead megnyitása" (másodlagos)

különben ha contacts.length === 0
   → ADAT     „Kapcsolattartó felvétele szükséges"
                „A salesnek átadáshoz legalább egy kapcsolattartó kell."
                CTA: „Kapcsolattartó hozzáadása" → contacts tab + new dialog

különben ha primaryContact.email hiányzik
   → ADAT     „Email cím hiányzik a kapcsolattartónál"
                CTA: „Kapcsolattartó szerkesztése"

különben ha threadCount === 0
   → AKCIÓ    „Első kapcsolatfelvétel szükséges"
                „Küldj bemutatkozó emailt {primary.name} részére."
                CTA: „Email küldése" → composer

különben ha status === 'new'  (van email, de még nincs minősítve)
   → MINŐSÍTÉS „Minősítés folyamatban"
                „Vártok válaszra? Jelöld „Kapcsolatban" állapotra, ha párbeszéd indult."
                CTA: „Kapcsolatban" gomb (státuszváltás inline)

különben ha status === 'contacted' és !meta.salesNote
   → ADAT     „Jegyzet a salesnek szükséges az átadáshoz"
                „Foglald össze 2-3 mondatban a sales számára a fontos tudnivalókat."
                CTA: „Jegyzet írása" → sales-note tab

különben ha status === 'contacted' és meta.salesNote
   → KÉSZ     „Átadható sales-nek"
                „Minden adat megvan. Hozz létre leadet és add át."
                CTA: „Saleshez átadás" (elsődleges, hangsúlyos)

különben (status === 'qualified')
   → KÉSZ     „Átadható sales-nek"
                CTA: „Saleshez átadás"
```

## 3. „Mi hiányzik az átadáshoz?" checklist panel

A Next Best Action kártya alatt egy kompakt csekklista, ami **vizuálisan megmutatja, hol tart a folyamat**. Minden tételnél: ikon (✓ teljesült / ○ hátralévő), címke, kis link a javításhoz.

```text
✓  Cég adatok kitöltve
✓  Kapcsolattartó felvéve  (2)
○  Email cím a kapcsolattartónál         [Szerkesztés]
○  Első emailt küldve                    [Email küldése]
○  Jegyzet sales-nek                     [Megírom]
○  Saleshez átadva
```

Ez egyszerre **progress bar és teendőlista** — a marketinges egy pillantással látja a teljes minősítési útvonalat.

## 4. Státusz lefokozása

A jelenlegi 4 színes státuszgomb a fejlécben **eltűnik mint elsődleges UI**. Helyettük:
- A státusz badge marad a fejlécben (informatív címke, nem akció).
- A státuszváltás **csak az adott lépés CTA-jából** történik (pl. „Megjelölés: Kapcsolatban").
- Egy „Részletek" linkben elérhető marad a kézi státuszváltás haladóknak (`Override státusz`), de alapból rejtett — ne ez legyen a fő interakció.

## 5. Az „Átadás" gomb viselkedése

Jelenleg: tiltva, ha nincs kapcsolattartó, tooltip elmagyarázza.
Új: a gomb **mindig látható ugyanott** (fejléc jobb felső), de:
- ha nem teljesülnek a feltételek → **disabled + a Next Best Action kártya megmondja, mi hiányzik**;
- ha teljesülnek → **enabled, pulse-effect**, és a Next Best Action is ugyanezt javasolja.
Így a két elem (kártya + gomb) sosem mond ellent egymásnak.

## 6. Státuszváltás visszajelzése

Jelenleg: toast „Státusz: Kapcsolatban", ennyi.
Új:
- Toast marad.
- A Next Best Action kártya **azonnal újraszámol** és új lépést mutat (pl. „Most már írj jegyzetet sales-nek").
- Az „Idővonal" tabon kis bejegyzés jelenik meg (`Marketinges → státusz: Kapcsolatban, {időpont}`) — már most is van timeline, ezt használjuk.

## 7. Vizuális prioritáshierarchia (új layout)

```text
┌─────────────────────────────────────────────────────────┐
│  Cég neve · típus · státusz badge       [Saleshez átadás]│   ← fejléc (visszafogottabb)
│  email · telefon · web                                   │
├─────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────┐   │
│  │ 🟡  KÖVETKEZŐ LÉPÉS                              │   │   ← NBA kártya (domináns)
│  │     Első kapcsolatfelvétel szükséges             │   │
│  │     Küldj bemutatkozó emailt Kovács Anna részére.│   │
│  │     [ Email küldése ]    Miért ez a lépés? ⓘ     │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  Hol tart a folyamat:  ✓✓○○○○  2/6                       │   ← progress checklist
│   ✓ Cég adatok    ✓ Kapcsolattartó    ○ Email küldve …  │
├─────────────────────────────────────────────────────────┤
│  [Áttekintés] [Kapcsolattartók] [Emailek] [Dokumentumok]│   ← tabok (változatlanok)
│  ...                                                     │
└─────────────────────────────────────────────────────────┘
```

A KPI mini-kártyák (Kapcsolattartók / Email szálak / Dokumentumok / Felvéve) **átkerülnek a checklist mellé** vagy az Áttekintés tabba — a fejlécben már nem versenyeznek a NBA kártyával.

## 8. Technikai megvalósítás (vázlat)

- Új tiszta függvény: `src/lib/marketing-workflow.ts`
  - `computeNextStep(company, contacts, threads, meta) → NextStep`
  - `computeChecklist(company, contacts, threads, meta) → ChecklistItem[]`
  - Tisztán determinisztikus, unit-tesztelhető, nincs DB hívás benne.
- Új komponens: `src/components/marketing/next-best-action.tsx`
  - Megkapja a `NextStep`-et + callback-eket (onSendEmail, onAddContact, onWriteSalesNote, onOpenHandoff, onMarkContacted).
- Új komponens: `src/components/marketing/workflow-checklist.tsx`
  - Egyszerű lista a `ChecklistItem[]`-ből.
- `marketing-workspace.tsx` átszervezése: új fejléc-blokk + NBA + checklist beillesztése a tabok fölé; státusz-gombsor eltávolítása a fejlécből (átkerül egy diszkrét „⋯ Státusz felülírása" menübe).
- Nincs új tábla, új RPC, új migráció. Minden adat a meglévő `companies.notes` markerekből + `contacts` / `email_threads` / `company_documents` lekérdezésekből származik (már mind elérhető a komponensben).

## 9. Amit ez a kör NEM tartalmaz

- Új funkció (pl. emlékeztető, automatikus emailezés, AI javaslat).
- Új státusz a marketing-status enumban.
- Sidebar / route gating / `/customers` lista refaktor (külön audit, későbbi kör).
- Backend / séma változás.

Ha jóváhagyod, a következő körben pontosan ezt a 8 pontot vágom le egyetlen PR-ben, screenshotokkal a végén.
