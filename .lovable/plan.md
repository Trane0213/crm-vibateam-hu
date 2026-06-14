
# Marketing modul — adatkonzisztencia lezárás

Cél: ugyanaz a cég, ugyanaz az email, ugyanaz a státusz **minden** képernyőn ugyanazt mutassa. Új funkció nincs, új tábla nincs, séma változás nincs.

---

## Root cause (egy mondatban)

A marketing modul **két** különböző „igazságból" dolgozik:

1. **Univerzum**: `companies.company_type = 'potencialis'` (kampánylista, marketing dashboard ezt nézi).
2. **Státusz**: `companies.notes` MKT/KAMPANY markerek (workspace, pipeline kártyák ebből vezetik le).

Ez két helyen szakad el:
- Viba-Team `company_type = 'generalkivitelezo'`, viszont `notes`-ban `[MKT:STATUS:handoff:...]` → **a státusz handoff, de a dashboard-on nem látszik sehol** (kimarad mindkét bucketből, mert nem `potencialis`).
- Workspace KPI az `emails` táblát nézi (company_id-ra), a tab listája az `email_threads` táblát — eltérő backfill állapot eltérő számokat ad.
- Idővonal külön sorrendezi a saját eseményeit, nem a kanonikus aktivitás-listából.

---

## Megoldás: egyetlen kanonikus adatréteg

### 1. Marketing univerzum — `src/lib/marketing-universe.ts` (új, kis fájl)

```text
isMarketingCompany(row) =
  row.company_type === 'potencialis'
  OR row.notes tartalmaz bármely [MKT:STATUS:…] vagy [KAMPANY:…] markert
```

Egy SELECT, egy szűrő. Minden marketing képernyő ezt hívja, semmi mást.

Kiegészül egy `MARKETING_NOTES_FILTER` PostgREST szűrővel (`notes=ilike.*[MKT:STATUS:*` `or` `notes=ilike.*[KAMPANY:*` `or` `company_type=eq.potencialis`) — egy konstans, importálva mindenhol.

### 2. Státusz forrás — `readMarketingMeta(notes)` (már létezik)

Marad az egyetlen igazság a státuszhoz. Senki nem következtet máshonnan (sem `company_type`-ból, sem lead létezéséből).

### 3. Aktivitás forrás — `emails` tábla `company_id`-ra

„Email aktivitás" minden képernyőn = `SELECT count(*) FROM emails WHERE company_id = X` (és időablak, ahol releváns).
A „szál" csak megjelenítési csoportosítás, nem mérőszám.

### 4. Idővonal forrás — `src/lib/marketing-timeline.ts` (új, vékony)

Egy függvény, ami a workspace-en összerakja az események listáját egységesen:
- cég létrejött (`companies.created_at`)
- kapcsolattartók (`contacts.created_at`)
- emailek (`emails.internal_date ?? created_at`, irány alapján "küldve" / "érkezett")
- dokumentumok (`company_documents.created_at`)
- státusz váltások (`MKT:STATUS:*` markerek dátumai a `notes`-ból)
- handoff (`MKT:STATUS:handoff` marker → lead létrejött)

Minden képernyő ami idővonalat mutat ezt használja.

---

## Konkrét fájl-szintű változások

### Új fájlok
- `src/lib/marketing-universe.ts` — `isMarketingCompany`, `MARKETING_NOTES_OR_FILTER`, `selectMarketingCompanies(supabase)` segéd.
- `src/lib/marketing-timeline.ts` — `buildTimeline({ company, contacts, emails, docs, meta })` egy típusos eseménylistát ad.

### Módosítások
- `src/components/today/marketing-home.tsx`
  - Lecseréli a `company_type=eq.potencialis` szűrőt a `selectMarketingCompanies()`-re.
  - Pipeline kártyák ugyanazon `readMarketingMeta` alapján.
  - „Email aktivitás · 7 nap" = emails count (már így van).
- `src/routes/_authenticated/campaign-list.tsx`
  - Univerzum-szűrés `selectMarketingCompanies()`. Az „aktív" továbbra is `meta.status === 'new'`.
  - A leírás szöveg frissül („minden marketing cég" / „aktív = új").
- `src/components/marketing/marketing-workspace.tsx`
  - Mini KPI és tab badge: `emails.data.length` (már így van) — `threadCount` csak megjelenítési hint.
  - „Email aktivitás" tab lista: ha `emails.data.length > 0` ne mutassa az „üres" állapotot. A meglévő thread-csoportosítás `emails.data`-ból derivált.
  - Idővonal a `buildTimeline()`-ből.
- `src/components/today/marketing-home.tsx` „Friss email szálak" szekció: marad threadre csoportosítva (vizualizáció), de a számláló email-darabszám.

### Nem változik
- DB séma — nincs migráció.
- Status modell, marker formátum, workflow lépések.
- Sales pipeline / leads tábla (külön univerzum, marad).

---

## Elfogadási kritérium (manuális teszt)

Egy „handoff" állapotban lévő cégen ellenőrizzük végig:

| Képernyő | Elvárt érték |
|---|---|
| `/today` Marketing pipeline · „Átadva sales-nek" | tartalmazza (számláló ≥ 1) |
| `/today` Mai prioritás · „Ma átadva" | tartalmazza, ha statusDate = ma |
| `/campaign-list` | NEM jelenik meg az aktívak közt (status ≠ new) |
| Workspace státusz badge | „Átadva sales-nek" |
| Workspace „Email aktivitás (N)" tab | N = `emails` darabszám a company_id-ra |
| Workspace KPI „Email aktivitás" | ugyanaz az N |
| Workspace tab tartalom | ha N>0, nem mutatja az „üres" állapotot |
| Idővonal | tartalmazza a „handoff" eseményt + minden emailt és dokumentumot |
| `/leads` (sales) | a `handoffLeadId` megjelenik a pipeline-ban |

Ezt a táblázatot a befejezés után tényleges DB lekérdezéssel + screenshot-tal igazolom.

---

## Technikai részletek (fejlesztőknek)

- Egyetlen helyen definiált PostgREST `or=(…)` szűrő, hogy a klienseknek ne kelljen ismételten összeállítani.
- A workspace `threads` query lecseréli a side-effect `fetch('/api/gmail/sync')` hívást egy explicit „sync most" gombra (különben minden tab váltáskor sync fut, ami random késleltetésű inkonzisztenciát ad). A sync háttérben futhat, de nem blokkolja a UI-t és nem cseréli adat alatt a számokat.
- `readMarketingMeta` `STATUS_RX` regex globális — egy modul szintű `.lastIndex` reset bugot is megszüntet egy lokális `new RegExp(…, 'g')` használatával.
- Idővonal egyetlen sorted lista, stabil rendezéssel (dátum DESC, kategória tie-breaker).
- Nincs új index szükséges; minden szűrés a meglévő `companies(company_type)` + `companies(notes)` mezőkön megy (kis tábla, jelenleg 4+ rekord).

