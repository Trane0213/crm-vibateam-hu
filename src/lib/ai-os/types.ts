/**
 * AI OS — közös típusok. CRM-független.
 */

export type Role = "system" | "user" | "assistant" | "tool";

export type ChatMessage = {
  role: Role;
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
};

export type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type JsonSchema = Record<string, unknown>;

/**
 * Approval szint egy toolhoz — M5 approval infrastruktúra.
 *   - safe:      írás nincs, jóváhagyás nem kell.
 *   - confirm:   írás vagy hatással bíró művelet — egy jóváhagyás elég.
 *   - dangerous: nagy kockázatú (delete, konverzió, tracking, bid strategy) —
 *                a UI második, gépelt megerősítést kér.
 */
export type ApprovalLevel = "safe" | "confirm" | "dangerous";

/**
 * Egy tool publikus deklarációja a registryben — provider-független.
 *
 * JOGOSULTSÁGI RÉTEGEK (AI-1 kanonikus leképezés a meglévő mezőkre):
 *   1. READ (ki hívhatja egyáltalán): `allowed_agents` + `allowed_roles`.
 *      Üres lista = nincs korlát az adott dimenzióban.
 *   2. DOMAIN-FÓKUSZ (agent szintű szűrés): `domain` + agent
 *      `tool_domains` / `extra_tools`. A registryben a `domain` besorolás
 *      dönt, az agents.ts adja meg, ki melyik domaint látja.
 *   3. WRITE / EXECUTE / DANGEROUS (mit tehet): `approval`.
 *        - "safe":      olvasás vagy hatás nélküli hívás, jóváhagyás nem kell.
 *        - "confirm":   írás vagy hatással bíró művelet — egy jóváhagyás.
 *        - "dangerous": irreverzibilis (delete, konverzió stb.) — a UI
 *                       második, gépelt megerősítést kér.
 *   4. DRY-RUN VÉDELEM: `supports_dry_run`. Ha true, a runtime alapból
 *      `mode="dry_run"`-t injektál; execute-hoz kell approval.
 *
 * A négy réteget a `tool-registry.toolsForAgent` (1+2) és a
 * `runtime.server.assertAgentToolAccess` (1) + approval-loop (3+4)
 * érvényesíti szerveroldalon minden hívásnál. A kliensoldali szűrés
 * (visible-agents, agent-gate) csak UX, nem biztonsági határ.
 */
export type ToolSpec = {
  /** Egyedi név (snake_case). Ez kerül az LLM-nek. */
  name: string;
  /** Rövid emberi leírás. */
  description: string;
  /** JSON Schema az input paraméterekre. */
  parameters: JsonSchema;
  /**
   * LEGACY (M4-ig): ha true → confirm szintű jóváhagyás minden hívásra.
   * M5-től új toolok az `approval` mezőt használják.
   */
  needs_approval?: boolean;
  /**
   * M5 approval szint. Ha nincs megadva és `needs_approval` sincs → `"safe"`.
   * Ha `needs_approval: true` és nincs `approval` → `"confirm"` (backward compat).
   */
  approval?: ApprovalLevel;
  /**
   * Ha true, a tool támogatja a `mode: "dry_run" | "execute"` paramétert.
   * `dry_run` módban semmilyen mutation nem történik — csak a tervet adja vissza.
   * `dry_run` hívás soha NEM igényel approval-t, akkor sem, ha `approval !== "safe"`.
   * `execute` hívás minden nem-safe szinten approval-köteles.
   */
  supports_dry_run?: boolean;
  /** Kategória / domain (pl. "crm.companies", "crm.leads", "core.handoff"). */
  domain: string;
  /** Mely agentek hívhatják (id lista). Üres = bárki. */
  allowed_agents?: string[];
  /** Mely user role-ok használhatják (üres = bárki). */
  allowed_roles?: string[];
};

/** A tool tényleges futtatása. A runtime hívja, a registryben tárolva. */
export type ToolExecutor = (
  args: Record<string, unknown>,
  ctx: ToolContext,
) => Promise<unknown>;

export type ToolContext = {
  userId: string;
  agentId: string;
  threadId: string | null;
  runId: string;
  /** User-scoped Supabase kliens — RLS érvényesül. Olvasási toolokhoz ezt használd. */
  supabaseUser: import("@supabase/supabase-js").SupabaseClient;
  /** Service role kliens — CSAK explicit jogosultság-ellenőrzés után (write workflow). */
  supabaseAdmin: import("@supabase/supabase-js").SupabaseClient;
};

export type RegisteredTool = ToolSpec & { execute: ToolExecutor };

/** Provider-független LLM hívás eredménye. */
export type LlmResult = {
  text: string;
  tool_calls: ToolCall[];
  finish_reason: string | null;
  usage: { prompt_tokens?: number; completion_tokens?: number };
  model: string;
  provider: string;
};

export type ProviderId = "openai" | "lovable" | "anthropic";

export type AgentDefinition = {
  id: string;
  name: string;
  role: string;
  description: string;
  provider: ProviderId;
  model: string;
  temperature?: number;
  max_tokens?: number;
  /** A registry-ből mely domaineket lát (pl. ["crm.companies","crm.leads"]). */
  tool_domains: string[];
  /** Plusz explicit tool nevek. */
  extra_tools?: string[];
  /** A system prompt builder — futáskor a runtime hívja kontextussal. */
  buildSystemPrompt: (ctx: SystemPromptContext) => string;
  /**
   * Opcionális, async kiegészítés a system prompthoz. A runtime a user
   * Supabase klienssel hívja (RLS a user nevében). Ha string-et ad vissza,
   * a rendszer üres sorral elválasztva hozzáfűzi a buildSystemPrompt kimenetéhez.
   * Adatbázisból származó dinamikus szabályokhoz (pl. VIBA Ads Constitution).
   */
  augmentSystemPrompt?: (
    ctx: SystemPromptContext,
    userClient: import("@supabase/supabase-js").SupabaseClient,
  ) => Promise<string | null>;
  /** Orchestrator-e? Csak orchestrator hívhatja a handoff_to toolt. */
  is_orchestrator?: boolean;
  /**
   * Háttér-agent: snapshot-alapú, tool nélkül fut (pl. napi briefing,
   * összefoglaló, structured JSON kutató). NEM chatable, NEM handoff-célpont.
   * A `listHandoffTargets()` kiszűri.
   */
  is_background?: boolean;
};

export type SystemPromptContext = {
  userId: string;
  userRole: string | null;
  nowIso: string;
  /** Releváns ai_memory darabok (subject_type/subject_id/key/value). */
  memory: Array<{ subject_type: string; subject_id: string; key: string; value: unknown }>;
};