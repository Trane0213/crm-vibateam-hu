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

/** Egy tool publikus deklarációja a registryben — provider-független. */
export type ToolSpec = {
  /** Egyedi név (snake_case). Ez kerül az LLM-nek. */
  name: string;
  /** Rövid emberi leírás. */
  description: string;
  /** JSON Schema az input paraméterekre. */
  parameters: JsonSchema;
  /** Ha write művelet → felhasználói jóváhagyás kötelező. */
  needs_approval?: boolean;
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
};

export type SystemPromptContext = {
  userId: string;
  userRole: string | null;
  nowIso: string;
  /** Releváns ai_memory darabok (subject_type/subject_id/key/value). */
  memory: Array<{ subject_type: string; subject_id: string; key: string; value: unknown }>;
};