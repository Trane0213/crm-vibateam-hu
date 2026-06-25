/**
 * AI OS — futási audit naplózás. SERVER-ONLY.
 *
 * agent_runs   = egy felhasználói üzenethez tartozó teljes futás.
 * agent_run_steps = lépésenkénti napló (llm / tool / handoff / approval / error).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type RunStartInput = {
  userId: string;
  agentId: string;
  threadId: string | null;
  provider: string;
  model: string;
};

export async function startRun(
  admin: SupabaseClient,
  input: RunStartInput,
): Promise<string> {
  const { data, error } = await admin
    .from("agent_runs")
    .insert({
      user_id: input.userId,
      agent_id: input.agentId,
      thread_id: input.threadId,
      provider: input.provider,
      model: input.model,
      status: "running",
    })
    .select("id")
    .single();
  if (error) throw new Error(`agent_runs start: ${error.message}`);
  return (data as { id: string }).id;
}

export async function logStep(
  admin: SupabaseClient,
  input: {
    runId: string;
    stepNo: number;
    kind: "llm" | "tool" | "handoff" | "approval" | "error";
    agentId?: string;
    toolName?: string;
    input?: unknown;
    output?: unknown;
    error?: string;
    durationMs?: number;
  },
): Promise<void> {
  await admin.from("agent_run_steps").insert({
    run_id: input.runId,
    step_no: input.stepNo,
    kind: input.kind,
    agent_id: input.agentId,
    tool_name: input.toolName,
    input_json: input.input as object | null,
    output_json: input.output as object | null,
    error: input.error,
    duration_ms: input.durationMs,
  });
}

export async function finishRun(
  admin: SupabaseClient,
  input: {
    runId: string;
    status: "ok" | "error" | "cancelled";
    errorMessage?: string;
    promptTokens?: number;
    completionTokens?: number;
    totalSteps?: number;
  },
): Promise<void> {
  await admin
    .from("agent_runs")
    .update({
      status: input.status,
      error_message: input.errorMessage ?? null,
      prompt_tokens: input.promptTokens ?? 0,
      completion_tokens: input.completionTokens ?? 0,
      total_steps: input.totalSteps ?? 0,
      finished_at: new Date().toISOString(),
    })
    .eq("id", input.runId);
}