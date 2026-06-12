## Cél
Minden felhasználói felületen megjelenő angol szó magyar lesz, és az AI agentek alapból magyarul, közérthetően válaszolnak. A DB séma (enum értékek, oszlopnevek) **nem** változik — csak megjelenítési réteget magyarosítunk, hogy ne kelljen migrációt futtatni és ne törjenek meg a meglévő riportok / API-k.

## Hatókör (mit csinálunk)

### 1. Központi szótár létrehozása
Új fájl: `src/lib/i18n.ts` — egy helyen tartja az összes magyar megfeleltetést. Ezt használja minden komponens, így konzisztens marad.

Tartalom:
- **Domain szavak**: lead → Érdeklődő, follow-up → Utókövetés, task → Feladat, opportunity → Lehetőség, pipeline → Értékesítési folyamat, contact → Kapcsolattartó, company → Cég, quote → Ajánlat stb.
- **Műveletek**: create → Létrehozás, save → Mentés, cancel → Mégse, delete → Törlés, edit → Szerkesztés, search → Keresés.
- **Lead státuszok**: new → Új, contacted → Felvettük a kapcsolatot, qualified → Minősített, proposal_sent → Ajánlat elküldve, negotiation → Tárgyalás alatt, won → Megnyert, lost → Elvesztett.
- **Feladat státuszok**: todo → Teendő, in_progress → Folyamatban, completed → Kész, cancelled → Törölve.
- **Projekt / ajánlat státuszok**: draft → Vázlat, sent → Elküldve, accepted → Elfogadva, rejected → Elutasítva, expired → Lejárt, archived → Archivált stb.
- **Prioritások**: low → Alacsony, normal → Normál, high → Magas, urgent → Sürgős.
- **Ügynöknevek**: Sales Agent → Értékesítési segítő, Marketing Agent → Marketing segítő, PM Agent → Projektsegítő, Marven megmarad (saját név).

Két export:
- `t(kulcs)` — egyetlen szó/kifejezés magyarítása.
- `tStatus(domain, érték)` — státusz badge címke (pl. `tStatus("lead", "qualified")`).

### 2. Komponens-szintű cserék
A `t()` / `tStatus()` beépítése azokon a helyeken, ahol jelenleg angol szöveg jelenik meg:
- `src/components/app-sidebar.tsx` — "Follow-up" → "Utókövetés"
- `src/routes/_authenticated/followups.tsx` — oldalcím + szövegek
- `src/routes/_authenticated/leads.index.tsx`, `leads.$id.tsx` — státusz badge-ek
- `src/routes/_authenticated/tasks.tsx` — státusz badge-ek + szűrők
- `src/routes/_authenticated/dashboard.tsx` — "Follow-up esedékesség" stb. szekciócímek
- `src/routes/_authenticated/quotes.*`, `projects.*`, `customers.*` — státusz badge-ek
- `src/routes/_authenticated/ai-assistant.tsx` — agent nevek, quick action címkék (pl. "Follow-up javaslatok" → "Utókövetési javaslatok")
- `src/routes/_authenticated/calls.tsx` — kategória címkék
- `src/components/projects/project-timeline.tsx` — esemény címkék
- `src/components/global-search.tsx`, `quick-add-menu.tsx`, `welcome-header.tsx` stb.
- `src/components/ai/daily-briefing.tsx` — Sales / PM gomb feliratok

Ami **nem** változik: shadcn primitív komponensek belső `displayName`-jei (pl. `AlertDialogCancel`), enum értékek a kódban, importok, változónevek, fájlnevek.

### 3. AI agentek magyar nyelvi instrukciója
`src/lib/ai/prompts.ts` minden system promptja kap egy expliciten kötelező sort az elején:

> "Mindig magyarul válaszolj, közérthető, hétköznapi nyelven. Ne használj angol CRM szakkifejezéseket (lead, follow-up, pipeline, task, opportunity stb.) — helyettük: érdeklődő, utókövetés, értékesítési folyamat, feladat, lehetőség. A kollégákat keresztnéven szólítsd."

Ez vonatkozik: Marven, Sales (Értékesítési segítő), Marketing (Marketing segítő), PM (Projektsegítő).

Az agentek megjelenített neve (UI-ban) is magyarosodik a 2. pont szerint.

### 4. Tool válaszok formátuma
A `src/lib/ai/tools.ts` és `operator.ts` tool-output stringjei (amiket az agent visszakap és gyakran szó szerint továbbad) magyarra cseréljük: "Lead found" → "Érdeklődőt találtam", "Created" → "Létrehozva" stb. A tool **nevek** (`create_lead`, `daily_call_list`) nem változnak, mert ezeket a modell hívja, nem a felhasználó látja.

### 5. Toast üzenetek
A `sonner` toast-ok rövid szövegei magyarra: a meglévők nagy része már magyar, csak átfutok az `rg "toast\.(success|error|info)"` találatokon és lecserélem a maradék angol stringeket (pl. "Saved", "Created", "Deleted").

## Technikai részletek

- **Nincs DB migráció.** A `lead_status`, `task_status` enum értékek angolul maradnak a DB-ben; csak a megjelenítés magyar.
- **Nincs új npm csomag.** Saját mini `t()` függvény elég — react-i18next overkill lenne 1 nyelvhez.
- **Tipusbiztos**: `t()` és `tStatus()` szigorú TS típusokkal, így új angol szó hozzáadáskor a TS hibát jelez.
- **Csak frontend változás**, semmi backend / RLS / server function logika nem módosul.

## Mit NEM csinálok ebben a körben

- Új funkciókat (te kértél).
- Új AI képességeket.
- DB schema változást.
- Új oldalakat / route-okat.
- Vizuális redesignt.

## Ellenőrzés a végén

1. Sidebar minden menüpontja magyarul.
2. Érdeklődő / Feladat / Ajánlat listák — minden státusz badge magyar.
3. Dashboard — minden szekciócím magyar.
4. AI Assistant — agent nevek, quick action gombok, agent válaszok magyarul.
5. Marketing kutatás → Lead gomb felirata és toast üzenete magyar.
6. `rg -i "follow-up|todo|in progress|qualified" src/routes src/components` — már csak engedélyezett helyeken talál (változónevek, kommentek), UI-ban sehol.

## Becsült érintett fájlok

~25-30 fájl, többségében 1-3 soros cserék. A `i18n.ts` az egyetlen új fájl. Egyetlen iterációban végrehajtható.