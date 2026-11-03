# VIBA CRM – Teljes AI-asszisztens audit (read-only)

Dátum: 2026-11-03 · Módszer: kód, konfiguráció, éles DB-napló (`agent_runs`, `agent_run_steps`, `ai_memory`) csak olvasva. Éles AI-hívás, adatírás, e-mail nem történt.
Jelölés: **MŰKÖDIK** (napló igazolja) · **KÓDBAN** (létezik, napló nem igazolja) · **NEM TESZTELT** · **HIÁNYZIK** · **IGAZOLT HIBA**.

## 1. Közös architektúra

```text
UI (ai-panel.tsx, /ai-assistant, daily-briefing.tsx, sales.research, ai-summary-dialog)
  -> createServerFn runAiAgent / runDailyBriefing / researchCompanies / runAiSummary  [requireSupabaseAuth]
     -> runtime.server.ts runAgent()  (egyetlen belépési pont, MAX_STEPS=50)
        -> providers.server.ts callLlm -> OpenAI (OPENAI_API_KEY, gpt-4o-mini)
        -> tool-registry: toolsForAgent(domain ∩ allowed_agents ∩ allowed_roles)
        -> assertAgentToolAccess (szerveroldali második ellenőrzés)
        -> tool.execute(ctx.supabaseUser = a felhasználó saját, RLS-es kliense)
        -> audit.server.ts: agent_runs / agent_run_steps (admin klienssel írva)
```

- Modell: mind az 5 chat-agent `openai / gpt-4o-mini`, temperature 0.1–0.3 (`agents.ts`).
- Rendszerutasítás: `commonHeader` (dátum UTC, szerepkör, memória) + `constitution.ts` 7 szabálya + agent-specifikus blokk.
- Adathozzáférés: a CRM-, KG- és website-toolok kivétel nélkül `ctx.supabaseUser`-t használnak → **az RLS érvényes, az AI nem kerüli meg** (`crm-tools.server.ts`, `kg-tools.server.ts`, `website-tools.server.ts`). Admin kliens csak naplóíráshoz.
- Beszélgetés tárolása: kizárólag a böngésző localStorage-ában, felhasználónként (`chat-shared.tsx`), max 50 szál, az utolsó 20 üzenet megy a modellnek. Szerveren csak lépésnapló van.
- Hosszú távú memória (`ai_memory`): **0 sor** – gyakorlatilag nem használt.
- Gmail: az AI **nem fér hozzá levéltörzshöz**, csak az `email_threads` metaadataihoz (tárgy, résztvevők, dátum) cégszinten. E-mail-küldő tool **nincs**.
- Szerepkör: `runtime.functions.ts` a `roles.name` kisbetűs értékét adja át, normalizálás nélkül (a CRM `normalizeRole`-ját nem használja) – magyar szerepkörnévnél a role-szűrt toolok elérhetetlenné válnak (**TESZTELENDŐ**).

## 2. A négy asszisztens képességtérképe

| | George | Timothy | Boss | Scarlet |
|---|---|---|---|---|
| Feladat | CRM-navigátor, orchestrator | Sales | Projektvezetés | Marketing |
| Elérés | AI panel, /ai-assistant | AI panel, /ai-assistant | AI panel, /ai-assistant, projekt-adatlap | /sales/research (kutató), AI panel |
| Domainek | handoff, memory, search, companies, contacts, projects, leads, emails, kg, website | memory, search, companies, contacts, leads, quotes, followups, emails, sales.workflow, kg, website | memory, search, companies, projects, tasks, followups, meetings, kg, website | memory, search, companies, contacts, leads, emails, kg, website |
| Írás | memory_write (jóváhagyással) | sales_mark_won_with_project (jóváhagyással) | memory_write | nincs |
| E-mail küldés | nincs | nincs | nincs | nincs |
| Éles futások | 9 ok + 2 hiba (utolsó 10-30) | **1 futás összesen (2026-06-28)** | 1 futás (06-29) | chat: 0; kutató: 7 (utolsó 07-09) |
| Állapot | MŰKÖDIK (olvasás) | KÓDBAN, gyakorlatilag használatlan | KÓDBAN, alig használt | Kutató MŰKÖDIK; chat NEM TESZTELT |

Megjegyzések:
- George handoffja **csak deklaratív** (`core-tools.server.ts`): nem futtatja le a specialistát, csak naplózza a szándékot.
- Háttérfutások (tool nélkül, előre összerakott adatpillanatképből): `sales_briefing` (639 ok + **47 beragadt "running"**), `pm_briefing`, `crm_summary`, `research_companies`. A pillanatkép `select("*")` táblánkénti limittel, felhasználói RLS-sel (`briefing.functions.ts`, `snapshots.functions.ts`).
- Michael (Google Ads, owner-only) a legaktívabb chat-agent (54 futás) – a feladat nem érinti.

## 3. Timothy – 12 pontos Sales-képességmátrix

| # | Folyamat | Mit tud most | Adat | Eszköz | Tanács / végrehajtás | Hiány / kockázat |
|---|---|---|---|---|---|---|
| 1 | Napi feladatok, határidők | Followupok listázása | `followups` | crm_list_followups | csak tanács | Nem használja a közös `dailyWork` logikát (Budapest-nap, P1–P5, lead következő lépés) → a „Ma” oldaltól eltérő számok |
| 2 | Cég/kapcsolattartó keresés | Név/e-mail keresés, cégösszegzés | companies, contacts, leads, projects | crm_search, crm_company_overview, crm_list_company_contacts | olvasás | Telefonszámra nem keres; limit 10–25 sor |
| 3 | Lead/Pipeline előzmény | Lead rekord és lista | `leads` | crm_get_lead, crm_list_leads | olvasás | **Nincs aktivitás/idővonal tool** (`activities`, company-activity) → előzményt nem lát |
| 4 | Gmail olvasás/összefoglalás | Csak száltárgyak cégszinten | `email_threads` | crm_list_company_email_threads | olvasás | **HIÁNYZIK** levéltörzs; lead szerinti szálak nincsenek |
| 5 | E-mail-tervezet | Szabad szöveget írhat | – | nincs | csak szöveg | Gmail-piszkozat nem jön létre; adatalapú kontextus hiányos |
| 6 | Excel/ajánlati dokumentum | – | – | nincs | – | **HIÁNYZIK**; R2 dokumentumokhoz nincs tool |
| 7 | Saját VIBA-ajánlat, verziók | Ajánlatlista | `quotes` (régi mezők: total_amount, status) | crm_list_quotes | olvasás | Tételek, verzió/alternatíva, nettó (quote_items) nem látszik; létrehozni nem tud |
| 8 | Kiküldött ajánlat, válasz | Státusz a listában | `quotes` | crm_list_quotes | olvasás | `quote_sends` és ügyfélválasz nem elérhető |
| 9 | Hívás/e-mail aktivitás rögzítése | – | – | nincs | – | **HIÁNYZIK** (a meglévő `recordPrepActivity` nincs bekötve) |
| 10 | Következő lépés, utánkövetés | Olvasás | followups | crm_list_followups | csak tanács | Írni nem tud |
| 11 | Megnyerés/projektátadás | Won + projekt atomikusan | RPC `sales_mark_won_with_project` | van | végrehajtás jóváhagyással | **IGAZOLT HIBA** a jóváhagyási láncban (4. fejezet F1) → valószínűleg soha nem fut le; elveszett ügyre nincs tool |
| 12 | Munkaterhelés, elakadt ügyek | Listákból következtet | leads, followups | listázók | csak tanács | Nincs aggregáló tool, a sorlimitek torzítanak |

## 4. Biztonság és megbízhatóság – megállapítások fontossági sorrendben

1. **F1 – IGAZOLT HIBA (magas): a jóváhagyott művelet nem hajtódik végre, a felület mégis sikert jelez.** `ai-assistant.tsx` jóváhagyáskor újrafuttatja az agentet a régi `tool_call_id`-val (`approvedToolCallIds`). A modell új hívásazonosítót generál, így a `runtime.server.ts` újra „jóváhagyásra vár” állapotba teszi, a UI viszont „approved” jelvényt és „végrehajtva” értesítést mutat. Napló: `approval` lépés 0 db, tényleges write-tool futás 0 db. Érinti: memory_write, sales_mark_won_with_project, Michael write toolok. (Az élő ellenőrzés NEM TESZTELT, a kódút egyértelmű.)
2. **F2 – magas: hamis siker kockázat tool-hibánál.** A tool `{ok:false}` eredményt ad, a UI csak a szervert dobó kivételt kezeli hibaként; a modell szövege dönti el, mit állít.
3. **F3 – közepes: költségszivárgás.** `sales_briefing` automatikusan indul oldal-betöltéskor (`daily-briefing.tsx`), 639 futás ~4,2 M bemeneti token; 47 futás „running” állapotban ragadt (befejezetlen napló).
4. **F4 – közepes: szerepkör-normalizálás hiánya** a runtime-ban (1. fejezet).
5. **F5 – közepes: prompt-injekció.** Website/KG oldaltartalom, cégjegyzet, levéltárgy szűrés nélkül kerül a modellhez; védelem csak a constitution szövege. Mivel minden adatút RLS-es és az írás jóváhagyáshoz kötött, a kár olvasási szintre korlátozódik.
6. **F6 – alacsony: visszakereshetőség.** A tool-eredmények rekord-ID-t tartalmaznak, de a válasz nem kötelezően hivatkozik rájuk; a chat szerveren nem tárolódik.
7. **Sales-elkülönítés – MŰKÖDIK (szerkezetileg):** minden lekérdezés a felhasználó RLS-ével fut, így Sales csak `assigned_to` saját leadjeit látja (`leads_select_sales`). Élő kétfelhasználós próba NEM TESZTELT.

## 5. Költség (megállapítható része)

Teljes naplózott forgalom: ~5,36 M bemeneti + ~0,20 M kimeneti token, ebből `sales_briefing` ~79%. gpt-4o-mini listaáron (0,15 / 0,60 USD per M token) ez **≈ 0,9 USD összesen** 2026-06-28 óta. A tényleges OpenAI-számla innen nem látható – becslés. Utolsó 30 nap: 414 futás.

## 6. Megtartandó komponensek

`runAgent` egyetlen runtime, `assertAgentToolAccess`, RLS-es `supabaseUser` tool-kliens, `agent_runs`/`agent_run_steps` napló, `tool-errors.ts` hibaburok és retry-szabály, jóváhagyási kártya UI, `sales_mark_won_with_project` RPC (DB-invariánsokkal), ai:acceptance teszt, agent-láthatóság beállítás.

## 7. Összegzés – Timothy alkalmassága napi értékesítői munkára

Bizonyíték alapján **jelenleg nem alkalmas napi munkára**: egyetlen éles futása volt (2026-06-28), 12 Sales-folyamatból 6-ban csak részleges olvasást tud, 5-ben nincs eszköze, az egyetlen végrehajtó művelete (megnyerés) a hibás jóváhagyási lánc miatt nem fut le. Erőssége a biztonságos alap: saját jogosultsággal olvas, nem tud e-mailt küldeni, nem ír jóváhagyás nélkül. A fejlesztés alapja tehát megvan, de a következő lépés az F1–F2 javítása és a meglévő Sales-logikák (`dailyWork`, aktivitás-rögzítés, ajánlat-nettó) eszközként bekötése lenne – külön döntés után.
