# VIBA CRM – 1/A Jogosultsági javítási terv

- Dátum: 2026-10-30 · Alap: `v1.0-2026-10-30.md` rendszertérkép (elfogadva)
- Állapot: **TERV** — adatbázis-szabály és programkód nem módosult.
- Forrás: élő `pg_policies` lekérdezés + forráskód-vizsgálat.

---

## 1. Jelenlegi szabályok (tényleges adatbázis-állapot)

Minden tábla RLS-sel védett, de az alábbi szabályok ténylegesen nyitottak. „Bárki” = bármely bejelentkezett munkatárs.

| Tábla | SELECT | INSERT | UPDATE | DELETE | Szabálynév |
|---|---|---|---|---|---|
| companies | bárki | bárki | bárki | bárki | authenticated_full_access |
| contacts | bárki | bárki | bárki | bárki | contacts_authenticated_access |
| phone_calls | bárki | bárki | bárki | bárki | authenticated_full_access |
| meetings | bárki | bárki | bárki | bárki | authenticated_full_access |
| tasks | bárki | bárki | bárki | bárki | tasks_authenticated_access |
| project_notes | bárki | bárki | bárki | bárki | authenticated_full_access |
| project_documents | bárki | bárki | bárki | bárki | authenticated_full_access |
| company_documents | bárki | bárki | bárki | bárki | authenticated_full_access |
| project_contacts | bárki | bárki | bárki | bárki | 3 átfedő szabály (full_access, select, write) |
| email_threads | hozzáféréssel* | **bárki, bármit** | hozzáféréssel* | hozzáféréssel* | email_threads_write_per_user (WITH CHECK true) |
| emails | admin vagy hozzáféréssel* | **bárki, bármit** | admin/hozzáféréssel* | admin/hozzáféréssel* | emails_write_per_user (WITH CHECK true) |
| email_attachments | admin/hozzáféréssel* | bárki | bárki | bárki | email_attachments_write_authenticated |
| email_thread_access | saját sor vagy admin | – | – | – | eta_select_self (MŰKÖDIK) |

\* `can_access_email_thread()`: tulajdonos/admin, vagy szerepel az `email_thread_access`-ben.

Viszonyításként a már szigorított táblák (NEM ÉRINTENDŐ): leads, projects, quotes, followups, users_profile, attendance_*.

## 2. Ki írja ezeket az adatokat (forráskód alapján)

| Folyamat | Kliens | RLS érvényes? | Hatás a szigorításra |
|---|---|---|---|
| Gmail szinkron (`sync.server.ts`, `sync-incremental.server.ts`, cron) | szerveroldali admin kliens | nem | **nem érinti** |
| Levélküldés (`/api/gmail/send`) | admin kliens, a hívót előtte ellenőrzi | nem | **nem érinti** |
| Levéltörzs frissítés (`/api/gmail/refresh-body`) | admin kliens | nem | **nem érinti** |
| Korábbi adatimport | migráció (adatbázis-tulajdonos) | nem | **nem érinti** |
| Cégek/Kapcsolattartók/Hívások/Találkozók/Feladatok lista (`ResourcePage`) | böngésző, felhasználóként | igen | **érinti** (törlés gomb) |
| Ügyfél adatlap, Scarlet kutatás, kapcsolattartó adatlap | böngésző | igen | érinti (cég/kontakt módosítás) |
| Gyors létrehozás (Ma oldal) | böngésző | igen | érinti |
| Projektjegyzet (`projects.$id`) | böngésző | igen | érinti |
| Projekt/céges dokumentumkezelő | böngésző (+ R2 feltöltés) | igen | érinti |
| Projekt-kapcsolattartók panel | böngésző | igen | érinti |
| Adatgazdagítás / backfill (`lib/enrichment`, Adatminőség oldal) | böngésző | igen | érinti (`email_threads`/`emails` cég-hozzárendelés frissítése) |
| AI OS toolok (tasks, meetings) | felhasználói kliens (`ctx.supabaseUser`) | igen | érinti — az AI pontosan annyit tehet, mint a felhasználó |
| Realtime frissítés | böngésző, SELECT | igen | SELECT nem változik |

**Következtetés:** a Gmail-szinkron, levélküldés és import háttérfolyamatai szerveroldali admin kliensen futnak, ezért az e-mail írási szabályok szigorítása ezeket nem töri el. Laci és Attila kikapcsolt kapcsolatához nem nyúlunk.

## 3. Javasolt jogosultsági mátrix

Jelmagyarázat: ✔ = engedélyezett · ✖ = tiltott · S = csak saját létrehozott sor · P = csak projektjoggal (amelyik projektet az adott szerep a `projects` szabály szerint látja) · **D#** = üzleti döntés szükséges (6. fejezet)

### 3.1 Kritikus (biztonsági) javítások

| Tábla | Művelet | Tulajdonos | Marketing | Sales | Projektvezető |
|---|---|---|---|---|---|
| companies | olvasás | ✔ | ✔ | ✔ | ✔ |
| | létrehozás | ✔ | ✔ | ✔ | ✔ |
| | módosítás | ✔ | ✔ | ✔ | ✔ (**D1**) |
| | törlés | ✔ | ✖ | ✖ | ✖ |
| contacts | olvasás / létrehozás / módosítás | ✔ | ✔ | ✔ | ✔ |
| | törlés | ✔ | ✖ (**D2**) | ✖ (**D2**) | ✖ |
| phone_calls | olvasás / létrehozás | ✔ | ✔ | ✔ | ✔ |
| | módosítás / törlés | ✔ | ✖ (**D3**) | ✖ (**D3**) | ✖ (**D3**) |
| meetings | olvasás / létrehozás / módosítás | ✔ | ✔ | ✔ | ✔ |
| | törlés | ✔ | ✖ | ✖ | ✖ (**D3**) |
| tasks | olvasás | ✔ | ✔ | ✔ | ✔ |
| | létrehozás / módosítás | ✔ | ✔ | ✔ | ✔ |
| | törlés | ✔ | ✖ | ✖ | ✔ (**D4**) |
| project_notes | olvasás | ✔ | ✔ | ✔ | ✔ |
| | létrehozás | ✔ | ✔ (saját névvel) | ✔ (saját névvel) | ✔ (saját névvel) |
| | módosítás / törlés | ✔ | S | S | S |
| project_documents | olvasás | ✔ | ✔ | ✔ | ✔ |
| | feltöltés / módosítás | ✔ | ✖ (**D5**) | ✔ | ✔ |
| | törlés | ✔ | ✖ | S | S |
| company_documents | olvasás / feltöltés | ✔ | ✔ | ✔ | ✔ |
| | módosítás / törlés | ✔ | S | S | S |
| project_contacts | olvasás | ✔ | ✔ | ✔ | ✔ |
| | hozzáadás / eltávolítás | ✔ | ✖ | ✔ | ✔ |
| email_threads | olvasás | változatlan (szál-hozzáférés) |||
| | létrehozás böngészőből | ✔ | ✖ | ✖ | ✖ (csak szerver hozhat létre) |
| | módosítás (cég/projekt hozzárendelés) | ✔ | hozzáféréssel | hozzáféréssel | hozzáféréssel |
| | törlés | ✔ | ✖ | ✖ | ✖ |
| emails | olvasás | változatlan |||
| | létrehozás / törlés böngészőből | ✔ | ✖ | ✖ | ✖ |
| | módosítás | ✔ | hozzáféréssel | hozzáféréssel | hozzáféréssel |
| email_attachments | olvasás | változatlan |||
| | írás bármilyen formában böngészőből | ✖ (csak szerver) | ✖ | ✖ | ✖ |

Indoklás: a `companies`, `contacts`, `phone_calls`, `meetings` táblákban **nincs létrehozó-oszlop**, ezért „csak saját” szabály itt nem írható séma-módosítás nélkül. A 0. szakasz szabálya szerint új oszlopot most nem javaslok; a védelem a **törlés tulajdonosra szűkítése** és a szerepkör szerinti írás. Ahol van létrehozó-oszlop (`project_notes.author_id`, `project_documents.uploaded_by`, `company_documents.uploaded_by`), ott a saját-sor szabály alkalmazható.

Projekt-szintű szűkítés (P) a `tasks`, `project_notes`, `project_documents`, `project_contacts` táblákon **nem** része a kritikus körnek (lásd D6), mert a projektlátás ma is minden PM/Sales számára nyitott.

### 3.2 Későbbi használhatósági egységesítések (nem biztonsági, most nem javítandó)

- U1: `project_contacts` három átfedő szabályának egyre cserélése (a kritikus körben megtörténik, mert úgyis újraírjuk).
- U2: A „Törlés” gomb elrejtése a felületen, ahol a szerepnek nincs törlési joga (különben hibaüzenetet kap) — kódszintű, a szabályváltozással **egy körben javasolt**, hogy ne jelenjen meg félrevezető gomb.
- U3: Vezetői irányítópult közvetlen elérhetősége — **D7**, nem változik.
- U4: `route_permissions` / `ROUTE_ACCESS` kettősség, üres táblák (`user_roles`, `email_messages` stb.) — nem érintjük.
- U5: Használaton kívüli, de nyitott táblák (`agent_activity`, `agent_permissions`, `agent_tasks`, `agents`, `knowledge_*`, `email_drafts`, `email_messages`, `email_campaigns`, `followup_events`, `references`, `settings`, `reminders`, `contact_messages`, `google_ads_keywords/recommendations`) — 1/B körre javasolt (írás tulajdonosra szűkítése), most nem.

## 4. Javasolt módosítások hatáselemzéssel

Minden szabály a meglévő `is_owner_role(auth.uid())` és `crm_role_of(auth.uid())` függvényekre épül. Új modul, tábla, függvény vagy jogosultsági rendszer **nem** készül.

### M1 – companies
- Jelenlegi: `authenticated_full_access` (minden művelet, true).
- Új: SELECT/INSERT/UPDATE: bejelentkezett és van érvényes CRM-szerepe (`crm_role_of(auth.uid()) IS NOT NULL`); DELETE: `is_owner_role`.
- Indok: marketinges/sales jelenleg törölhet céget a hozzá tartozó előzményekkel együtt.
- Érintett képernyők: Cégek lista (törlés gomb), Ügyfél adatlap, Scarlet kutatás, Gyors létrehozás, Adatminőség.
- Megszűnő művelet: nem-tulajdonos cégtörlése.
- Háttér: Gmail send cég-jegyzet frissítése admin kliensen fut → nincs hatás. AI: cégtörlő tool nincs → nincs hatás. Import: nincs hatás.
- Mód: egy migráció: `DROP POLICY authenticated_full_access` + 4 új, műveletenkénti szabály.
- Visszaállítás: az új 4 szabály eldobása és az eredeti `authenticated_full_access` (ALL, USING true, WITH CHECK true, TO authenticated) újralétrehozása.
- Tesztek: T1–T4 minden szerepre (létrehoz ✔, módosít ✔, töröl csak owner).

### M2 – contacts
- Jelenlegi: `contacts_authenticated_access` (ALL, true).
- Új: mint M1 (törlés csak owner, ha D2 így dönt).
- Érintett: Kapcsolattartók lista/adatlap, lead munkafelület kontaktválasztó, kampánylista, hibás e-mail jelölés (módosítás — megmarad).
- Megszűnő: nem-tulajdonos kontakttörlés.
- Háttér: Gmail szinkron kontakt-felvétele admin kliensen → nincs hatás.
- Visszaállítás: eredeti szabály újralétrehozása.

### M3 – phone_calls
- Jelenlegi: ALL true.
- Új: SELECT/INSERT: CRM-szerep; UPDATE/DELETE: owner (D3 szerint bővíthető).
- Érintett: Hívások oldal (szerkesztés/törlés), projekt- és ügyféladatlap hívásblokk.
- Megszűnő: nem-tulajdonos hívásnapló-szerkesztése (D3).
- Háttér: nincs szerveroldali író folyamat.

### M4 – meetings
- Új: SELECT/INSERT/UPDATE: CRM-szerep; DELETE: owner (D3).
- Háttér: AI OS csak olvas (`crm-tools.server.ts`) → nincs hatás.

### M5 – tasks
- Új: SELECT/INSERT/UPDATE: CRM-szerep; DELETE: owner + projektvezető (D4).
- Háttér: AI OS felhasználóként olvas/ír → ugyanazt kapja, mint a felhasználó.

### M6 – project_notes
- Új: SELECT: CRM-szerep; INSERT: `author_id = auth.uid()` vagy owner; UPDATE/DELETE: `author_id = auth.uid()` vagy owner.
- Előfeltétel-ellenőrzés: a projekt adatlap a beszúráskor kitölti-e az `author_id`-t az aktuális felhasználóval — **TESZTELENDŐ** a migráció előtt; ha nem, U2-vel együtt egy sorban javítandó.
- Megszűnő: más jegyzetének törlése/átírása.

### M7 – project_documents, company_documents
- Új: SELECT: CRM-szerep; INSERT: szerep szerint (D5) és `uploaded_by = auth.uid()` vagy owner; UPDATE/DELETE: `uploaded_by = auth.uid()` vagy owner.
- Érintett: Dokumentumok oldal, projekt- és ügyféladatlap dokumentumblokk, lead dossier.
- Háttér: az R2-fájl törlése külön történik; ha a sor törlése tiltott, a fájl nem törlődik (nincs árva fájl). **TESZTELENDŐ:** a felület előbb törli-e a fájlt, mint a sort — ha igen, sorrendcsere kell (U2-vel).
- Előfeltétel: `uploaded_by` kitöltése feltöltéskor — TESZTELENDŐ; a meglévő 8+11 sor `uploaded_by` értéke ellenőrizendő (üres sort csak owner tudna törölni).

### M8 – project_contacts
- Jelenlegi: 3 átfedő nyitott szabály.
- Új: SELECT: CRM-szerep; INSERT/DELETE/UPDATE: owner, sales, project_manager.
- Háttér: `projects_link_lead_records` trigger SECURITY DEFINER → nincs hatás a megnyerés folyamatra.

### M9 – email_threads (kritikus)
- Jelenlegi: `email_threads_write_per_user` ALL, USING hozzáférés, WITH CHECK **true**.
- Új: UPDATE: USING és WITH CHECK `can_access_email_thread(id, auth.uid())`; INSERT és DELETE böngészőből: csak `is_email_admin`.
- Indok: ma bármely felhasználó létrehozhat tetszőleges szálat, és WITH CHECK hiányában módosításnál is bármire átírhatja.
- Érintett: e-mail szál projekt/cég hozzárendelés, Adatgazdagítás backfill (UPDATE marad hozzáféréssel).
- Háttér: Gmail szinkron/küldés admin kliensen → nincs hatás. **A postafiók-hozzáférés (`email_thread_access`) változatlan**, így a mailbox-elkülönítés megmarad.

### M10 – emails (kritikus)
- Jelenlegi: `emails_write_per_user` ALL, WITH CHECK **true**.
- Új: UPDATE: USING és WITH CHECK azonos a jelenlegi olvasási feltétellel; INSERT/DELETE: csak `is_email_admin`.
- Érintett: backfill cég-hozzárendelés (UPDATE marad).
- Háttér: szinkron, küldés, törzsfrissítés admin kliensen → nincs hatás.

### M11 – email_attachments (kritikus)
- Jelenlegi: `email_attachments_write_authenticated` ALL true.
- Új: a nyitott írási szabály megszűnik; írás csak szerveroldalon (admin kliens). Olvasás változatlan.
- Háttér: melléklet-mentés a szinkronban és küldésben admin kliensen → nincs hatás. Böngészős mellékletírás a kódban nincs.

### Közös: szerepkör nélküli felhasználó
- Ma: új regisztráló szerepkör nélkül jön létre, de a nyitott szabályok miatt mindent olvashat/írhat a fenti táblákban.
- Új: a `crm_role_of(auth.uid()) IS NOT NULL` feltétel miatt szerepkör nélkül semmihez nem fér hozzá, amíg a tulajdonos szerepet nem ad. **D8**.

## 5. Végrehajtási és visszaállítási terv

1. Mentés: a migráció előtt a teljes jelenlegi szabálykészlet (`pg_policies` mind a 12 táblára) exportja `database/rollback_rls_1A_2026-10-30.sql` fájlba, futtatható `CREATE POLICY` formában.
2. Egy tranzakciós migráció (M1–M11), táblánként: régi szabály eldobása → új szabályok létrehozása. GRANT-ok változatlanok.
3. Ugyanabban a körben U2 (törlés gombok elrejtése szerep szerint; M6/M7 előfeltételek), kizárólag felületi kód.
4. Azonnali ellenőrzés: teszttervben szereplő SQL-szerepköri tesztek + linter.
5. Visszaállítás: a rollback fájl egyetlen futtatással helyreállítja a pontos jelenlegi állapotot (adatot nem érint, mert csak szabályok változnak). Részleges visszaállítás táblánként is lehetséges.
6. Adatvesztés kockázata: nincs — csak hozzáférési szabályok változnak, sor nem törlődik, oszlop nem változik.

## 6. Üzleti döntések (jóváhagyásod szükséges)

| ID | Kérdés | Javaslat |
|---|---|---|
| D1 | Módosíthat-e a projektvezető cégadatot? | Igen |
| D2 | Törölhet-e marketing/sales kapcsolattartót (pl. duplikátum)? | Nem, csak tulajdonos; duplikátumot jelezni |
| D3 | Ki szerkesztheti/törölheti a hívás- és találkozónaplót? Nincs létrehozó-oszlop, így „csak saját” nem lehetséges. | Szerkesztés: mindenki szerep szerint, törlés: csak tulajdonos |
| D4 | Törölhet-e a projektvezető feladatot? | Igen |
| D5 | Tölthet-e fel marketing projektdokumentumot? | Nem (céges dokumentumot igen) |
| D6 | Szűkítsük-e projektszintre (csak saját projekt) a feladatokat, jegyzeteket, dokumentumokat? | Most ne; külön kör |
| D7 | Vezetői irányítópult közvetlen elérése PM/Sales számára | Döntési pont, nem változik automatikusan |
| D8 | Szerepkör nélküli felhasználó semmit ne lásson ezekben a táblákban? | Igen |
| D9 | Az 1/B körben szűkítsük-e a használaton kívüli, nyitott táblák írását tulajdonosra (U5)? | Igen, külön jóváhagyással |

## 7. Tesztterv

### Automatizált (SQL, tranzakcióban, visszagörgetéssel — `database/rls-1A-regression.sql`)
Minden táblára és mind a 4 szerepre + szerepkör nélküli felhasználóra, `set local role authenticated` + `request.jwt.claims` beállítással, `TESZT-RLS-1A` jelölésű sorokkal:
- T1 olvasás · T2 létrehozás · T3 módosítás · T4 törlés — elvárt eredmény a 3.1 mátrix szerint.
- T5 e-mail: idegen szál létrehozása/módosítása böngésző-szerepként elutasítva; saját hozzáférésű szál cég-hozzárendelése engedélyezett.
- T6 melléklet: böngésző-szerepű írás elutasítva; admin (service_role) írás sikeres.
- T7 saját-sor: más jegyzetének/dokumentumának törlése elutasítva.
- T8 szerepkör nélküli felhasználó: minden elutasítva.
- Futtatás először elkülönített PostgreSQL-ben (mint a rekordkereső regressziónál), majd élő adatbázison tranzakcióban, ROLLBACK-kel.

### Meglévő regressziók (változatlanul zöldnek kell maradniuk)
`nav-config`, `permissions`, `mailbox-model`, `record-search-model`, `ai-panel-context` tesztek; `mailbox-regression.sql`, `record-search-regression.sql`; `bun run ai:acceptance` (12/12).

### Háttérfolyamat-ellenőrzés
- Gmail szinkron: a két aktív postafiók következő futása után új levelek száma > 0 és hiba nélküli `gmail_sync_runs`.
- Levélküldés: TESZT-címre nem küldünk valódi levelet; a hívási útvonal kódszintű ellenőrzése + admin kliens használata.

### Szerepköri felületi tesztek (a te bejelentkezéseddel, mivel külső Supabase mellett nincs biztonságos teszt-session)
Marketing: cég + kontakt felvétel, hívás rögzítése, átadás Salesnek · Sales: ajánlat, utánkövetés, projekt-kapcsolattartó · PM: feladat, jegyzet, dokumentum · Tulajdonos: törlés minden táblában.

## 8. Javasolt módosítások pontos listája

1. M1 companies – törlés csak tulajdonos, írás CRM-szereppel.
2. M2 contacts – ugyanaz (D2).
3. M3 phone_calls – szerkesztés/törlés D3 szerint.
4. M4 meetings – törlés csak tulajdonos.
5. M5 tasks – törlés tulajdonos + PM (D4).
6. M6 project_notes – saját jegyzet szerkesztése/törlése.
7. M7 project_documents, company_documents – saját feltöltés kezelése; feltöltési jog D5 szerint.
8. M8 project_contacts – három szabály helyett egy, írás tulajdonos/sales/PM.
9. M9 email_threads – létrehozás/törlés csak admin, módosítás ellenőrzéssel.
10. M10 emails – ugyanaz.
11. M11 email_attachments – írás csak szerveroldalon.
12. U2 – felületi törlés gombok szerep szerinti elrejtése, M6/M7 előfeltételek javítása (csak ha a teszt hiányt mutat).
13. Rollback fájl + regressziós SQL teszt.

Nem változik: Gmail-kapcsolatok (Laci, Attila), `email_thread_access`, postafiók-elkülönítés, leads/projects/quotes/followups/users_profile/attendance szabályok, üres táblák, régi oldalak, Vezetői irányítópult elérése.

**Megállás: a tényleges szabálymódosítás külön jóváhagyásra vár.**
