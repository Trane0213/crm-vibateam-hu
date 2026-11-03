/**
 * AI OS — provider absztrakció. SERVER-ONLY.
 *
 * Minden provider OpenAI-kompatibilis chat/completions végpontot beszél
 * (a Lovable Gateway is). Új provider hozzáadása = új belépés a
 * PROVIDERS mapben.
 *
 * NEM tartalmaz CRM-logikát.
 */

import type { ChatMessage, LlmResult, ProviderId, ToolSpec } from "./types";

type ProviderConfig = {
  baseUrl: string;
  apiKey: string;
  /** Plusz headerek (pl. Lovable-API-Key). */
  extraHeaders?: Record<string, string>;
};

function resolveProvider(id: ProviderId): ProviderConfig | null {
  switch (id) {
    case "openai": {
      const k = process.env.OPENAI_API_KEY;
      if (!k) return null;
      return {
        baseUrl: (process.env.OPENAI_API_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, ""),
        apiKey: k,
      };
    }
    case "lovable": {
      const k = process.env.LOVABLE_API_KEY;
      if (!k) return null;
      return {
        baseUrl: "https://ai.gateway.lovable.dev/v1",
        apiKey: k,
        extraHeaders: { "Lovable-API-Key": k },
      };
    }
    case "anthropic": {
      // Anthropic-nek nincs natív OpenAI-kompatibilis route; ha a felhasználó
      // a Lovable Gateway-en keresztül hív Claude-ot, használja a "lovable"
      // providert és egy claude/* modell ID-t.
      return null;
    }
  }
}

function toolsToOpenAi(tools: ToolSpec[]) {
  return tools.map((t) => ({
    type: "function" as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
}

const REQUEST_TIMEOUT_MS = Number(process.env.AI_REQUEST_TIMEOUT_MS ?? 60_000);

async function fetchWithTimeout(url: string, init: RequestInit, ms: number) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

export type CallLlmArgs = {
  provider: ProviderId;
  model: string;
  messages: ChatMessage[];
  tools?: ToolSpec[];
  temperature?: number;
  max_tokens?: number;
  api?: "chat" | "responses";
  reasoning_effort?: "low" | "medium" | "high";
};

/** Chat-formátumú runtime-üzenetek → Responses API (stateless) instructions + input elemek. */
export function toResponsesInput(messages: ChatMessage[]) {
  const instructions: string[] = [];
  const input: Record<string, unknown>[] = [];
  for (const m of messages) {
    if (m.role === "system") { instructions.push(m.content); continue; }
    if (m.role === "tool") {
      input.push({ type: "function_call_output", call_id: m.tool_call_id, output: m.content ?? "" });
      continue;
    }
    if (m.content) input.push({ role: m.role, content: m.content });
    if (m.role === "assistant") for (const c of m.tool_calls ?? []) {
      input.push({ type: "function_call", call_id: c.id, name: c.function.name, arguments: c.function.arguments });
    }
  }
  return { instructions: instructions.join("\n\n"), input };
}

/** Responses API kimenet → provider-független LlmResult. */
export function fromResponsesOutput(json: any, provider: string, model: string): LlmResult {
  const out: any[] = Array.isArray(json?.output) ? json.output : [];
  const text = out.filter((o) => o?.type === "message")
    .flatMap((o) => (o.content ?? []).filter((c: any) => c?.type === "output_text").map((c: any) => c.text))
    .join("");
  const tool_calls = out.filter((o) => o?.type === "function_call").map((o) => ({
    id: String(o.call_id), type: "function" as const, function: { name: String(o.name), arguments: String(o.arguments ?? "{}") },
  }));
  return {
    text, tool_calls,
    finish_reason: tool_calls.length ? "tool_calls" : (json?.status ?? null),
    usage: { prompt_tokens: json?.usage?.input_tokens, completion_tokens: json?.usage?.output_tokens },
    model: json?.model ?? model, provider,
  };
}

/** Egyetlen LLM hívás. Tool-loopot a runtime kezeli. */
export async function callLlm(args: CallLlmArgs): Promise<LlmResult> {
  const cfg = resolveProvider(args.provider);
  if (!cfg) {
    throw new Error(
      `AI provider "${args.provider}" nincs konfigurálva (hiányzó API kulcs).`,
    );
  }

  if (args.api === "responses") {
    const { instructions, input } = toResponsesInput(args.messages);
    const body: Record<string, unknown> = { model: args.model, instructions, input, store: false };
    if (args.reasoning_effort) body.reasoning = { effort: args.reasoning_effort };
    if (args.max_tokens != null) body.max_output_tokens = args.max_tokens;
    if (args.tools?.length) {
      body.tools = args.tools.map((t) => ({ type: "function", name: t.name, description: t.description, parameters: t.parameters, strict: false }));
      body.tool_choice = "auto";
    }
    const res = await fetchWithTimeout(`${cfg.baseUrl}/responses`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json", ...(cfg.extraHeaders ?? {}) },
      body: JSON.stringify(body),
    }, Number(process.env.AI_REASONING_TIMEOUT_MS ?? 180_000));
    if (!res.ok) {
      const raw = await res.text().catch(() => "");
      throw new Error(`AI (${args.provider}/${args.model}) hiba ${res.status}: ${raw.slice(0, 300)}`);
    }
    return fromResponsesOutput(await res.json(), args.provider, args.model);
  }

  const body: Record<string, unknown> = {
    model: args.model,
    messages: args.messages,
    stream: false,
  };
  if (args.temperature != null) body.temperature = args.temperature;
  if (args.max_tokens != null) body.max_tokens = args.max_tokens;
  if (args.tools?.length) {
    body.tools = toolsToOpenAi(args.tools);
    body.tool_choice = "auto";
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${cfg.apiKey}`,
    "Content-Type": "application/json",
    ...(cfg.extraHeaders ?? {}),
  };

  const res = await fetchWithTimeout(
    `${cfg.baseUrl}/chat/completions`,
    { method: "POST", headers, body: JSON.stringify(body) },
    REQUEST_TIMEOUT_MS,
  );

  if (!res.ok) {
    const raw = await res.text().catch(() => "");
    throw new Error(`AI (${args.provider}/${args.model}) hiba ${res.status}: ${raw.slice(0, 300)}`);
  }

  const json: any = await res.json();
  const choice = json?.choices?.[0] ?? {};
  const msg = choice.message ?? {};
  return {
    text: msg.content ?? "",
    tool_calls: (msg.tool_calls ?? []) as LlmResult["tool_calls"],
    finish_reason: choice.finish_reason ?? null,
    usage: {
      prompt_tokens: json?.usage?.prompt_tokens,
      completion_tokens: json?.usage?.completion_tokens,
    },
    model: json?.model ?? args.model,
    provider: args.provider,
  };
}