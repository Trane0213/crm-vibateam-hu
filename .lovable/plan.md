# Fejlesztési terv – 5 prioritás

## Felmérés: jelenlegi séma (PostgREST szondázás)

A meglévő séma kulcselemei (nem teljes lista, csak a fejlesztéshez érintett):

- `users_profile`: `id, auth_user_id, email, full_name, phone, role_id, active, created_at`
- `roles`: `id, name, description, created_at`
- `permissions`: `id, code, description, created_at`
- `role_permissions`: `id, role_id, permission_id`
- `emails`: `id, from_email, to_email, body, thread_id, created_at` (nagyon minimális)
- `email_threads`: `id, subject, project_id, company_id, created_at`
- `companies, contacts, leads, projects, quotes, followups, tasks` – léteznek és van rajtuk `created_at`, `due_date`, `project_id`, `company_id`, stb.
- Nincs `user_roles` (több-szerepkör) tábla — egy user = egy `role_id` a `users_profile`-on.
- Nincs `user_integrations` / `user_settings` / hasonló tábla, ahova a Gmail OAuth tokent tehetnénk.

A jelenleg bejelentkezett tulajdonosnak **nincs sora** a `users_profile`-ban — emiatt az előző körben a `uploaded_by` FK megbukott. P5-ben ezt rendezzük (auto-create profil).

## NYITOTT KÉRDÉS – Gmail token tárolása

A választott modell: **per-user OAuth + csak élő lekérés**. Ehhez minden CRM-felhasználóra el kell menteni egy connection API kulcsot (`lovack_…`), különben minden alkalommal újra kell engedélyezni a Gmailt.

Nincs erre alkalmas meglévő mező/tábla. Két opció:

- **A. Egy új oszlop a `users_profile`-on:** `gmail_connection_key text` (nullable). Additív, nem bontja meg a sémát. Csak egy oszlop.
- **B. Csak böngésző-localStorage** a per-user kulcsra. Nincs séma-változás, de minden új böngésző / inkognitó / kijelentkezés után újra kell OAuth-olni, és gépek közt nem szinkronizál.

A terv az **A opcióval** számol (1 db ALTER TABLE ADD COLUMN), mert ez teszi napi használatra alkalmassá a rendszert. Ha ezt nem engedélyezed, a Gmail integráció B-ben működik korlátozottan.

## Munkafolyamat

A 4 prioritás közül **P4 (audit) tisztán riport, P2/P3 csak frontend a meglévő táblákon**. Ezek párhuzamosan haladhatnak. P1 (Gmail) a leghosszabb. P5 függ P4-től.

---

## P1 – Gmail integráció (per-user OAuth, élő lekérés)

**Backend (server fn-ek):**
- `src/integrations/lovable/appUserConnector.ts` + `appUserConnectorClient.ts` — sablon szerinti helpers.
- `src/lib/gmail.functions.ts`:
  - `startGmailConnect({targetOrigin})` → `authorizeAppUserOAuth({connectorId:"google", scopes:["gmail.readonly","gmail.send","gmail.modify"]})`.
  - `saveGmailConnection({connectionAPIKey, gmailEmail})` → `users_profile.gmail_connection_key` mentés (A opció).
  - `getMyGmailConnection()` → `{connected: bool, email}`.
  - `disconnectGmail()` → nullra állítja.
  - `gmailListMessages({q, labelIds, maxResults, pageToken})` → `callAsAppUser("/gmail/v1/users/me/messages")` + minden hit-re `messages/{id}?format=metadata`.
  - `gmailGetMessage({id, format})`.
  - `gmailSendMessage({to, subject, body, cc?, bcc?, threadId?})` → base64url RFC2822 build, `messages/send`.
  - `gmailListThreadsForContact({email, maxResults})` → query `from:email OR to:email`.

**Felismerés és kapcsolás (read-only join):**
- `gmailEnrichMessage(msg)` szerver-side helper: `from`/`to` email-ekből contact + company lookup (`contacts.email` + `companies.name` domain-illesztés).
- `gmailLinkToProject({messageId, projectId})` — a meglévő `email_threads` táblába insert/update (subject + project_id), és/vagy `emails` insertálás minimális mezőkkel. *Nem szinkronizáljuk a teljes inbox-ot*, csak akkor írunk be, ha a user explicit „kapcsold ehhez a projekthez" gombot nyom.

**Frontend:**
- `src/components/integrations/gmail-connect-card.tsx` — „Gmail csatlakoztatás" gomb + popup flow.
- Új gomb a Beállítások oldalon: csatlakoztatás / lecsatlakoztatás / állapot.
- `src/routes/_authenticated/emails.index.tsx` átírás: élő Gmail lista (inbox + sent), bal sáv: thread lista, jobb: kiválasztott message preview. Tab: „Bejövő / Kimenő / Mind".
- Felismerés UI: minden message mellett badge a felismert contact / company / project. Egyetlen kattintással "Projekthez kapcsolás" (project select).
- Kimenő email composer modal (To, Subject, Body) + reply-to-thread.
- **Projekt idővonal**: `project-timeline.tsx` kibővítése egy live Gmail forrással — ha a usernek van Gmail kapcsolata, lekér `q:from:<contact.email> OR to:<contact.email>` query-vel az adott projekt kapcsolattartóira, és beolvasztja a timeline-ba. (Ha nincs Gmail kapcsolat, eddigi `emails` táblából működik.)

**Limit:** Gmail API rate-limit miatt cache-elés `useQuery` staleTime: 60s, message details lazy.

---

## P2 – Dashboard KPI rendszer

`src/routes/_authenticated/dashboard.tsx` újraírás az alábbi KPI-okra (vezetői nézet, kártyák + 2 chart). Minden lekérdezés a meglévő táblákra megy (`quotes, projects, followups, tasks, leads`).

KPI kártyák:
1. Nyitott ajánlatok darabszáma — `quotes` count `status` ∉ {won, lost}
2. Nyitott ajánlatok összértéke — `sum(total_amount)` ugyanazzal a szűréssel
3. Aktív projektek — `projects` count `status` ∉ {completed, lost}
4. Lejárt follow-upok — `followups` count `completed=false AND due_date < now`
5. Mai feladatok — `tasks` count `status != done AND due_date today`
6. Közelgő follow-upok (7 nap) — `followups` `completed=false AND due_date BETWEEN now AND now+7d`
7. Új leadek 7 nap — `leads` count `created_at >= now-7d`
8. Új leadek 30 nap — ugyanaz 30 nappal
9. Ajánlat → Megnyert konverzió — `won / (won + lost)` az utolsó 90 napra
10. Projekt státusz megoszlás — donut chart `projects.status` szerint csoportosítva (recharts)

Új komponens: `src/components/dashboard/kpi-card.tsx` + meglévő `recharts` használata.

---

## P3 – Follow-up automatizmusok

Tisztán frontend, OpenAI nélkül.

`src/lib/followup-alerts.ts`:
- `bucketFollowup(followup)` → `'overdue' | 'due-3d' | 'due-7d' | 'due-14d' | 'due-30d' | 'future'` a `due_date`–`now` diff alapján.
- `useFollowupAlerts()` hook — `useQuery` a `followups` táblán, kategorizálva.

Jelzések:
- **Dashboard**: új panel „Follow-up figyelmeztetések" 4 sávval (3/7/14/30 nap), kattintható → szűrt Follow-up listára.
- **Projekt adatlap** (`projects.$id.tsx`): a meglévő followup szekcióhoz színes badge (overdue=destructive, 3d=warning, 7d/14d/30d=secondary skála).
- **Follow-up lista** (`followups.tsx`): fent szűrő chips „Lejárt / 3 napon belül / 7 / 14 / 30 / Jövő", + sorszínezés a bucket szerint.

A meglévő Agent kód nem törlődik; a sávok pusztán a `due_date` alapján számolnak.

---

## P4 – Jogosultsági audit (csak riport)

Új oldal: `src/routes/_authenticated/settings.permissions-audit.tsx`. **Nem módosít semmit**, csak listáz:

1. **Szerepkörök**: `roles` táblából + hány usernek van adott szerepköre (`users_profile.role_id` count).
2. **Permission mátrix**: `permissions` × `roles` cella, `role_permissions` alapján kipipálva.
3. **RLS állapot**: a meglévő `settings.audit.tsx` által végrehajtott olvas/ír teszt eredménye táblánként + szerepkörönként (a `users_profile.role_id` szűréssel a bejelentkezett user szerepkörén belül teszt). „Mely táblákhoz nincs RLS / mely szerepkörök férnek hozzá".
4. **Hiányosságok riport**:
   - Listázza azokat a táblákat, ahol az írás engedélyezve van, de RLS nincs aktív (potenciális adatszivárgás).
   - Listázza az auth uid-okat, akiknek nincs `users_profile` rekord (mint a jelenlegi tulajdonos).
   - Listázza azokat a permission `code`-okat, amelyek egyetlen role-hoz sincsenek hozzárendelve („árva permission").
   - Listázza azokat a role-okat, amelyek minden permission-t tartalmaznak (tulajdonos-szerű).

Nem ír át se policy-t, se role_permissions-t.

---

## P5 – Felhasználókezelés befejezése (függ P4-től)

A meglévő `settings.users.tsx` / `settings.tsx` TODO-jainak lezárása.

**Profil auto-create:** `useEnsureProfile()` hook a `_authenticated` layoutban (vagy a settings oldalon): ha az auth.uid-ra nincs `users_profile`, létrehoz egyet `{auth_user_id, email, full_name=email_metadata, role_id=default 'Tulajdonos' vagy null}`. Ez megoldja az előző körben tapasztalt FK hibát.

**Felhasználó-lista oldal** (`settings.users.tsx`):
- Tábla: email, név, telefon, szerepkör, állapot (active), létrehozva.
- Csak `Tulajdonos` szerepkörűek látják (P4 audit + `has_role` helper).
- Akciók sorra:
  - **Szerepkör módosítás**: select a `roles` táblából → `update users_profile set role_id = ?`.
  - **Deaktiválás / Aktiválás**: toggle `active = false/true`. (Csak az adatbázis bejegyzést módosítja, az auth user marad — magyarázat a UI-on.)
  - **Új szerepkör kiosztása** új userhez: a Supabase Auth Admin invitre nincs jogosultság (service role kell), így a flow: a tulajdonos beír egy emailt, és a rendszer betesz egy „pending invite" sort a `users_profile`-ba `auth_user_id=null`, ami később az első Google/email loginnál összepárosul (egyszerű email-match). **Megjegyzés:** ha a tulajdonos azt szeretné, hogy a meghívó email is menjen, az egy következő kör — most csak a profil-előkészítés van.

## Technikai megjegyzések

- Gmail kérések minden esetben szerver-oldali `createServerFn` + `callAsAppUser` keresztül mennek, a connection api_key sose kerül a böngészőbe.
- A `useServerFn` + `useQuery` pattern minden új hook-ban (loader nem auth-protected fn-t nem hív).
- A `humanizeSupabaseError()` mindenhol kezeli a hibákat; toast 10s.
- Nincs új tábla. Egy darab additív oszlop (`users_profile.gmail_connection_key`) ha A opciót választod.

## Kérlek erősítsd meg

1. **A vagy B** Gmail token tárolásra?
2. Mehet a végrehajtás ebben a sorrendben: **P4 audit → P5 profil auto-create → P2 dashboard → P3 follow-up → P1 Gmail** (legkisebbtől a legnagyobbig, így minden lépés után tesztelhető)?
3. Bármelyik prioritás kihagyandó/halasztandó?