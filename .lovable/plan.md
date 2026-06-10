
# VIBA CRM V1 — Frissített terv

A módosítások beépítve. Implementáció **csak** a Supabase bekötés és a séma export után kezdődik.

---

## 0. Prerequisite — Supabase bekötés (változatlan, blokkoló)

- `SUPABASE_URL` = `https://uepqejecsiuhodegbcff.supabase.co`
- `SUPABASE_PUBLISHABLE_KEY` (frontend, anon)
- `SUPABASE_SERVICE_ROLE_KEY` (secret, csak szerver)
- Séma export SQL-ek lefuttatása → oszlopnevek visszaküldése

---

## 1. Vezérlő elv — „Excel-kiváltó ajánlatkövetés"

A CRM elsődleges célja a jelenlegi Excel-alapú ajánlatkövetés kiváltása. Ez **minden képernyőn vizuálisan dominál**:

**Globális „ajánlat-pulzus" sáv** (header alatt, minden authentikált oldalon):
```
[ 12 nyitott ajánlat ] [ 5 lejárt follow-up ] [ 8 ma esedékes ] [ 3 új lead ]
```
Kattintható chip-ek, közvetlen szűrt nézetre ugranak.

**Minden lista/adatlap fejléce kötelezően mutatja:**
- Ajánlat státusz (badge, színkódolt)
- Következő follow-up dátum (lejárt = piros, ma = narancs, jövő = szürke)
- Lead/projekt státusz
- „Következő teendő" sor (legközelebbi nyitott task vagy follow-up)

**Dashboard 4 fő blokkja (sorrend = prioritás):**
1. **Ajánlat-tölcsér** (quotes pipeline: készül → kiküldve → tárgyalás → megnyert/elveszett, értékkel HUF)
2. **Follow-up dashboard** (lejárt / ma / 7 napon belül — Excel-szerű táblázat, inline „kész" gombbal)
3. **Lead státuszok kanban-mini**
4. **Következő teendők** (személyre szabott napi lista)

---

## 2. Projektek = a rendszer központja

A `projects` tábla a központi hub. **Minden más entitás projekthez kapcsolódik** (vagy közvetlenül, vagy az ügyfél/cég-en keresztül).

### Projekt adatlap (`/projects/$id`) struktúra

```
┌─────────────────────────────────────────────────────────────┐
│ HEADER: cég | cím | pipeline lépés | felelős | érték (HUF)  │
│ KIEMELT: aktív ajánlat státusz | következő follow-up | nyitott feladatok száma │
├─────────────────────────────────────────────────────────────┤
│ Tabok:                                                       │
│  Áttekintés | Ajánlatok | Follow-up | Feladatok | Emailek   │
│  Hívások | Találkozók | Dokumentumok | Kapcsolattartók |    │
│  Jegyzetek | Idővonal                                        │
└─────────────────────────────────────────────────────────────┘
```

**Áttekintés tab** = mini-dashboard a projekthez:
- Ajánlat-állapot kártya (összes quote státusszal, értékkel)
- Aktív follow-up-ok
- Következő 3 teendő
- Utolsó 3 kommunikáció (email/hívás/találkozó vegyesen, idővonalon)

**Idővonal tab**: kronológikus, szűrhető (email + hívás + találkozó + feladat + ajánlat-esemény + follow-up esemény) — egy helyen az egész projekt-történet.

### Adat-kapcsolatok (feltételezett FK-k, séma exportból véglegesítendő)
```
companies ──┬─→ projects ──┬─→ quotes ──→ quote_items
            │              ├─→ tasks
            │              ├─→ followups ──→ followup_events
            │              ├─→ emails ──→ email_threads
            │              ├─→ phone_calls
            │              ├─→ meetings
            │              ├─→ project_documents
            │              └─→ project_notes
            └─→ contacts ──→ (referenced by all above)
```

Ha valamelyik FK hiányzik a sémából → `TODO: backend missing — projekt FK hiányzik` komment, NEM táblamódosítás.

---

## 3. Sales Agent V1 — esemény-vezérelt architektúra (chat csak az egyik felület)

**Cél:** a chat UI az MVP felület, de az architektúra eleve felkészül arra, hogy az ágens **eseményekre** reagáljon (új email érkezett → lead-jelölt javaslat), nem csak felhasználói promptra.

### Réteges felépítés

```
┌─────────────────────────────────────────────────────────────┐
│ FELÜLET RÉTEG (UI surfaces — V1-ben csak chat aktív)        │
│  • /ai-sales chat                                            │
│  • [PLACEHOLDER] email-érkezés trigger panel                 │
│  • [PLACEHOLDER] javaslat-inbox (agent_activity feed)        │
├─────────────────────────────────────────────────────────────┤
│ AGENT ORCHESTRATION (lib/ai/agent/)                          │
│  • runAgent({ trigger, context, tools }) — egységes entry    │
│  • trigger típusok: "chat" | "email.received" | "schedule"   │
│  • V1: csak "chat" implementált, a többi stub                │
├─────────────────────────────────────────────────────────────┤
│ TOOL RÉTEG (lib/ai/tools/) — definiáltak, de stub handler    │
│  • search_crm(query)                                         │
│  • find_company_by_domain(email)        ← email→cég match    │
│  • find_contact_by_email(email)         ← email→kapcsolat    │
│  • create_lead_from_email(emailId)      ← lead generálás     │
│  • get_project_history(projectId)                            │
│  • suggest_followup(projectId|quoteId)  ← follow-up javaslat │
│  • summarize_lead(leadId)                                    │
├─────────────────────────────────────────────────────────────┤
│ LLM PROVIDER (lib/ai/providers/openai.functions.ts)          │
│  • OpenAI client (server-only, OPENAI_API_KEY secret)        │
│  • V1: send → toast „hamarosan", de a függvény-szignatúra él │
├─────────────────────────────────────────────────────────────┤
│ PERZISZTENCIA (meglévő táblák, NEM hozok újat)              │
│  • agents              — agent definíció                     │
│  • agent_tasks         — futási feladatok (trigger payload)  │
│  • agent_activity      — események/javaslatok feed-je        │
│  • agent_memories      — RAG / kontextus                     │
│  • knowledge_documents + knowledge_chunks — tudásbázis       │
└─────────────────────────────────────────────────────────────┘
```

### V1-ben mit látunk
- **`/ai-sales`** chat felület (üzenetek + input, send disabled vagy „hamarosan" toast)
- **Tool definíciók kódban léteznek** (TypeScript signature + Zod schema), handler `throw new Error("not implemented")` + UI badge
- **Javaslat-feed komponens placeholder** a dashboardon: „Az AI Értékesítő itt fog javaslatokat tenni"
- **Email adatlapon** „Lead generálás AI-jal" gomb (disabled, tooltip: hamarosan)

Így amikor a 2. fázisban bekapcsoljuk az OpenAI-t, **csak a handler-eket kell kitölteni**, az UI és az adat-folyam már a helyén van.

---

## 4. Dokumentumtár — Cloudflare R2 architektúra (NEM Supabase Storage)

### Tervezett flow (V1: UI + szerver fn váz, R2 hívás disabled)

```
[Browser] ──1── POST /server-fn: requestUploadUrl({fileName, projectId})
                                    │
                                    ↓
[Server fn] ──2── R2 presigned PUT URL (S3 API, AWS SDK v3)
                                    │
                                    ↓
[Browser] ──3── PUT file → R2 közvetlenül (nem megy szerveren át)
                                    │
                                    ↓
[Browser] ──4── POST /server-fn: confirmUpload({key, projectId, kategória})
                                    │
                                    ↓
[Server fn] ──5── INSERT project_documents (r2_key, kategória, project_id)
```

### Modul-struktúra
```
src/lib/integrations/r2/
├── client.server.ts         — S3-kompatibilis kliens (R2 endpoint)
├── presign.functions.ts     — requestUploadUrl, requestDownloadUrl
├── documents.functions.ts   — confirmUpload, deleteDocument, listByProject
└── types.ts                 — DocumentCategory enum (ajánlat|szerződés|felmérőlap|fotó|terv|egyéb)
```

### Secret slot-ok (V1-ben üresek, UI „nincs konfigurálva")
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET`
- `R2_PUBLIC_URL` (opcionális, ha publikus letöltés kell)

### Séma feltételezés
A `project_documents` táblának szüksége van: `r2_key` (text), `file_name`, `mime_type`, `size_bytes`, `category`, `project_id`, `company_id` (nullable), `uploaded_by`. Ha hiányzik → `TODO: backend missing — r2_key mező` komment + UI fallback.

### V1-ben mit látunk
- `/documents` lista (üres state, vagy meglévő rekordok metaadattal)
- Upload zóna **disabled**, tooltip „R2 konfiguráció szükséges"
- Beállítások → Tárhely oldalon: kapcsolat-állapot kártya (4 env var jelenléte → zöld/piros)
- Kategória szűrők működnek (ajánlat | szerződés | felmérőlap | fotó | terv | egyéb)

**Supabase Storage NEM kerül használatba**, sehol.

---

## 5. Frissített oldalszerkezet

```
src/routes/
├── __root.tsx
├── index.tsx                            → redirect /dashboard
├── auth.tsx
└── _authenticated/
    ├── route.tsx                        — auth gate + globális ajánlat-pulzus sáv
    ├── dashboard.tsx                    — Ajánlat-tölcsér + Follow-up + Lead-kanban + Teendők
    │
    ├── projects.tsx                     — RENDSZER KÖZPONTJA
    ├── projects.index.tsx               — pipeline kanban (default) + lista toggle
    ├── projects.$id.tsx                 — adatlap (11 tab)
    │
    ├── quotes.index.tsx                 — összes ajánlat (Excel-helyettesítő nézet)
    ├── quotes.$id.tsx                   — ajánlat + tételek
    │
    ├── followups.index.tsx              — lejárt/ma/jövő kiemelve
    │
    ├── leads.index.tsx / leads.$id.tsx
    ├── companies.index.tsx / companies.$id.tsx
    ├── contacts.index.tsx / contacts.$id.tsx
    ├── tasks.index.tsx
    │
    ├── emails.index.tsx / emails.$threadId.tsx
    ├── calls.index.tsx
    ├── meetings.index.tsx / meetings.calendar.tsx
    │
    ├── documents.index.tsx              — R2-ready UI
    │
    ├── ai-sales.tsx                     — chat + (jövőben) javaslat-feed
    │
    └── settings/
        ├── settings.tsx (layout)
        ├── settings.index.tsx
        ├── settings.gmail.tsx           — OAuth előkészítés
        ├── settings.openai.tsx          — kulcs állapot
        ├── settings.storage.tsx         — R2 állapot (4 secret)
        ├── settings.users.tsx
        └── settings.roles.tsx
```

Szerver fn modulok:
```
src/lib/
├── crm/
│   ├── projects.functions.ts            ← központi, gazdag projection
│   ├── quotes.functions.ts              ← kiemelt
│   ├── followups.functions.ts           ← kiemelt
│   ├── leads, companies, contacts, tasks, emails, calls, meetings .functions.ts
├── ai/
│   ├── agent/
│   │   ├── orchestrator.functions.ts    — runAgent entry
│   │   └── triggers.ts                  — chat | email.received | schedule
│   ├── tools/
│   │   ├── search-crm.ts
│   │   ├── find-company.ts
│   │   ├── find-contact.ts
│   │   ├── create-lead-from-email.ts
│   │   ├── suggest-followup.ts
│   │   └── index.ts                     — tool registry
│   └── providers/
│       └── openai.server.ts
├── integrations/
│   ├── gmail/                           — OAuth előkészítés
│   │   ├── oauth.functions.ts
│   │   └── client.server.ts
│   └── r2/                              — fent részletezve
└── auth/permissions.ts
```

---

## 6. Design hangsúlyok (Excel-replacement érzés)

- **Sűrű adattáblák** TanStack Table-lel, sticky header, inline szerkesztés (státusz, follow-up dátum, felelős)
- **Színkódolt státusz-rendszer** — Excel-felhasználó azonnal érti: zöld = megnyert/kész, piros = lejárt/elveszett, narancs = ma esedékes, kék = folyamatban
- **Számszerű KPI-k mindenhol** (HUF, db, %), nem dekoratív hero-blokkok
- **Globális ajánlat-pulzus sáv** (1. pont) — minden képernyőn
- shadcn sidebar (kollabálható) + vékony header + ⌘K command palette (projektre/ajánlatra/cégre gyors ugrás)
- Light + dark mode, magyar UI (`hu-HU`, `HUF`)

---

## 7. Implementációs sorrend (Fázis 2 — jóváhagyás után)

1. Supabase kliens + types generálás
2. AppShell + sidebar + globális ajánlat-pulzus sáv + téma + i18n
3. Auth + `_authenticated` gate
4. **Projektek** modul (központ): index kanban + adatlap 11 tabbal
5. **Ajánlatok** (`quotes` + `quote_items`) — Excel-helyettesítő nézet
6. **Follow-up** dashboard + projekt-tabi nézet
7. Dashboard (ajánlat-tölcsér + follow-up + lead + teendők)
8. Leadek, Cégek, Kapcsolattartók
9. Feladatok
10. Emailek (read-only, Gmail placeholder)
11. Hívások + Találkozók (lista + naptár)
12. Dokumentumok (R2 architektúra, upload disabled)
13. AI Sales Agent (chat shell + tool registry + orchestrator váz)
14. Beállítások (Gmail / OpenAI / R2 / Users / Roles)

---

## Nyitott kérdések jóváhagyás előtt

1. **Bekötés**: kézi `SUPABASE_URL` + publishable key secret-be — rendben?
2. **Séma export**: futtatod és visszaküldöd? Enélkül oszlopnév-szinten csak feltételezek.
3. **Brand színek**: VIBA-TEAM hex paletta van, vagy javasoljak (acélkék + meleg narancs akcent)?
4. **Auth provider**: email/jelszó elég, vagy Google sign-in is?
5. **Globális ajánlat-pulzus sáv**: rendben minden képernyő tetején, vagy csak dashboardon?
