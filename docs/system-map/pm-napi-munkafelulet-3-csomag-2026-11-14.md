# PM (projektvezetői) napi munkafelület — 3. nagy csomag

Dátum: 2026-11-14 (UTC). Előzmény: Marketing 2. csomag `192dc26`. Állapot: **KÓD KÉSZ, RÉSZBEN KÉSZ** (commit `057a034`) — bejelentkezett PM/Owner végigpróba **NEM TESZTELT** (`external_unmanaged`, a sandbox nem tud valódi munkamenetet létrehozni).

## 1. Felmérés (read-only, a módosítás előtt)

| Terület | Tény |
|---|---|
| Útvonalak | `/today` → `PmHome` (csak `project_manager`); `/projects`, `/projects/$id` (owner/PM/sales); `/tasks`; `/documents` (owner/PM); `/meetings`; `/attendance/*` (owner/PM); `/help/pm`; `/ai-assistant?agent=pm` (Boss) |
| Adatforrás | `projects` (PM: `project_manager_user_id`, régi sorokon `handoff_payload`), `tasks` (`assigned_user` = users_profile.id, állapot open/in_progress/blocked/done), `project_documents` (kategória: quote/contract/plan/technical/photo/other), `project_notes`, `attendance_projects/entries/workers` (külön projektlista, nincs FK a `projects`-hez) |
| RLS (változatlan) | projects/tasks/followups/meetings/project_* olvasás CRM-szerepkörrel; tasks UPDATE owner/PM/sales; jelenlét csak owner/PM; dokumentum/jegyzet törlés saját vagy owner |
| Éles darabszám (csak olvasva) | 4 projekt (atadas/elokeszites/kivitelezes), mind kijelölt PM-mel (oszlop = payload, 0 eltérés); 0 feladat; 25 projektdokumentum (quote/other); 1 projektjegyzet; 3 jelenléti projekt, 3 bejegyzés |
| Boss | eszközök: crm.projects/tasks/followups/meetings (+kereső/cég/tudás). **Dokumentumot és jelenlétet nem olvas.** A régi „Hiányzó dokumentáció” gyorskérdés így megválaszolhatatlan volt. |

Talált hibák/hiányok: PmHome a „Ma esedékes/Lejárt feladat” számot **az összes** látható feladatra számolta (nem a PM projektjeire), böngésző-időzónával; minden feladatsor a `/tasks` általános listára vitt; a projektadatlap fülei nem voltak mélylinkelhetők; az ajánlat-állapot angol kóddal látszott; a feladat fülön nem volt felelős neve és magyar állapot; a jelenléti oldalak a **UTC napot** ajánlották fel (budapesti éjfél és 01:00 között az előző napot, hónap elején az előző hónapot); a `/documents` oldalon nem látszott, melyik projekt fájlja; a Projektek lista PM-nél is minden projektet mutatott.

## 2. Mi készült (képernyőnként)

| Képernyő | Változás |
|---|---|
| **Mai projektmunka** (`/today`, PM) | „Most ezzel kezdj” kártya (legsürgősebb projekt + egy gomb a megfelelő fülre); hat lépéses munkafolyamat-sáv (Projekt → Mai feladat → Akadály → Jelenlét ma → Napi jegyzet → Átadás előtt); **Projektjeim ma** kártyák sürgősségi sorrendben (lejárt, akadály, mai, napi jegyzet, fájl/fotó, mai létszám, határidő, következő teendő, Jelenlét gomb); „Csak ahol én vagyok a projektvezető” (alapból be; ha nincs saját, jelzi és mindet mutatja); **Mai feladatok és felelősök** (lejárt/mai/akadályozott, felelős név, „Kész”); **Jelenlét ma** (jelenléti projektenként létszám, „+ rögzítés”); „Mit nem kezel még a CRM?” (anyagigény, TIG, napi lap); Boss-kártya három gyorskérdéssel |
| **Projekt adatlap** (`/projects/$id`) | Vissza-link; `?tab=` mélylink; Projektvezető + határidő a fejlécben; mobilon törő fejléc; **Következő teendő** kártya; négylépéses napi út (Feladatok és felelősök / Helyszín és napi lap / Dokumentumok és fotók / Átadás-előkészítés) állapotikonnal; kattintható összesítő csempék; projektváltáskor a fül a linkhez áll |
| ↳ Áttekintés · **Napi lap** | mai/lejárt/akadályozott feladat felelőssel; jelenlét (név szerinti egyezés jelölve, vagy „nincs összekötve”; Sales-nek „nem látható”); fotók száma + Fotók/feltöltés; mai jegyzetek + új napi jegyzet (meglévő `project_notes` beszúrás, hiba esetén a szöveg megmarad) |
| ↳ **Feladatok** | magyar állapot/prioritás, felelős vagy „nincs kijelölve”, lejárt/mai kiemelés, sorrend lejárt→akadály→mai→7 nap; „Kész” (meglévő `useUpsert("tasks")`); „Új feladat ehhez a projekthez” → Feladat űrlap projekttel előtöltve; lezárt feladatok összecsukva |
| ↳ **Dokumentumok** | kategória-csempék (Összes/Fénykép/Tervrajz/Műszaki/Szerződés) darabszámmal; a feltöltési kategória a csempéhez igazodik |
| ↳ **Átadás** (új fül) | „Átadás / teljesítésigazolás előkészítése” ellenőrzőlista (kötelező: minden feladat lezárva, nincs akadály; ajánlott: fotó, műszaki/terv, szerződés, kapcsolattartó, napi jegyzet, Műszaki átadás állapot); kimondja, hogy TIG a CRM-ben nem készül és nem íratható alá |
| Projektek (`/projects`) | PM-nél alapból „Saját projektjeim”; új Projektvezető oszlop; régi soroknál átadási adatból is |
| Feladatok (`/tasks`) | `?new=1&project_id=<uuid>` előtöltés (csak érvényes UUID); „új rekord” felirat helyes |
| Dokumentumok (`/documents`) | Projekt oszlop, link a projekt Dokumentumok fülére; kategóriánkénti darabszám; mobilon görgethető |
| Jelenlét (`/attendance/*`) | Budapest szerinti mai nap és hónapkezdet (Napló, Gyors, Új, Időszak, Kifizetések); `?project=<uuid>` előválasztás a Gyors rögzítésben; mobilon görgethető fülsor |
| Boss (`chat-shared.tsx`) | gyorskérdések csak Boss tényleges eszközeire (`crm_list_projects` me, `crm_list_tasks`, `crm_list_followups`), „Akadályozott feladatok” új, „Hiányzó dokumentáció” törölve; minden prompt kimondja, hogy dokumentumot/jelenlétet nem lát, és csak olvas |
| Súgó (`/help/pm`) | hét új/átírt lépés a valós gombokkal (Most ezzel kezdj, napi lap, Kész/új feladat, dokumentumok, Átadás TIG nélkül, jelenlét, Boss) |

## 3. Módosított / új fájlok

Új: `src/lib/pm/pm-day-flow.ts` (tisztán megjelenítési modell), `src/lib/pm/pm-day-flow.test.ts` (22 teszt), `src/lib/pm/AGENTS.md`, `src/lib/attendance/attendance-dates.ts`, `scripts/qa/check_pm_day.py` (izolált TESZT-böngészőpróba), ez a jelentés.
Módosított: `src/components/today/pm-home.tsx` (átírva), `src/routes/_authenticated/projects.$id.tsx`, `projects.index.tsx`, `tasks.tsx`, `attendance.tsx`, `attendance.{index,quick,new,summary,payouts}.tsx`, `src/components/documents/document-manager.tsx`, `src/components/resource/resource-page.tsx` (opcionális `newDefaultsFromUrl`, `RecordDialog mode`), `src/components/ai/chat-shared.tsx` (csak `pm` gyorskérdések), `src/lib/help-guide.ts` (csak PM rész), `roadmap.md`.

Nem változott: adatbázis-séma, RLS, jogosultság, szerverfüggvények, AI-eszközök/agentek/modell, Sales- és Marketing-kód (a közös `ResourcePage` változása csak opcionális prop), titkok, költségkeret. Nem küldtem e-mailt, nem publikáltam, éles adatot nem írtam.

## 4. Ellenőrzés

- Vitest: **935/935** (92 fájl; ebből 22 új PM-teszt: Budapest-nap éjfélkor/hónapkezdet, PM-forrás oszlop/payload, feladat-besorolás, kategóriák, jelenlét-névegyezés és többes egyezés tiltása, következő teendő teljes sorrendje, tegnapi jegyzet nem mai, figyelmeztetések, saját szűrés, lezárt projekt kizárása, fókuszállapotok, munkafolyamat-sáv, lépéssáv, átadási kötelező/ajánlott tételek, mélylink- és előtöltés-validáció, Boss-promptok eszközhatára, PM-súgó útvonalai).
- AI acceptance: **21/21** OK. `tsgo -b --noEmit`: PASS. Build: OK.
- Böngésző, valódi útvonal kijelentkezve (1280 és 390 px): `/today`, `/projects/<id>?tab=handover`, `/projects`, `/attendance/quick?project=…`, `/tasks?new=1&project_id=…`, `/documents`, `/help/pm` → `/auth`, 0 oldalhiba.
- Izolált TESZT-próba (`scripts/qa/check_pm_day.py`; kitalált TESZT-sorok, minden írás 403-mal blokkolva, nem éles munkamenet), 1280 és 390 px: Mai projektmunka fókusz (lejárt feladat elsőként), 2 fő jelenlét, Boss-kártya, projekt Feladatok (akadály, felelős, „nincs kijelölve”), Átadás (2 kötelező hiány, TIG-szöveg), Napi lap (név szerinti egyezés); vízszintes túlfutás nincs; a „Kész” egyetlen `PATCH tasks?id=eq.t1` kérést küldött (blokkolva); a Következő teendő gomb a Feladatok fülre vált; 0 oldalhiba. Ez **nem** bizonyítja a valódi mentést.
- **NEM TESZTELT:** bejelentkezett PM és Owner végigpróba éles adattal; valódi „Kész”/új feladat/napi jegyzet mentés és visszaolvasás; R2 feltöltés a fotó-kategóriával; Boss gyorskérdések tényleges futása.

## 5. Mi valós és mi csak kód

Valós adatból működik (kódszinten igazolva, éles bejelentkezés nélkül): projektlista és PM-szűrés, feladat-besorolás, dokumentum-kategóriák, napi jegyzet, jelenléti napló mai sorai, átadási ellenőrzőlista. A meglévő mentési utak (feladat, jegyzet, dokumentum, jelenlét) változatlanok.
Csak útmutatás / nincs adatmodell: anyagigény, műszaki akadály külön nyilvántartása (helyette „Akadályozott” feladat), teljesítésigazolás (TIG) kiállítás/aláírás, napi lap űrlap, CRM-projekt ↔ jelenléti projekt mentett kapcsolata.

## 6. Döntést igénylő hiányok (nem csináltam meg)

1. **Jelenlét ↔ CRM-projekt kapcsolat:** pl. `attendance_projects.crm_project_id` (nullable FK) + kézi összekötő felület. Séma- és RLS-hatáselemzés kell; addig csak pontos névegyezés.
2. **TIG / átadási jegyzőkönyv adatmodell:** állapot (előkészítés/aláírásra vár/aláírva), aláírt fájl hozzárendelése, tulajdonosi jóváhagyás. Elektronikus aláírás külön döntés.
3. **Anyagigény:** külön tábla (tétel, mennyiség, határidő, felelős, állapot) vagy maradjon feladat.
4. **Boss olvasási köre:** projekt-dokumentum és jelenlét olvasó eszköz Bossnak — új AI-eszköz, P0/jogosultsági felülvizsgálattal.
5. **Napi lap mint külön rekord** (időjárás, létszám, elvégzett munka): ha a jegyzet + jelenlét nem elég.

## 7. Rollback

Egy commit: `git revert 057a034` (a jelentés-hivatkozás frissítése külön, utólagos dokumentációs commit). Adatot, sémát, jogosultságot nem érint, ezért a visszavonás adatmentést nem igényel.

## 8. Következő nagy csomag

**Owner (tulajdonosi) napi áttekintés** — nem kezdtem el.
