
# Email modul javítási terv

Mielőtt belevágok ~8-10 fájl + 1 migráció átírásába, kérek megerősítést a hatókörre és néhány döntésre. A jelenlegi rendszer áttekintése után az alábbiakat találtam, és így javasolom megoldani.

## Jelenlegi állapot (amit a kódban látok)

- `emails` tábla: `gmail_message_id`, `thread_id` (uuid → `email_threads`), `from_email`, `to_email`, `body`, `summary`. **Nincs**: `subject`, `cc`, `bcc`, `is_outbound`, `internal_date`, `snippet`, `headers`, `company_id`, `contact_id`, `project_id`, `lead_id`.
- `email_threads`: `gmail_thread_id`, `subject`, `project_id`. Nincs `last_message_at`, `participants`, `company_id`.
- `email_attachments` létezik (R2 kulccsal). A `sync.server.ts` menti is, de a `emails.$threadId.tsx` lekérdezést újra kell néznem hogy miért nem látszanak.
- Composer: csak egy minimál `/api/gmail/send` van, To/Subject/Body — nincs CC/BCC, nincs HTML editor, nincs attachment upload.
- Jogosultság: csak a UI szűr `from_email`/`to_email` ↔ `users_profile.gmail_email` alapján; kliens oldali, megkerülhető.
- HTML render: DOMPurify alap, de képek/quoted-reply/Gmail-szerű nézet nincs finomhangolva.
- Backfill: már lapoz `pageToken`-nel, max 5000/batch + 4 perc deadline — ez működhet, csak ellenőrzés kell.

## Tervezett változások

### 1. Migráció — `database/2026-06-13_email_module_overhaul.sql`

**emails** új oszlopok:
- `subject text`
- `cc_emails text[]`, `bcc_emails text[]`, `to_emails text[]` (több címzett)
- `is_outbound boolean default false`
- `internal_date timestamptz` (Gmail `internalDate`-ből)
- `snippet text` (külön a `summary`-tól)
- `gmail_label_ids text[]` (INBOX/SENT/UNREAD/CATEGORY_*)
- `company_id uuid`, `contact_id uuid`, `lead_id uuid` (FK, nullable)
- Indexek: `(internal_date desc)`, `(from_email)`, GIN `to_emails`, `(thread_id)`, `(company_id)`, `(contact_id)`, `(lead_id)`

**email_threads** új oszlopok:
- `last_message_at timestamptz`
- `participants text[]` (uniq email-ek a szálban)
- `company_id uuid`, `contact_id uuid`, `lead_id uuid` FK
- `owner_user_id uuid` (melyik user mailbox-ához tartozik — szerver oldali jogosultság alap)
- Index: `(last_message_at desc)`, `(owner_user_id)`

**Új tábla — `email_thread_access`** (per-mailbox szerver oldali szűréshez):
- `thread_id uuid FK email_threads`, `user_id uuid` (auth user), `mailbox_email text`, PK `(thread_id, user_id)`
- Index `(user_id)`
- RLS: csak a saját sorát olvashatja a user, illetve `has_role(uid,'owner')` mindent

**emails RLS frissítés**: SELECT csak akkor, ha a user owner, VAGY a thread-hez tartozik `email_thread_access` sor. (Ezzel megszűnik a kliens szűrés.)

GRANTS minden új táblára.

### 2. Sync (`src/lib/gmail/sync.server.ts`)
- Mentse: `subject`, `cc_emails`, `bcc_emails`, `to_emails` (több cím parse), `is_outbound` (a `SENT` label vagy `from == mailbox_email`), `internal_date`, `snippet`, `gmail_label_ids`.
- `email_threads.last_message_at`, `participants` upsert.
- `email_thread_access` insert a sync-elt user-re.
- Auto-CRM matching: a `from_email` és `to_emails` alapján keressünk `contacts.email`, `companies.domain`, `leads.email` egyezést; ha van, töltsük `company_id`/`contact_id`/`lead_id`-t az `emails` ÉS thread-en.

### 3. Composer — új `/_authenticated/emails.compose.tsx` + dialog komponens
- To/Cc/Bcc tag-input, Subject, HTML editor (**TipTap** — már nem függőség, hozzáadom; alternatíva: egyszerű `contenteditable`).
- Csatolmány upload → R2-be (presigned PUT, már létezik a `r2.server`).
- `/api/gmail/send` átírás: multipart MIME (alternative text+html + attachment parts), `threadId`/`In-Reply-To` támogatás, mentés `emails`-be `is_outbound=true`, `gmail_label_ids=['SENT']`, attachments rekordok.

### 4. HTML render (`email-body.tsx`)
- Gmail-szerű: idézett részek (`<blockquote class="gmail_quote">`) becsukható, képek `cid:` referencia → inline attachment URL csere (presigned R2), külső képeknél "Képek megjelenítése" gomb (privacy).
- Táblázatok scroll konténerben, max-width.

### 5. Thread nézet (`emails.$threadId.tsx`)
- Szerver-oldali jogosultság: hívjon szerver fn-t ami `email_thread_access` alapján ellenőriz; tiltottnál 403.
- Csatolmány lista fix (a jelenlegi lekérdezés debug).
- Válasz gomb → composer dialóg threadId-vel + In-Reply-To/References header.

### 6. Lista (`emails.index.tsx`)
- 5 fül: Beérkezett (INBOX label & !SENT), Elküldött (SENT label), Válaszra vár (utolsó msg külső), Automatikus (CATEGORY_PROMOTIONS/UPDATES/SOCIAL/FORUMS vagy `list-unsubscribe` header), Mind.
- Szerver-szűrés `email_thread_access` join-nal.

### 7. Backfill ellenőrzés
- Marad a jelenlegi 5000/batch + folytatás gomb logika; csak loggolás bővítés.

### 8. Riport
- A futás végén markdown összefoglaló a chatben: létrehozott táblák/oszlopok/FK/indexek + még nyitott pontok.

## Tisztázandó kérdések, mielőtt nekiállok

1. **HTML editor**: Beépítsek **TipTap**-et (új dep, ~200kB), vagy maradjon egyszerű contenteditable + Markdown→HTML? TipTap a Gmail-szerű élményhez közelebb.
2. **Több címzett oszlop**: oké az `emails.to_emails text[]` bevezetése **a meglévő `to_email text` mező MEGTARTÁSA mellett** (visszafelé kompat), vagy migráljuk át teljesen?
3. **`email_thread_access`** tábla: szerver oldali jogosultság ezzel az új táblával — ez volt korábban elutasítva ("ne hozz létre mailbox_access táblát"). Most viszont kéred a szerver oldali szigorítást. Jól értem hogy **most már jöhet** ez a tábla (más néven, de funkcionálisan ugyanaz)?
4. **Külső képek auto-load** alapból be vagy ki? (Gmail alapból kérdez.) Javaslat: **ki**, gombbal lehet megjeleníteni.

Ha a 4 kérdésre rábólintasz (vagy korrigálsz), nekiállok az implementációnak és a végén megkapod a teljes riportot.
