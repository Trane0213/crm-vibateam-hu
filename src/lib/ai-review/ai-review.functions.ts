import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

function requireOwner(owner: { data: unknown; error: unknown }) {
  if (owner.error) throw new Error("A jogosultság nem ellenőrizhető.");
  if (owner.data !== true) throw new Error("Az automatikus AI-felülvizsgálatot csak a Tulajdonos kezelheti.");
}

export const aiReviewOverview = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  requireOwner(await context.supabase.rpc("is_owner_role", { _auth_user: context.userId }));
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { loadConfig, usageToday } = await import("./review.server");
  const db = supabaseAdmin as unknown as import("@supabase/supabase-js").SupabaseClient;
  const [config, usage, runs, signals, agentRuns] = await Promise.all([
    loadConfig(supabaseAdmin),
    usageToday(supabaseAdmin),
    db.from("ai_review_runs").select("id,kind,trigger,status,started_at,finished_at,signal_count,new_signal_count,llm_reviews,tokens_used,note").order("started_at", { ascending: false }).limit(12),
    db.from("ai_review_signals").select("id,signal_key,domain,agent,severity,title,detail,occurrences,first_seen_at,last_seen_at,review_status,issue_id,reviewed_at").neq("review_status", "resolved").order("last_seen_at", { ascending: false }).limit(300),
    supabaseAdmin.from("agent_runs").select("model,prompt_tokens,completion_tokens,started_at").gte("started_at", new Date(Date.now() - 30 * 86400_000).toISOString()).range(0, 9999),
  ]);
  if (runs.error || signals.error || agentRuns.error) throw new Error("Az AI-felülvizsgálat állapota nem tölthető be.");
  const { budapestDayStartIso } = await import("./model");
  const dayStart = budapestDayStartIso();
  const perModel: Record<string, { runs: number; tokens30d: number; tokensToday: number }> = {};
  for (const r of agentRuns.data ?? []) {
    const k = r.model || "ismeretlen";
    const m = (perModel[k] ??= { runs: 0, tokens30d: 0, tokensToday: 0 });
    const tok = (r.prompt_tokens ?? 0) + (r.completion_tokens ?? 0);
    m.runs++; m.tokens30d += tok; if (r.started_at >= dayStart) m.tokensToday += tok;
  }
  return { config, usage, runs: runs.data ?? [], signals: signals.data ?? [], perModel };
});

export const aiReviewUpdateConfig = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    enabled: z.boolean(),
    dailyReviewLimit: z.number().int().min(1).max(48),
    dailyTokenLimit: z.number().int().min(10_000).max(20_000_000),
    maxReviewsPerRun: z.number().int().min(1).max(4),
    resume: z.boolean().default(false),
    confirmBudget: z.boolean().default(false),
  }).strict())
  .handler(async ({ data, context }) => {
    requireOwner(await context.supabase.rpc("is_owner_role", { _auth_user: context.userId }));
    if (data.enabled && !data.confirmBudget) throw new Error("Bekapcsolás előtt jóvá kell hagyni a napi keretet.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as import("@supabase/supabase-js").SupabaseClient;
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = { enabled: data.enabled, daily_review_limit: data.dailyReviewLimit, daily_token_limit: data.dailyTokenLimit, max_reviews_per_run: data.maxReviewsPerRun, updated_at: now };
    if (data.enabled) { patch.approved_by = context.userId; patch.approved_at = now; }
    if (data.resume) { patch.paused_reason = null; patch.paused_at = null; }
    const { error } = await db.from("ai_review_config").update(patch).eq("id", 1);
    if (error) throw new Error("A beállítás nem menthető.");
    const { loadConfig } = await import("./review.server");
    return loadConfig(supabaseAdmin);
  });

/** Determinisztikus ellenőrzés most — AI-hívás és költség nélkül. */
export const aiReviewCollectNow = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  requireOwner(await context.supabase.rpc("is_owner_role", { _auth_user: context.userId }));
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { collectNow } = await import("./review.server");
  return collectNow(supabaseAdmin, context.userId);
});

/** George célzott vizsgálata a függő jelzésekre (fizetős AI-hívás, a jóváhagyott kereten belül). */
export const aiReviewRunNow = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  requireOwner(await context.supabase.rpc("is_owner_role", { _auth_user: context.userId }));
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { runReviewCycle } = await import("./review.server");
  return runReviewCycle(context.supabase, supabaseAdmin, context.userId);
});
