# AI Service réteg

Ez a mappa az AI agentek **architektúráját** tartalmazza. **Nincs benne LLM hívás,
nincs prompt rendszer, nincs chatbot.** A jelen kör célja kizárólag az volt, hogy
a későbbi OpenAI / Lovable AI Gateway bekötés egy ismert, központi belépési ponton
keresztül történjen.

## Fájlok

- `agents.ts` — `AGENTS` regisztráció: CRM, Értékesítő, Projektvezető agentek
  szerepkörrel, leírással és resource-szintű képességmátrixszal
  (`Partial<Record<CrmResource, ('read'|'write')[]>>`).
- `runAgent()` — placeholder. Jelenleg `throw`-ol, hogy egyetlen kódhely se
  hívjon LLM-et véletlenül, amíg a teljes futtató (gateway + prompt + tool-calling
  + audit) be nem épül.

## Mit fed le már most

- Központi tipusrendszer: `AgentId`, `CrmResource`, `AgentCapability`.
- Jogosultsági ellenőrző: `canAgent(agentId, resource, action)`.
- Erőforrás-listázó: `listAgentResources(agentId)`.

## Mit NEM fed le

- Lovable AI Gateway / OpenAI kliens.
- Prompt sablonok.
- Tool-calling adapterek a Supabase resource-okra.
- Agent futtató (run loop), streaming, audit log.
- Chat UI.

## Következő kör (javaslat)

1. AI Gateway bekötése `createServerFn` mögé (`src/lib/ai/gateway.functions.ts`).
2. Resource-tool adapterek (`src/lib/ai/tools/*.ts`) a `capabilities` szerint
   szűrve, RLS-tisztelő Supabase-klienssel.
3. `runAgent()` valódi implementációja: prompt + tool-call loop + audit insert
   egy `agent_activity` táblába.
4. Egyszerű chat felület (`/ai`) három fix agent választóval.