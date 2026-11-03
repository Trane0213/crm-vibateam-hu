/**
 * Központi AI-modellkonfiguráció — minden AI OS agent innen kapja a modellt.
 * Modellváltás kizárólag itt (tulajdonosi döntés 2026-11-03: gpt-6-astra, high).
 */
export const AI_MODEL = {
  provider: "openai",
  model: "gpt-6-astra",
  api: "responses",
  reasoning_effort: "high",
} as const;
