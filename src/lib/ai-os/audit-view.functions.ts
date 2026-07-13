/**
 * AI OS — Agent Audit View server functions.
 *
 * Owner-only telemetria a `/settings/agent-audit` oldalhoz. Az utolsó N
 * agent-futás lépéseit adja vissza (agent_runs + agent_run_steps),
 * requireSupabaseAuth alatt — RLS gondoskodik arról, hogy csak a saját
 * user_id-jével rögzített futásokat lássa az adott user.
 *
 * Nem regisztrál új AI toolt, kizárólag UI adatforrás.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/middleware";

export type AuditRunSummary = {
  id: string;
  agent_id: string;
  provider: string | null;
  model: string | null;
  status: string;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  total_steps: number;
  prompt_tokens: number;
  completion_tokens: number;
  thread_id: string | null;
  error_message: string | null;
  tool_count: number;
  tool_names: string[];
  empty_tool_count: number;
};

export type AuditRunStep = {
  id: string;
  step_no: number;
  kind: string;
  agent_id: string | null;
  tool_name: string | null;
  duration_ms: number | null;
  error: string | null;
  created_at: string;
  is_empty: boolean;
  input_preview: string;
  output_preview: string;
};

function previewJson(v: unknown, max = 240): string {
  if (v == null) return "";
  try {
    const s = typeof v === "string" ? v : JSON.stringify(v);
    return s.length > max ? s.slice(0, max) + "…" : s;
  } catch {
    return "";
  }
}

function isEmptyOutput(out: unknown): boolean {
  if (out == null) return true;
  if (typeof out === "string") return out.trim().length === 0;
  if (Array.isArray(out)) return out.length === 0;
  if (typeof out === "object") {
    const o = out as Record<string, unknown>;
    // Gyakori üres-válasz alakok az adaptereinkben.
    if (Array.isArray(o.rows) && (o.rows as unknown[]).length === 0) return true;
    if (Array.isArray(o.items) && (o.items as unknown[]).length === 0) return true;
    if (Array.isArray(o.results) && (o.results as unknown[]).length === 0) return true;
    if (o.error) return false;
    if (Object.keys(o).length === 0) return true;
  }
  return false;
}

/**
 * Utolsó N futás listája + agent szűrő. Owner-only route használja, de a
 * requireSupabaseAuth + RLS mindenkinek csak a sajátját mutatja.
 */
export const listRecentAgentRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { agentId?: string | null; limit?: number } | undefined) => data ?? {},
  )
  .handler(async ({ data, context }): Promise<AuditRunSummary[]> => {
    const sb = context.supabase;
    const limit = Math.min(Math.max(data.limit ?? 20, 1), 100);
    let q = sb
      .from("agent_runs")
      .select(
        "id,agent_id,provider,model,status,started_at,finished_at,total_steps,prompt_tokens,completion_tokens,thread_id,error_message",
      )
      .order("started_at", { ascending: false })
      .limit(limit);
    if (data.agentId) q = q.eq("agent_id", data.agentId);
    const { data: runs, error } = await q;
    if (error) throw new Error(`agent_runs read: ${error.message}`);
    const runIds = (runs ?? []).map((r) => r.id);
    if (runIds.length === 0) return [];

    const { data: steps, error: stepErr } = await sb
      .from("agent_run_steps")
      .select("run_id,kind,tool_name,output_json,duration_ms")
      .in("run_id", runIds);
    if (stepErr) throw new Error(`agent_run_steps read: ${stepErr.message}`);

    const byRun = new Map<string, { names: string[]; empty: number; tools: number }>();
    for (const s of steps ?? []) {
      const bucket = byRun.get(s.run_id) ?? { names: [], empty: 0, tools: 0 };
      if (s.kind === "tool" && s.tool_name) {
        bucket.tools += 1;
        bucket.names.push(s.tool_name);
        if (isEmptyOutput(s.output_json)) bucket.empty += 1;
      }
      byRun.set(s.run_id, bucket);
    }

    return (runs ?? []).map((r) => {
      const b = byRun.get(r.id) ?? { names: [], empty: 0, tools: 0 };
      const startedMs = r.started_at ? Date.parse(r.started_at) : NaN;
      const finishedMs = r.finished_at ? Date.parse(r.finished_at) : NaN;
      const duration =
        Number.isFinite(startedMs) && Number.isFinite(finishedMs) ? finishedMs - startedMs : null;
      return {
        id: r.id,
        agent_id: r.agent_id,
        provider: r.provider,
        model: r.model,
        status: r.status,
        started_at: r.started_at,
        finished_at: r.finished_at,
        duration_ms: duration,
        total_steps: r.total_steps ?? 0,
        prompt_tokens: r.prompt_tokens ?? 0,
        completion_tokens: r.completion_tokens ?? 0,
        thread_id: r.thread_id,
        error_message: r.error_message,
        tool_count: b.tools,
        tool_names: b.names,
        empty_tool_count: b.empty,
      };
    });
  });

/**
 * Egy adott futás összes lépése, sorrendben.
 */
export const getAgentRunSteps = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { runId: string }) => data)
  .handler(async ({ data, context }): Promise<AuditRunStep[]> => {
    const sb = context.supabase;
    const { data: rows, error } = await sb
      .from("agent_run_steps")
      .select("id,step_no,kind,agent_id,tool_name,duration_ms,error,created_at,input_json,output_json")
      .eq("run_id", data.runId)
      .order("step_no", { ascending: true });
    if (error) throw new Error(`agent_run_steps read: ${error.message}`);
    return (rows ?? []).map((r) => ({
      id: r.id,
      step_no: r.step_no,
      kind: r.kind,
      agent_id: r.agent_id,
      tool_name: r.tool_name,
      duration_ms: r.duration_ms,
      error: r.error,
      created_at: r.created_at,
      is_empty: r.kind === "tool" ? isEmptyOutput(r.output_json) : false,
      input_preview: previewJson(r.input_json),
      output_preview: previewJson(r.output_json),
    }));
  });