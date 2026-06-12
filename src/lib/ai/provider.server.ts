/**
 * SERVER-ONLY. AI provider réteg.
 *
 * Provider választás futásidőben:
 *   1) ha OPENAI_API_KEY van → közvetlen OpenAI API (api.openai.com),
 *   2) különben fallback a Lovable AI Gateway-re (LOVABLE_API_KEY).
 *
 * Override: OPENAI_API_BASE_URL, OPENAI_MODEL.
 * Csak `createServerFn` handler törzséből importálható.
 */

type Provider = {
  name: "openai" | "lovable";
  key: string;
  baseUrl: string;
  defaultModel: string;
};

function resolveProvider(): Provider | null {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    return {
      name: "openai",
      key: openaiKey,
      baseUrl: (process.env.OPENAI_API_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, ""),
      defaultModel: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    };
  }
  const lovableKey = process.env.LOVABLE_API_KEY;
  if (lovableKey) {
    return {
      name: "lovable",
      key: lovableKey,
      baseUrl: (process.env.OPENAI_API_BASE_URL ?? "https://ai.gateway.lovable.dev/v1").replace(/\/$/, ""),
      defaultModel: process.env.OPENAI_MODEL ?? "google/gemini-3-flash-preview",
    };
  }
  return null;
}

const _boot = resolveProvider();
export const OPENAI_API_URL = _boot?.baseUrl ?? "https://api.openai.com/v1";
export const DEFAULT_MODEL = _boot?.defaultModel ?? "gpt-4o-mini";

export type AiMessage = { role: "system" | "user" | "assistant"; content: string };

export type AiToolDef = {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, any> };
};

export type AiToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type AiChatResult = {
  text: string;
  tool_calls: AiToolCall[];
  finish_reason: string | null;
};

export async function aiChat(messages: any[], model?: string, tools?: AiToolDef[]): Promise<AiChatResult> {
  const provider = resolveProvider();
  if (!provider) throw new Error("AI provider nincs konfigurálva (OPENAI_API_KEY vagy LOVABLE_API_KEY hiányzik).");
  const usedModel = model ?? provider.defaultModel;
  const t0 = Date.now();
  console.log(
    `[ai:${provider.name}] → POST ${provider.baseUrl}/chat/completions  model=${usedModel}  messages=${messages.length}  tools=${tools?.length ?? 0}`,
  );
  const body: Record<string, any> = { model: usedModel, messages, stream: false };
  if (tools && tools.length) {
    body.tools = tools;
    body.tool_choice = "auto";
  }
  const headers: Record<string, string> = {
    Authorization: `Bearer ${provider.key}`,
    "Content-Type": "application/json",
  };
  if (provider.name === "lovable") headers["Lovable-API-Key"] = provider.key;
  const res = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const dt = Date.now() - t0;
  if (res.status === 401) throw new Error(`AI (${provider.name}): érvénytelen API kulcs (401).`);
  if (res.status === 429) throw new Error("AI rate limit (429). Próbáld újra hamarosan.");
  if (res.status === 402)
    throw new Error(
      provider.name === "lovable"
        ? "AI: nincs elég kredit (402). Tölts fel egyenleget a Lovable workspace beállításainál."
        : "AI (OpenAI): fizetési/kvóta hiba (402). Ellenőrizd az OpenAI billinget.",
    );
  if (!res.ok) throw new Error(`AI (${provider.name}) hiba: ${res.status} ${await res.text().catch(() => "")}`);
  const json = (await res.json()) as any;
  const respModel = json?.model ?? usedModel;
  const usage = json?.usage ?? {};
  const choice = json?.choices?.[0] ?? {};
  const msg = choice.message ?? {};
  console.log(
    `[ai:${provider.name}] ← ${res.status} OK  model=${respModel}  tokens=${usage.prompt_tokens}→${usage.completion_tokens}  tool_calls=${msg.tool_calls?.length ?? 0}  finish=${choice.finish_reason}  latency=${dt}ms`,
  );
  return {
    text: msg.content ?? "",
    tool_calls: (msg.tool_calls ?? []) as AiToolCall[],
    finish_reason: choice.finish_reason ?? null,
  };
}