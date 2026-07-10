/**
 * Website Knowledge — AI hívás wrapper.
 *
 * Reuse-olja az AI OS `callLlm` providert (project default: openai/gpt-4o-mini).
 * Minden hívás egy `website_ai_jobs` sort ír (kind, provider, model, tokenek,
 * cost, latencia, status). A cost gpt-4o-mini rates alapján becslés.
 *
 * A JSON választ prompt-alapon kérjük (nincs strict schema) → JSON.parse
 * fallback-kel. Ez a legrobusztusabb az AI OS `callLlm` mai felületén.
 */

import { callLlm } from "@/lib/ai-os/providers.server";
import { getAdminClient } from "@/integrations/supabase/server";

export const WK_MODEL = "gpt-4o-mini";
export const WK_PROVIDER = "openai" as const;

// gpt-4o-mini árazás (USD / 1M token) — 2024-Q4 nyilvános OpenAI listaár.
// A telemetria ez alapján becsüli a cost-ot; a `website_ai_jobs.total_cost_usd`
// pontos szintre WK-3 utáni telemetria-refactor emelheti.
const RATE_INPUT_PER_M_USD = 0.15;
const RATE_OUTPUT_PER_M_USD = 0.6;

export type WkAiJobKind =
  | "summary"
  | "entity_extraction"
  | "vision_caption"
  | "vision_ocr"
  | "other";

export interface WkAiCallInput {
  kind: WkAiJobKind;
  run_id: string;
  page_id: string;
  page_version_id: string;
  system: string;
  user: string;
  request_payload?: Record<string, unknown>;
}

export interface WkAiCallResult {
  ai_job_id: string;
  status: "success" | "failed";
  text: string;
  latency_ms: number;
  input_tokens: number | null;
  output_tokens: number | null;
  total_cost_usd: number | null;
  error_message: string | null;
}

function estimateCost(inputTokens: number | null, outputTokens: number | null): number | null {
  if (inputTokens == null && outputTokens == null) return null;
  const inCost = ((inputTokens ?? 0) / 1_000_000) * RATE_INPUT_PER_M_USD;
  const outCost = ((outputTokens ?? 0) / 1_000_000) * RATE_OUTPUT_PER_M_USD;
  return Number((inCost + outCost).toFixed(6));
}

export async function callWkAi(input: WkAiCallInput): Promise<WkAiCallResult> {
  const admin = getAdminClient();

  // 1) job insert (pending → running)
  const { data: jobRow, error: jobErr } = await admin
    .from("website_ai_jobs")
    .insert({
      run_id: input.run_id,
      page_id: input.page_id,
      page_version_id: input.page_version_id,
      job_kind: input.kind,
      provider: WK_PROVIDER,
      model: WK_MODEL,
      status: "running",
      request_payload: input.request_payload ?? { system: input.system.slice(0, 200) },
    })
    .select("id")
    .single();
  if (jobErr || !jobRow) {
    throw new Error(`ai_jobs insert: ${jobErr?.message ?? "no row"}`);
  }
  const ai_job_id = jobRow.id as string;
  const started = Date.now();

  try {
    const result = await callLlm({
      provider: WK_PROVIDER,
      model: WK_MODEL,
      messages: [
        { role: "system", content: input.system },
        { role: "user", content: input.user },
      ],
      temperature: 0.2,
    });
    const latency_ms = Date.now() - started;
    const input_tokens = result.usage.prompt_tokens ?? null;
    const output_tokens = result.usage.completion_tokens ?? null;
    const total_cost_usd = estimateCost(input_tokens, output_tokens);

    await admin
      .from("website_ai_jobs")
      .update({
        status: "success",
        input_tokens,
        output_tokens,
        input_cost_usd:
          input_tokens != null
            ? Number(((input_tokens / 1_000_000) * RATE_INPUT_PER_M_USD).toFixed(6))
            : null,
        output_cost_usd:
          output_tokens != null
            ? Number(((output_tokens / 1_000_000) * RATE_OUTPUT_PER_M_USD).toFixed(6))
            : null,
        total_cost_usd,
        latency_ms,
        finished_at: new Date().toISOString(),
      })
      .eq("id", ai_job_id);

    return {
      ai_job_id,
      status: "success",
      text: result.text,
      latency_ms,
      input_tokens,
      output_tokens,
      total_cost_usd,
      error_message: null,
    };
  } catch (e) {
    const latency_ms = Date.now() - started;
    const msg = e instanceof Error ? e.message : String(e);
    await admin
      .from("website_ai_jobs")
      .update({
        status: "failed",
        error_message: msg.slice(0, 500),
        latency_ms,
        finished_at: new Date().toISOString(),
      })
      .eq("id", ai_job_id);
    return {
      ai_job_id,
      status: "failed",
      text: "",
      latency_ms,
      input_tokens: null,
      output_tokens: null,
      total_cost_usd: null,
      error_message: msg,
    };
  }
}

/**
 * A modellek gyakran ```json ... ``` code fence-be csomagolják a választ.
 * Ez a helper minden vezető/követő szemetet megpróbál levágni és JSON.parse-ol.
 */
export function safeParseJson<T = unknown>(text: string): T | null {
  if (!text) return null;
  const trimmed = text.trim();
  const stripped = trimmed
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  const firstBrace = stripped.indexOf("{");
  const lastBrace = stripped.lastIndexOf("}");
  const candidate =
    firstBrace >= 0 && lastBrace > firstBrace
      ? stripped.slice(firstBrace, lastBrace + 1)
      : stripped;
  try {
    return JSON.parse(candidate) as T;
  } catch {
    return null;
  }
}