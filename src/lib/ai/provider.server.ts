/**
 * SERVER-ONLY. Lovable AI Gateway provider helper.
 * Egyelőre `fetch`-alapú minimal kliens — az `ai` + `@ai-sdk/openai-compatible`
 * csomagok telepítése után átírható AI SDK provider-re. Importálni kizárólag
 * `createServerFn` handler törzséből szabad (a LOVABLE_API_KEY szerver-only).
 */

export const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1";
export const DEFAULT_MODEL = "google/gemini-3-flash-preview";

export type AiMessage = { role: "system" | "user" | "assistant"; content: string };

export async function aiChat(messages: AiMessage[], model: string = DEFAULT_MODEL): Promise<string> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY is not configured.");
  const res = await fetch(`${AI_GATEWAY_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Lovable-API-Key": key,
      "X-Lovable-AIG-SDK": "vercel-ai-sdk",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, messages, stream: false }),
  });
  if (res.status === 429) throw new Error("Az AI gateway túlterhelt (429). Próbáld újra hamarosan.");
  if (res.status === 402) throw new Error("Az AI kreditek elfogytak (402). Töltsd fel a workspace egyenleget.");
  if (!res.ok) throw new Error(`AI gateway hiba: ${res.status} ${await res.text().catch(() => "")}`);
  const json = (await res.json()) as any;
  return json?.choices?.[0]?.message?.content ?? "";
}