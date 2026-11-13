import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { planReviews, reviewAllowance, isCreditError, nextStatusAfterFailure, areaSubmissionKey, areaIssueText, budapestDayStartIso, AREA_PATH, type PendingSignal, type ReviewPlan } from "./model";

type Db = SupabaseClient<Database>;
// Rugalmas patch-ekhez lazán típusozott hozzáférés a belső ai_review_* táblákhoz (csak szerveroldali admin kliens).
const t = (admin: Db, name: string) => (admin as unknown as SupabaseClient).from(name);

export type ReviewConfigRow = Database["public"]["Tables"]["ai_review_config"]["Row"];
export async function loadConfig(admin: Db): Promise<ReviewConfigRow> {
  const { data, error } = await admin.from("ai_review_config").select("*").eq("id", 1).single();
  if (error || !data) throw new Error("Az AI-felülvizsgálat beállítása nem olvasható.");
  return data;
}

export async function usageToday(admin: Db) {
  const since = budapestDayStartIso();
  const { data, error } = await t(admin, "ai_review_runs").select("llm_reviews,tokens_used").eq("kind", "review").gte("started_at", since);
  if (error) throw new Error("A napi keret nem ellenőrizhető.");
  const rows = (data ?? []) as { llm_reviews: number; tokens_used: number }[];
  return { reviewsToday: rows.reduce((a, r) => a + r.llm_reviews, 0), tokensToday: rows.reduce((a, r) => a + r.tokens_used, 0) };
}

async function tokensOf(admin: Db, runIds: string[]) {
  if (!runIds.length) return 0;
  const { data } = await admin.from("agent_runs").select("prompt_tokens,completion_tokens").in("id", runIds);
  return (data ?? []).reduce((a, r) => a + (r.prompt_tokens ?? 0) + (r.completion_tokens ?? 0), 0);
}

/** Determinisztikus gyűjtés (0 LLM). Ugyanaz az SQL fut az óránkénti ütemezésből és a Tulajdonos gombjáról. */
export async function collectNow(admin: Db, userId: string) {
  const { data, error } = await (admin as unknown as SupabaseClient).rpc("ai_review_collect", { p_trigger: "owner", p_user: userId });
  if (error) throw new Error("Az ellenőrzés nem futott le.");
  return data as { status: string; signals?: number; new?: number; new_for_review?: number; resolved?: number; llm_calls?: number };
}

async function runPlan(supabase: Db, userId: string, plan: ReviewPlan) {
  const { performIssueReview } = await import("@/lib/issue-review.server");
  if (plan.type === "issue") {
    const res = await performIssueReview(supabase, userId, { id: plan.issueId, mode: plan.mode });
    return { issueId: plan.issueId, runIds: res.runIds, llm: res.skipped ? 0 : 1 };
  }
  const key = await areaSubmissionKey(plan.agent, plan.signals.map((s) => s.signal_key));
  const text = areaIssueText(plan.agent, plan.signals);
  let issueId: string | null = null;
  const existing = await supabase.from("issue_reports").select("id").eq("reporter_id", userId).eq("submission_key", key).maybeSingle();
  if (existing.data) issueId = existing.data.id;
  else {
    // Ugyanaz a közös hibajegyzék és mentési út, mint a /help bejelentésnél (Tulajdonos a bejelentő, AI_REVIEW jelöléssel).
    const ins = await supabase.from("issue_reports").insert({ reporter_id: userId, reporter_role: "derived", submission_key: key, category: "bug", page_path: AREA_PATH[plan.agent], description: text.description, expected_result: text.expected, actual_result: text.actual, technical_code: "AI_REVIEW" }).select("id").single();
    if (ins.error || !ins.data) throw new Error("Az AI-felülvizsgálati hibajegy nem menthető.");
    issueId = ins.data.id;
  }
  const res = await performIssueReview(supabase, userId, { id: issueId, mode: "initial" });
  return { issueId, runIds: res.runIds, llm: res.skipped ? 0 : 1 };
}

/**
 * Tulajdonos által indított ciklus: friss determinisztikus gyűjtés, majd a kereten belül George célzott vizsgálata
 * kizárólag az érintett szakértővel. Futási zár, idempotens jelzés-claim, korlátozott újrapróbálás,
 * kredit/rate-limit hibánál szüneteltetés. Üzleti adatot nem módosít.
 */
export async function runReviewCycle(supabase: Db, admin: Db, userId: string) {
  const cfg = await loadConfig(admin);
  if (cfg.paused_reason) return { status: "paused" as const, reason: cfg.paused_reason, llmReviews: 0, tokens: 0, reviewed: [] as string[] };
  const collected = await collectNow(admin, userId);

  await t(admin, "ai_review_runs").update({ status: "error", finished_at: new Date().toISOString(), note: "stale_lease" }).eq("kind", "review").eq("status", "running").lt("lease_until", new Date().toISOString());
  const lock = await t(admin, "ai_review_runs").insert({ kind: "review", trigger: "owner", requested_by: userId, lease_until: new Date(Date.now() + 20 * 60_000).toISOString() }).select("id").single();
  if (lock.error || !lock.data) {
    if ((lock.error as { code?: string } | null)?.code === "23505") throw new Error("Már fut egy AI-felülvizsgálat. Várd meg a végét.");
    throw new Error("Az AI-felülvizsgálat nem indítható.");
  }
  const runId = (lock.data as { id: string }).id;
  const finish = (patch: Record<string, unknown>) => t(admin, "ai_review_runs").update({ finished_at: new Date().toISOString(), ...patch }).eq("id", runId);

  let llmReviews = 0; let tokens = 0; const reviewed: string[] = [];
  try {
    const allowance = reviewAllowance(cfg, await usageToday(admin));
    if (!allowance.slots) { await finish({ status: "skipped", note: `budget:${allowance.reason}` }); return { status: "budget" as const, reason: allowance.reason, collected, llmReviews, tokens, reviewed }; }
    const pend = await t(admin, "ai_review_signals").select("id,signal_key,domain,agent,severity,title,detail,source_table,source_id,occurrences,first_seen_at,review_attempts").eq("review_status", "pending").in("severity", ["critical", "warning"]).order("first_seen_at").limit(200);
    if (pend.error) throw new Error("A jelzések nem olvashatók.");
    const signals = (pend.data ?? []) as (PendingSignal & { review_attempts: number })[];
    const plans = planReviews(signals, allowance.slots);
    if (!plans.length) { await finish({ status: "skipped", note: "Nincs érdemi változás — 0 AI-hívás." }); return { status: "no_change" as const, collected, llmReviews, tokens, reviewed }; }

    for (const plan of plans) {
      const left = reviewAllowance(cfg, { reviewsToday: (await usageToday(admin)).reviewsToday + llmReviews, tokensToday: (await usageToday(admin)).tokensToday + tokens });
      if (!left.slots) break;
      const ids = plan.signals.map((s) => s.id);
      const claim = await t(admin, "ai_review_signals").update({ review_status: "in_review", last_run_id: runId }).in("id", ids).eq("review_status", "pending").select("id");
      const claimed = ((claim.data ?? []) as { id: string }[]).map((r) => r.id);
      if (!claimed.length) continue;
      try {
        const out = await runPlan(supabase, userId, plan);
        llmReviews += out.llm;
        tokens += await tokensOf(admin, out.runIds);
        await t(admin, "ai_review_signals").update({ review_status: "reviewed", reviewed_at: new Date().toISOString(), issue_id: out.issueId }).in("id", claimed);
        reviewed.push(out.issueId);
      } catch (e) {
        if (isCreditError(e)) {
          await t(admin, "ai_review_signals").update({ review_status: "pending" }).in("id", claimed);
          await t(admin, "ai_review_config").update({ paused_reason: "credit_or_rate_limit", paused_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", 1);
          await finish({ status: "paused", llm_reviews: llmReviews, tokens_used: tokens, note: "AI-kredit vagy rate-limit hiba: biztonságos leállás." });
          return { status: "paused" as const, reason: "credit_or_rate_limit", collected, llmReviews, tokens, reviewed };
        }
        console.error("[ai-review] plan failed:", (e instanceof Error ? e.message : String(e)).slice(0, 300));
        for (const s of plan.signals.filter((x) => claimed.includes(x.id))) {
          const attempts = (s as { review_attempts?: number }).review_attempts ?? 0;
          await t(admin, "ai_review_signals").update({ review_status: nextStatusAfterFailure(attempts), review_attempts: attempts + 1 }).eq("id", s.id);
        }
      }
    }
    await finish({ status: "ok", llm_reviews: llmReviews, tokens_used: tokens, note: `reviewed=${reviewed.length}` });
    return { status: "ok" as const, collected, llmReviews, tokens, reviewed };
  } catch (e) {
    await finish({ status: "error", llm_reviews: llmReviews, tokens_used: tokens, note: (e instanceof Error ? e.message : "error").slice(0, 300) });
    throw e;
  }
}
