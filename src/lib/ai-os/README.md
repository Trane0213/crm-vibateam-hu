# AI Operating System (AI OS)

CRM-független AI core. A `src/lib/ai-os/` alatti kód nem ismer cégeket,
leadeket, projekteket — csak agenteket, toolokat, memóriát és futási
naplót. A CRM-specifikus toolok az `adapters/` alá kerülnek, és a
`tool-registry`-be regisztrálódnak.

## Tervezési elvek (lock-olt)

1. **Egy belépési pont:** minden agent ugyanazon a `runAgent()` runtime-on
   fut. Nincs agent-specifikus végrehajtó.
2. **Provider-agnostic:** OpenAI / Lovable Gateway (Gemini) / bármi más
   ugyanazzal az interfésszel. Az agent definíciója adja meg a providert
   és a modellt.
3. **Központi tool registry:** az agent nem dönti el, milyen toolt ismer.
   A runtime adja át a (szerepkör ∩ agent jogosultság) metszetet.
4. **Objektum-alapú memória:** `ai_memory(subject_type, subject_id, key)`.
   Nincs külön agent_memory. User / Company / Contact / Lead / Project /
   Conversation memóriából minden agent olvas.
5. **Approval kötelező írásra:** minden write-tool `needs_approval=true`.
   Kivétel csak automatikus háttér-jobok.
6. **Orchestrator = George:** specialisták nem hívják közvetlenül egymást.
   Minden handoff a `handoff_to` toolon keresztül George-on át.
7. **CRM csak adapter:** az AI core nem ír DB-t. Mindent tool hív.

## AI-1 Stabilizáció (2026-07)

Az AI Platform stabilizációs sprint (AI-1.1 → AI-1.9) az alábbiakat rögzítette.
Új funkció fejlesztése előtt ezeket az invariánsokat NE változtasd meg
dokumentálatlanul — mindegyiket az `ai:acceptance` regressziós teszt védi.

- **Constitution (AI-1.1)** — `constitution.ts`. 7 univerzális szabály (adat-forrás,
  jóváhagyás, "nincs elég adat", website/KG tool-kötelezettség, handoff George-on át,
  magyar nyelv). Minden agent system promptja innen kapja meg — nem duplikáljuk.
- **ToolSpec dokumentáció (AI-1.3)** — `types.ts`. 4 hozzáférési réteg egyetlen
  ToolSpec-re képezve: READ (`allowed_agents` + `allowed_roles`), DOMAIN-FÓKUSZ
  (`domain` + `tool_domains`/`extra_tools`), WRITE/EXECUTE (`approval`), DRY-RUN
  (`supports_dry_run`). Nincs redundáns nested `access` objektum.
- **Runtime access-check (AI-1.3)** — `runtime.server.ts::assertAgentToolAccess`.
  Minden tool-hívás előtt szerveroldalon ellenőrzi a domain / agent / role
  jogosultságot. Deny → tool-eredményként visszakerül az LLM-hez.
- **Domain-tisztítás (AI-1.4a)** — George elvesztette a `crm.quotes` domaint
  (Timothy hatásköre). Scarlet-től eltávolítva `marketing.workflow`, Bosstól
  `pm.workflow` (üres domainek voltak).
- **Handoff-modell (AI-1.5)** — `handoff_to` deklaratív, nem chained-run.
  Célagentek dinamikusan `listHandoffTargets()`-ből (non-orchestrator +
  non-background). Az `agent_run_steps.kind` = `"handoff"` a `core.handoff`
  domainű tool-hívásoknál — az audit szét tudja választani.
- **Memory write szűkítés (AI-1.7)** — `memory_write` csak George, Boss, Michael.
  Scarlet és Timothy `memory_read`-en keresztül olvashat, de nem hozhat létre
  hosszú távú memória-darabot.
- **Háttér-agentek (AI-1.8)** — `is_background: true` mező: snapshot-alapú,
  tool nélkül futó agentek (`sales_briefing`, `pm_briefing`, `crm_summary`,
  `research_companies`). Nem chatable-ek, nem handoff-célok.
- **Acceptance framework (AI-1.8)** — `tests/`. Statikus, LLM-mentes regressziós
  teszt: agentenként required/forbidden domain + tool, system prompt kifejezések,
  handoff-célok pontos egyezése, üzleti forgatókönyvek strukturális ellenőrzése.
  Futtatás: `bun run ai:acceptance`.

## Fájlszerkezet

```
src/lib/ai-os/
  types.ts              — közös típusok
  providers.server.ts   — provider absztrakció (openai|lovable|...)
  constitution.ts       — 7 univerzális szabály (AI-1.1)
  agents.ts             — agent regiszter (provider/model/role/system prompt)
  tool-registry.ts      — központi tool nyilvántartás (CRM-független)
  memory.server.ts      — ai_memory CRUD
  audit.server.ts       — agent_runs + agent_run_steps perzisztencia
  runtime.server.ts     — runAgent() — egyetlen belépési pont
  runtime.functions.ts  — createServerFn wrapper a UI-hoz
  tests/                — acceptance fixture + runner (AI-1.8)
  adapters/
    crm-tools.ts        — CRM read toolok regisztrálása a registrybe
```