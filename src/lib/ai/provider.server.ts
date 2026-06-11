/**
 * SERVER-ONLY. AI provider réteg a Lovable AI Gateway-n keresztül
 * (OpenAI-kompatibilis Chat Completions endpoint).
 * Importálni kizárólag `createServerFn` handler törzséből szabad
 * (a LOVABLE_API_KEY szerver-only secret).
 */

export const OPENAI_API_URL =
  process.env.OPENAI_API_BASE_URL?.replace(/\/$/, "") ?? "https://ai.gateway.lovable.dev/v1";
export const DEFAULT_MODEL = process.env.OPENAI_MODEL ?? "openai/gpt-5.5";

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

export async function aiChat(messages: any[], model: string = DEFAULT_MODEL, tools?: AiToolDef[]): Promise<AiChatResult> {
  const key = process.env.LOVABLE_API_KEY ?? process.env.OPENAI_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY is not configured.");
  const t0 = Date.now();
  console.log(
    `[ai] → POST ${OPENAI_API_URL}/chat/completions  model=${model}  messages=${messages.length}  tools=${tools?.length ?? 0}`,
  );
  const body: Record<string, any> = { model, messages, stream: false };
  if (tools && tools.length) {
    body.tools = tools;
    body.tool_choice = "auto";
  }
  const res = await fetch(`${OPENAI_API_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Lovable-API-Key": key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const dt = Date.now() - t0;
  if (res.status === 401) throw new Error("AI: érvénytelen API kulcs (401).");
  if (res.status === 429) throw new Error("AI rate limit (429). Próbáld újra hamarosan.");
  if (res.status === 402) throw new Error("AI: nincs elég kredit (402). Tölts fel egyenleget a Lovable workspace beállításainál.");
  if (!res.ok) throw new Error(`AI hiba: ${res.status} ${await res.text().catch(() => "")}`);
  const json = (await res.json()) as any;
  const usedModel = json?.model ?? model;
  const usage = json?.usage ?? {};
  const choice = json?.choices?.[0] ?? {};
  const msg = choice.message ?? {};
  console.log(
    `[ai] ← ${res.status} OK  model=${usedModel}  tokens=${usage.prompt_tokens}→${usage.completion_tokens}  tool_calls=${msg.tool_calls?.length ?? 0}  finish=${choice.finish_reason}  latency=${dt}ms`,
  );
  return {
    text: msg.content ?? "",
    tool_calls: (msg.tool_calls ?? []) as AiToolCall[],
    finish_reason: choice.finish_reason ?? null,
  };
}