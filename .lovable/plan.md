## Cél

A marketinges a Lead Workspace-en belül egyetlen képernyőről végzi a teljes napi munkát: kiválasztás → értékelés → kapcsolatfelvétel → utánkövetés → átadás. Nincs oldalváltás, nincs új tábla, nincs új motor – csak a meglévő hookok és komponensek újrarendezése + hiányzó interakciók pótlása.

Lista oldalakat (companies / contacts / customers / today) ebben a sprintben **nem érintjük**.

## 1. Három-oszlopos váz finomítás

`src/components/lead-workspace/lead-workspace.tsx`
- Magasság `h-[640px]` helyett `h-[calc(100vh-9rem)]` – teljes képernyős munkafelület.
- Bal 300px / közép rugalmas / jobb 340px (jelenleg 280/–/300). A jobb oldali akció panel ma túl szűk, az átadás form nem fér ki.
- Mobil: tabos váltás (Lista / Részletek / Akciók) – egyszerű state-alapú renderelés, nem új lib.

## 2. Bal oszlop – Lead lista (kiválasztás)

`src/components/lead-workspace/lead-list-column.tsx`
- Új sürgősség-jel: minden lead sorban kis színes pötty a státusz badge mellett.
  - Piros = lejárt utánkövetés van, sárga = mai utánkövetés, szürke = nincs esedékes.
  - Adat: `useListWhere("followups", "company_id", ...)` helyett egyszeri `followups` lekérdezés a látható leadek `company_id` listájára, in-memory map.
- Rendezés a marketing tabokban: lejárt → mai → új lead 24h → többi. (sales mód érintetlen).
- Sor másodlagos sorában a forrás mellé: utolsó aktivitás relatív idő (`relativeTime(l.updated_at)`).
- „X érdeklődő" alá mini-összefoglaló a tabhoz: pl. „3 lejárt · 2 mai".

## 3. Közép oszlop – Lead adatlap (értékelés)

`src/components/lead-workspace/lead-detail-column.tsx`
- Fejléc kompaktabb: cím sor mellé jobbra chip-sor – **Score%** (LeadQualityBlock pct), **Hőmérséklet pötty** (lejárt/mai/új alapján), **Identity strength** (ha van), **Utolsó aktivitás**. A statisztikák így már a görgetés előtt láthatóak.
- A jelenlegi nagy „Adatminőség" és „Automatikus javítások" szekciók egy összecsukható `<details>` blokkba kerülnek: **„Adatminőség és automatikus javítások"** – alapból zárva, hogy a jegyzet, cég/kapcsolat és időskála dominálja a középső területet.
- Új inline mezők (mind autosave a `useUpdateLead`-en keresztül, új mező nélkül – meglévő `leads` oszlopok): `source`, `project_type` szerkeszthető kis input-ok a chip-sor alatt. Ma csak megjelennek, marketinges nem tudja javítani.
- Időskála: csak handoff/email/meeting/call típusra ikonos render (Mail / Phone / UserCheck / Calendar). Ma minden szürke szövegként jelenik meg.

## 4. Jobb oszlop – Akciópanel (kapcsolat, utánkövetés, átadás)

`src/components/lead-workspace/lead-action-panel.tsx`
- A folyamat-szalag (ProcessStrip) megmarad, de **kattinthatóvá** válik: marketing módban a lépésre kattintva a megfelelő státuszt állítja (`new` → `contacted` → `qualified`). Új átmenet, de a státuszok már léteznek.
- Email blokk: a „Levél írása" gomb mellé egy **„Sablon"** menü – 3 előre megírt rövid sablon (első megkeresés / emlékeztető / kvalifikáló kérdések). Csak frontend constants, a sablonok átadásra kerülnek az `EmailComposer`-be (`defaultBody` prop – ha még nincs, hozzáadjuk).
- Followup blokk megmarad (FollowupQuickForm).
- AI blokk megmarad.
- **Új: Hívás rögzítése** mini-blokk: egy „Hívás megtörtént" gomb azonnal létrehoz egy `followup_type='call'`, `completed=true`, `due_date=now()` rekordot opcionális 1 soros eredménnyel. A meglévő `useCreateLeadFollowup`-ot használjuk.
- **Átadás panel (LeadHandoffPanel)** marketing módban marad – de a megjelenési feltételt enyhítjük: `status === 'qualified' || status === 'contacted'`-nál is mutatja (egy kis figyelmeztetéssel, hogy minősítés ajánlott), hogy a marketinges ne ragadjon be – ha a minőség zöld, közvetlenül átadhassa.

## 5. /leads útvonal: alapértelmezett a Workspace

`src/routes/_authenticated/leads.index.tsx`
- A jelenlegi táblázatos `ResourcePage` átkerül `/leads/table` (vagy „Lista" tab) – a `/leads` alapnézet a `LeadWorkspace mode="marketing"` lesz. A user explicit kérése: napi munkát itt végzi, ne tudjon véletlenül a lista nézetben elveszni.
- Egyszerű top-bar két gombbal: **Munkafelület** (alap) / **Lista** (a régi tábla). Nem új route – `useState` váltó.

## 6. Apró fixek

- `LeadActionPanel` jelenlegi `leadId == null` esete „üres workspace" üzenet a teljes középre is, ne csak a jobbra.
- A `LeadDetailColumn`-ban a `min-w-0` mellé `max-w-full` – hosszú összefoglalók eltörik a layoutot bizonyos szélességeknél.
- AutoEnrich status megjelenítés: ha 800ms után nincs result, ne mutassa végtelen „Meglévő adatok ellenőrzése…", inkább „Nincs javítható adat".

## Műszaki megjegyzések

- Csak frontend / presentation. Nincs új tábla, nincs új mező, nincs új edge function.
- Új komponensek:
  - `src/components/lead-workspace/lead-urgency-dot.tsx` (közös pötty logika)
  - `src/lib/lead-workspace/email-templates.ts` (3 hard-coded sablon)
- Érintett fájlok: a 4 lead-workspace komponens + `EmailComposer` props bővítése (`defaultBody`) + `leads.index.tsx`.

## Elfogadási kritérium

A marketinges a `/leads` oldalon belépve:
1. Bal oldalon látja a kiválasztott aktuális leadeket sürgősség szerint.
2. Középen 1 másodperc alatt felméri a lead állapotát (score, hőmérséklet, identity, utolsó aktivitás chip-ekből).
3. Jobb oldalon: email küld sablonnal, +3 nap auto-followup, hívás rögzítés egy kattintással, átadás értékesítőnek – oldalváltás nélkül.
4. A státusz a folyamat-szalag kattintásával lép.
5. A többi marketing oldalra csak akkor megy, ha valami atipikus dologra van szüksége.

Jóváhagyod? Ha igen, nekiállok – csak ezt a sprintet csinálom végig, a listaoldalakat ezúttal nem nyúlom.
