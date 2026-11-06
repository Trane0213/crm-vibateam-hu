# UI–1 – RÉSZBEN KÉSZ

## Ténylegesen átalakított felületek
- Owner `/today`: öt kiemelt mutató a meglévő owner-kpis definíciókból; középen időszakos nyitott Sales-állomány, valós ügyféltípusból képzett kördiagram és konkrét döntési ügyek; jobb oldalon meglévő ajánlatindítás/projekt/ügyfél/kampány műveletek és határidők; lent folyamatlista és csapatprioritások.
- Owner `/dashboard`: külön időszakos részletezés (URL-ben 7/30/90 nap), ügyfélaktivitás és projektlista; a korábbi részletes riportok összecsukhatóan megmaradnak. Nem ismétli a kezdőoldali KPI-sort/AI-blokkot.
- Sales `/today`: felső saját mutatók; bal oldalon deduplikált prioritási teendők, középen négy vizuális Pipeline-oszlop a meglévő státuszokból, jobb oldalon saját eredmény és mentett következő egyeztetések. Timothy ugyanaz a komponens/üzleti működés, összecsukható megjelenítésben.
- Oldalsáv: szerepkörös főoldalnevek, külön összecsukható ritkábban használt csoportok. Jogosultság és összes elérhető menüpont megmarad.

## Változott forrás
`src/components/today/owner-home.tsx`, `sales-home.tsx`; `src/routes/_authenticated/dashboard.tsx`; `src/components/dashboard/owner-kpi-strip.tsx`, új `owner-workspace.tsx`, `workspace-panel.tsx`; `src/lib/sales/workspace-view.ts` és teszt; `src/lib/nav-config.ts`; `src/components/app-sidebar.tsx`; `scripts/qa/check_ui1.py`.

## Igazolás
- Teljes regresszió 779/779, 78 fájl PASS; AI acceptance 21 PASS. Utolsó paginated read változás után célzott 16 PASS és böngészőteszt ismételve; build OK.
- Eredeti route tree, eredeti lekérdezések, szigorúan elkülönített TESZT hálózati válaszok: Owner /today + /dashboard és Sales /today **1440px desktop és 390px mobil**, 0 pageerror, 0 vízszintes túlfutás, nincs oldalas összeomlás.
- Valódi útvonalnyitás signed-out → /auth: ez nem hitelesített végigpróba.
- Meglévő leadkártya megnyitása `/leads?lead=TESZT-0`, időszakváltás mentett URL-ben, meglévő új ajánlat választóablak megnyitása írás nélkül, menücsoport nyitása PASS.
- Képernyőképek ténylegesen rögzítve és referenciával összevetve; desktop fő panelek a megfelelő helyen, mobilon függőleges sorrend. Hat kép a Files/ui1 alatt.

## Eltérések és nyitott elfogadás
- **NEM TESZTELT:** valódi bejelentkezett Owner/Sales adatok és mentési végigpróba; external_unmanaged munkamenet nem hozzáférhető. A képek TESZT-válaszokat tartalmaznak, nem éles üzleti bizonyítékok.
- Nem készült kitalált havi bevétel/növekedési grafikon vagy ajánlatjóváhagyás: a felső Sales-diagram nyitott ügyek státuszmegoszlása, a saját eredmény aktuális/összesített darabszám, nem havi pénzügy. Az időszakválasztó csak a felvett, még nyitott Sales-állományra vonatkozik.
- Vezetői ötödik KPI Sales-előkészítés, nem kampányfutási állítás; projekt KPI összes projekt, aktív darabszám külön szerepel. A referencia címkéinek más üzleti jelentést nem adtunk.
- Projekt- és határidőkezelés, ajánlatindítás, CRM- és AI-műveletek a meglévő utakon. Nincs új séma/modul/import/éles írás/küldés/publikálás.
- Korábbi /emails 401 és Marketing betöltési hiba élő elfogadása nyitva; UI–2 nem indult.
- Commitot az ügynök nem hozott létre: a verziókezelést a platform kezeli; commitazonosító nem igazolt.

STOP – UI–2 csak tulajdonosi engedéllyel.