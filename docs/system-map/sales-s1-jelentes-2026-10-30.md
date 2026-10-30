# VIBA CRM – Sales V1.0 / S1 jelentés: Sales-előkészítés és leadkezelés (2026-10-30)

Állapot: **kód- és adatbázisvizsgálat kész; élő böngészős teszt Ramon fiókjával még NEM futott** (biztonságos hitelesítőadat hiányában). Kód még nem változott ebben a szakaszban.

## 1. Kiinduló állapot (élő DB, csak olvasás)

- Szerepkörök: info@vibateam.hu = owner (aktív), ramon.dencsi@vibateam.hu = sales (aktív), viktor.csotai@gmail.com = sales (aktív), pretor.laszlo@vibateam.hu = marketing (aktív), toth.attila@vibateam.hu = marketing (inaktív).
  - Megjegyzés: a Marketing V1.0 óta viktor.csotai@gmail.com marketing → sales, pretor.laszlo@vibateam.hu sales → marketing szerepkörre került (tulajdonosi módosítás, nem mi végeztük).
- TESZT-lead: id `43b05791-5a41-4e33-ba3b-336dd2af77bd`, cég „TESZT – Marketing E2E 2026-10-30" (`f0761f0b-…`), státusz `new`, source `web_form`, `assigned_to` = Ramon `auth_user_id`-je (`401cc133-…`). **A lead valóban Ramonhoz tartozik.** (A `leads.assigned_to` az auth.users azonosítót tárolja, nem a users_profile.id-t.)
- `pipeline_entered_at` = NULL → a lead nincs a Pipeline-ban.
- Lead-állomány: 5 `new` (email_inbound) + 1 `new` (web_form, a TESZT) + 1 `won` (TESZT-E2E-20261029, info@ felelőssel).

## 2. A Sales-felületek tényleges működése (kódból igazolva)

### 2.1 Menü és oldalak (sales szerepkör)

| URL | Tartalom |
|---|---|
| `/sales/` | Sales áttekintés: Pipeline-számlálók, teendő-határidő csoportok, csapatterhelés, legutóbbi státuszváltások |
| `/leads` | Lead munkafelület (sales mód): 3 oszlop = leadlista + read-only dosszié + Sales-előkészítő panel |
| `/sales/leads` | Pipeline kanban (csak pipeline-fázisú, `pipeline_entered_at` nem üres leadek) |
| `/sales/todo` | Teendők (következő lépés + határidő szerint) |
| `/sales/quotes` | Ajánlatlista |
| `/sales/research` | Kutatási felület |
| `/leads/lost` | Elveszett leadek + újraaktiválás |
| `/sales/handoff` | megszűnt, csak régi linkek miatt él |
| `/leads/$id` | nincs önálló adatlap, átirányít `/leads`-re |

### 2.2 Sales-előkészítő lista szűrése (`lead-list-column.tsx`)

- Sales módban kiesik: `pipeline_entered_at` nem üres, `lost`, `won`. Minden más RLS-látható lead megjelenik (nem csak `new`, hanem pl. `contacted` is).
- Felelősszűrés nincs a kliensben — a láthatóságot az RLS adja.

### 2.3 RLS (élő DB-ből olvasva, `pg_policies`)

- `leads_select_sales`: sales látja a **saját**, a **kiosztatlan** és **minden `new`** leadet — tehát más értékesítőhöz rendelt `new` leadet is lát (közös újlead-pool).
- `leads_update_sales`: módosítani csak a saját vagy kiosztatlan leadet tudja; mentéskor a felelősnek önmagának kell maradnia. Más felelős leadje tehát látható, de nem módosítható.
- Autoclaim trigger: sales frissítéskor a kiosztatlan lead automatikusan hozzá kerül.
- `followups`: sales olvashat és írhat (aktivitás-rögzítés működik).
- A TESZT-lead `new` + Ramonhoz rendelt → Ramon látja és módosíthatja. **Viktor (szintén sales) szintén látja** a `new`-pool miatt, de nem módosíthatja.

### 2.4 Sales-előkészítő panel (`sales-prep-panel.tsx`)

- Aktivitás rögzítés: hívás / email / találkozó → `followups` sor (`lead_id`, `company_id`, típus, eredmény, időpont, `completed=true`). Naplózás, nem vált státuszt.
- Következő lépés: `next_step_type` + `next_step_due_at` + `next_step_note` (NextStepEditor → `useUpdateLead`).
- Pipeline-ba léptetés: UI-feltétel ≥1 aktivitás ÉS kitöltött következő lépés; a mutáció `pipeline_entered_at`-et állít és pre-pipeline státuszt `quote_prep`-re emel. Egyirányú (DB trigger védi). Megerősítő dialógussal.
- Elveszett: kötelező indok + `lost_stage` (LostDialog).
- DB trigger (`leads_pipeline_next_step_required`) a pipeline-leadeknél következőlépés-típust ÉS határidőt is megkövetel.

### 2.5 Elkülönülés és „idő előtti" Pipeline

- A Pipeline board csak pipeline-fázisú (`quote_prep/quote_sent/follow_up/contract`) ÉS `pipeline_entered_at` nem üres leadeket mutat → a `new` TESZT-lead nem jelenik meg a Pipeline-ban. Igazolva kódból; élőben még nem.
- A marketinges átadás nem léptet Pipeline-ba (csak `new` lead + cégjegyzet + audit).

### 2.6 „Új érdeklődő" művelet

- Sales szerepkörből a `/leads` adminlista (és benne az „Új érdeklődő" gomb) nem érhető el (`canSeeList = role !== "sales"`).
- A Ma oldal gyorslétrehozása (`quick-create.tsx`) viszont elérhető: alapstátusz `new`, felelős = a létrehozó, cégenkénti nyitott-lead duplikációellenőrzéssel (találatnál a meglévő leadre navigál).
- A globális gyorsmenü „Új érdeklődő" eleme csak `/leads`-re navigál.

### 2.7 Leadforrások (tényleges)

- Marketinges átadás: `marketing-workspace.tsx` hoz létre `new` leadet választott sales felelőssel; a `source` a választott csatorna (nem automatikusan „marketing").
- Ma oldal gyorslétrehozás (felelős = létrehozó).
- `email_inbound`: beérkező levélből detektált leadek (5 élő példa).
- Admin lista „Új érdeklődő" (csak nem-sales szerepkör).

### 2.8 AI-kapcsolat

- Timothy elérhető a Sales-kezdőlapon (`/ai-assistant?agent=sales`).
- A jelenlegi Sales-előkészítő panel NEM tartalmaz AI-gombot (a régi `LeadActionPanel` Timothy-gombja sales módban nem renderelődik).

## 3. Eltérések / figyelendő pontok (nem javítva, döntésre)

- **Közös `new`-pool:** minden sales látja a más felelőshöz rendelt `new` leadeket is (RLS). A marketinges átadás sikerüzenete szűkebb láthatóságot sugall („a választott értékesítő előkészítőjében"). Módosítani csak külön jóváhagyással lehetne (RLS-érintő).
- **`/leads/$id` mélylink** az ID-t nem viszi tovább a workspace-re (a kiválasztás elvész). Alacsony prioritás.
- A Sales-előkészítőben nincs Timothy-gomb (a Sales-kezdőlapon van).

## 4. Tesztek

- Élő böngészős teszt Ramon fiókjával: **NEM FUTOTT** — nincs biztonságos hitelesítőadat. A kód/DB-vizsgálat nem helyettesíti a felületi tesztet.
- Regressziós tesztek: ebben a körben kódváltozás nem történt, így nem futottak (az előző állapot: Vitest 44/44, AI acceptance 12/12).

## 5. Következő lépés

Ramon jelszavának biztonságos megadása után (Lovable Secret, pl. `SALES_E2E_TEST_PASSWORD`): élő sales belépés → TESZT-lead láthatóság, dosszié, aktivitás-rögzítés, következő lépés, Pipeline-elkülönülés, tiltott műveletek, mobil nézet. A jelszó teszt után törlendő és a törlés jelentendő.

## 6. Kiegészítés – élő Sales-szerepkörös teszt (2026-10-30 12:40–12:50 UTC)

### 6.A Sales szerepkör általános teszt (viktor.csotai@gmail.com, szerep ellenőrizve: `sales`, aktív)
- Jelszó: a felhasználó chatben adta meg; ideiglenes `SALES_E2E_TEST_PASSWORD` titokként tárolva, csak belépésre használva, **a teszt után törölve, a titoklistából eltűnése ellenőrizve**. Fájlba/kódba/naplóba nem került. Javasolt jelszócsere.
- Bejelentkezés → `/today` ✅. Menü: Ma, Sales munkafelület, Pipeline, Ajánlatok, Projektek ✅.
- `/sales` áttekintés, `/sales/leads` Pipeline (0 aktív ügy), `/sales/todo`, `/leads` munkafelület megnyílik ✅; `/dashboard`, `/settings/gmail` → „Nincs jogosultságod" ✅. Konzolhiba nem volt.
- TESZT-lead (`43b05791…`, felelős Ramon, `new`) a munkafelületen **látható**, dosszié (cég, kontakt, marketing jegyzet) helyes ✅ — a közös `new`-pool RLS miatt (§3).
- Aktivitás (hívás) rögzítése: ✅ sikeres — `followups` 7ab7beb4… „TESZT S1 hívás – sales E2E, nem valós", a DB `assigned_to`-ja Ramon maradt; a lista frissült, „≥1 aktivitás ✓".
- Következő lépés mentése: **IGAZOLT HIBA** — a felület „Következő lépés mentve" üzenetet adott, de a DB-ben a lead nem változott (`next_step_*` üres). Ok: a `leads_update_sales` RLS csak saját/üres felelősű leadet enged módosítani; a 0 soros frissítést a panel sikerként jelzi. A panel újratöltve „Még nincs következő lépés"-t mutat. Javítás külön jóváhagyással (S2), most nem módosítottam.
- Pipeline-ba léptetés: nem próbálható (következő lépés hiányzik, gomb tiltott) — ⛔.

### 6.B Ideiglenes átrendelés – BLOKKOLÓ, nem történt meg
- Sales szerepkörből a más felelősű lead nem rendelhető át (RLS `leads_update_sales`); az átrendelés csak tulajdonosi fiókkal szabályos, ahhoz nincs belépésünk. SQL-es megkerülést nem alkalmaztam. A lead mezői változatlanok (DB-ből olvasva: felelős Ramon, `new`, next_step üres, pipeline nincs).

### 6.C Ramon saját belépéses tesztje
- **NEM FUTOTT** — Ramon jelszava nem ismert, nem módosítottam, nem kértem.

### 6.D Itt maradt TESZT adat
- `followups` 7ab7beb4-866a-452c-9263-d978dcc0b8a4 (TESZT hívás a TESZT-leaden). Éles adat nem változott, levél nem ment ki, nem publikáltam.

## S1 célzott blokkoló javítás – hamis „Következő lépés mentve" (2026-10-30)
- Ok (IGAZOLT): RLS által kiszűrt `leads` update hiba nélkül 0 sort ad; a kód ezt sikernek vette (toast + activity log).
- Javítás: új `src/lib/sales/lead-update.ts` (`updateLeadOrThrow`: `.update().eq().select("id")`, pontosan 1 sor = siker, különben érthető hiba; log/toast nem fut). Átkötve: `use-lead-mutations.ts` (useUpdateLead), `pipeline-detail-sheet.tsx` (státusz, lost, next step), `sales-prep-panel.tsx` (Pipeline-ba léptetés). Hiba esetén az űrlap értékei megmaradnak (onError nem töröl).
- RLS, séma, Sales-szabály: nem változott. Nincs migráció.
- Teszt: `src/lib/sales/lead-update.test.ts` 3/3 (1 sor siker, 0 sor / null hiba, több sor hiba); teljes Vitest 44/44; build OK.
- Élő böngészős teszt (tiltott Ramon-lead, saját TESZT – Sales S1 mentés lead): NEM FUTOTT — a chatben szerepelt jelszó nem használható újra, biztonságos titok nincs megadva. TESZT – Sales S1 mentés lead nem jött létre.
- Visszaállítás: a 4 fájl verziótörténetből, `lead-update.ts(+test)` törlése. Publikálás szükséges, nem történt.
- Maradó TESZT adat: followups 7ab7beb4-… (korábbi TESZT hívás).

## S1 jogosult mentés ellenőrzése – tulajdonosi átrendezés után (2026-10-30 12:55 UTC)
- DB-visszaolvasás (csak olvasás): lead 43b05791-… felelős = viktor.csotai@gmail.com (feaad8d8-…), status=new, pipeline_entered_at=NULL, next_step_* = üres, 1 TESZT followup (hívás).
- RLS szerint Viktor (sales, saját felelős) módosíthatja a leadet → a `updateLeadOrThrow` 1 sort kap vissza → valódi siker. (Kódszintű megállapítás.)
- Pipeline-gomb feltétele (`sales-prep-panel.tsx`): nincs Pipeline-ban, nem lost, ≥1 aktivitás, kitöltött következő lépés. Jelenleg: aktivitás ✅ (1), következő lépés ❌ → gomb tiltott. Következő lépés mentése után teljesülne; tényleges léptetés S2.
- Élő böngészős mentés / újratöltés / törlés teszt: **BLOKKOLT** — nincs biztonságos tesztjelszó-titok, a projekt külső Supabase-t használ (a munkamenet nem injektálható). Nem állítom sikeresnek.
- Adatot nem módosítottam; a lead Viktornál marad.
