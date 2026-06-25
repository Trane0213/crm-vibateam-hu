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

## Fájlszerkezet

```
src/lib/ai-os/
  types.ts              — közös típusok
  providers.server.ts   — provider absztrakció (openai|lovable|...)
  agents.ts             — agent regiszter (provider/model/role/system prompt)
  tool-registry.ts      — központi tool nyilvántartás (CRM-független)
  memory.server.ts      — ai_memory CRUD
  audit.server.ts       — agent_runs + agent_run_steps perzisztencia
  runtime.server.ts     — runAgent() — egyetlen belépési pont
  runtime.functions.ts  — createServerFn wrapper a UI-hoz
  adapters/
    crm-tools.ts        — CRM read toolok regisztrálása a registrybe
```

A régi `src/lib/ai/*` namespace érintetlen marad, amíg a UI át nem áll.