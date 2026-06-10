export type AiResponseShape = { text: string; json?: unknown };

export function parseAiResponse(raw: string): AiResponseShape {
  const text = raw.trim();
  const fence = text.match(/```json\s*([\s\S]*?)```/i);
  const candidate = fence?.[1] ?? (text.startsWith("{") || text.startsWith("[") ? text : null);
  if (candidate) { try { return { text, json: JSON.parse(candidate) }; } catch { /* */ } }
  return { text };
}