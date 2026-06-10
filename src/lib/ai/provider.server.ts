/**
 * SERVER-ONLY. Saját OpenAI provider réteg.
 * A CRM AI agentek (CRM / Sales / PM) közvetlenül az OpenAI Chat Completions
 * endpointot hívják — NEM Lovable AI Gateway-en keresztül.
 * Importálni kizárólag `createServerFn` handler törzséből szabad
 * (az OPENAI_API_KEY szerver-only secret).
 */

export const OPENAI_API_URL =
  process.env.OPENAI_API_BASE_URL?.replace(/\/$/, "") ?? "https://api.openai.com/v1";
export const DEFAULT_MODEL = process.env.OPENAI_MODEL ?? "gpt-5.5";

export type AiMessage = { role: "system" | "user" | "assistant"; content: string };

export async function aiChat(messages: AiMessage[], model: string = DEFAULT_MODEL): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not configured.");
  const t0 = Date.now();
  console.log(
    `[openai] → POST ${OPENAI_API_URL}/chat/completions  model=${model}  messages=${messages.length}  key=${key.slice(0, 7)}…`,
  );
  const res = await fetch(`${OPENAI_API_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, messages, stream: false }),
  });
  const dt = Date.now() - t0;
  if (res.status === 401) throw new Error("OpenAI: érvénytelen API kulcs (401). Ellenőrizd az OPENAI_API_KEY secretet.");
  if (res.status === 429) throw new Error("OpenAI rate limit (429). Próbáld újra hamarosan.");
  if (res.status === 402) throw new Error("OpenAI: nincs elég kredit (402). Tölts fel egyenleget az OpenAI fióknál.");
  if (!res.ok) throw new Error(`OpenAI hiba: ${res.status} ${await res.text().catch(() => "")}`);
  const json = (await res.json()) as any;
  const usedModel = json?.model ?? model;
  const usage = json?.usage ?? {};
  console.log(
    `[openai] ← ${res.status} OK  model=${usedModel}  tokens=${usage.prompt_tokens}→${usage.completion_tokens}  latency=${dt}ms`,
  );
  return json?.choices?.[0]?.message?.content ?? "";
}