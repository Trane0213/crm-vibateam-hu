import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { issueInput } from "./issue-reports-model";

const columns = "id,reporter_id,reporter_role,created_at,page_path,category,description,expected_result,actual_result,technical_code,status,owner_note,updated_at,ai_specialist,ai_analysis,ai_evidence,ai_analyzed_at,ai_run_count,reporter_verdict,reporter_feedback,reporter_verdict_at";

export const submitIssue = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(issueInput).handler(async ({ data, context }) => {
  const { supabase, userId } = context;
  const old = await supabase.from("issue_reports").select(`${columns},submission_key`).eq("reporter_id", userId).eq("submission_key", data.submissionKey).maybeSingle();
  if (old.error) throw new Error("A bejelentés ellenőrzése nem sikerült.");
  if (old.data) {
    if (old.data.description !== data.description || old.data.expected_result !== data.expectedResult || old.data.actual_result !== data.actualResult || old.data.page_path !== data.pagePath || old.data.category !== data.category || (old.data.technical_code ?? "") !== data.technicalCode) throw new Error("Ezzel az azonosítóval más tartalmú jelentés már mentve van.");
    return old.data;
  }
  const { data: row, error } = await supabase.from("issue_reports").insert({ reporter_id: userId, reporter_role: "derived", submission_key: data.submissionKey, category: data.category, page_path: data.pagePath, description: data.description, expected_result: data.expectedResult, actual_result: data.actualResult, technical_code: data.technicalCode || null }).select("id").single();
  if (error || !row) throw new Error("A bejelentés nem menthető. Újrapróbálás előtt ellenőrizd a saját jelentéseidet.");
  const saved = await supabase.from("issue_reports").select(columns).eq("id", row.id).single();
  if (saved.error || !saved.data) throw new Error("A mentés visszaolvasása nem igazolt. Ellenőrizd a saját jelentéseidet.");
  return saved.data;
});

export const listIssues = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).inputValidator(z.object({ page: z.number().int().min(0).max(10000) })).handler(async ({ data, context }) => {
  const owner = await context.supabase.rpc("is_owner_role", { _auth_user: context.userId });
  if (owner.error) throw new Error("A jogosultság nem ellenőrizhető.");
  const q = context.supabase.from("issue_reports").select(columns, { count: "exact" }).order("created_at", { ascending: false }).order("id").range(data.page * 20, data.page * 20 + 19);
  const result = await (owner.data ? q : q.eq("reporter_id", context.userId));
  if (result.error) throw new Error("A bejelentések nem tölthetők be.");
  return { rows: result.data ?? [], total: result.count ?? 0, owner: owner.data === true, me: context.userId };
});

export const updateIssue = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(z.object({ id: z.string().uuid(), status: z.enum(["new", "investigating", "awaiting_fix", "checking", "closed", "usage_question"]), note: z.string().max(2000), expectedUpdatedAt: z.string() }).strict()).handler(async ({ data, context }) => {
  const owner = await context.supabase.rpc("is_owner_role", { _auth_user: context.userId });
  if (owner.error || owner.data !== true) throw new Error("Csak a tulajdonos kezelhet státuszt.");
  const { data: row, error } = await context.supabase.from("issue_reports").update({ status: data.status, owner_note: data.note }).eq("id", data.id).eq("updated_at", data.expectedUpdatedAt).select(columns).single();
  if (error || !row) throw new Error("A státusz nem menthető vagy a jelentés időközben változott. Frissítsd a listát.");
  return row;
});

/** Reporter confirms after a fix whether the problem is solved (resolved → closed, else back to investigating). */
export const verifyIssue = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(z.object({ id: z.string().uuid(), verdict: z.enum(["resolved", "not_resolved"]), feedback: z.string().trim().max(1000).default("") }).strict()).handler(async ({ data, context }) => {
  const own = await context.supabase.from("issue_reports").select("id,status,reporter_id").eq("id", data.id).eq("reporter_id", context.userId).maybeSingle();
  if (own.error || !own.data) throw new Error("Csak a saját bejelentésedet igazolhatod vissza.");
  if (own.data.status !== "checking") throw new Error("Ez a bejelentés most nem vár visszaigazolásra.");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.rpc("issue_report_verdict", { _id: data.id, _user: context.userId, _verdict: data.verdict, _feedback: data.feedback });
  if (error) throw new Error("A visszaigazolás nem menthető. Frissítsd a listát.");
  const back = await context.supabase.from("issue_reports").select(columns).eq("id", data.id).single();
  if (back.error || !back.data) throw new Error("A visszaigazolás visszaolvasása nem igazolt.");
  return back.data;
});

/**
 * AI OS 2.0/3 — George-koordinált vizsgálat. George a hívó jogosultságával, csak olvasó eszközökkel fut,
 * és a handoff_to-val ténylegesen lefuttatja az illetékes specialistá(ka)t, akik strukturált,
 * forrás-ellenőrzött jelentést adnak vissza. Minden hozzájárulás az issue_report_findings táblába kerül.
 * AI-állítás nem bizonyíték (clampAiEvidence). Jegyenként legfeljebb AI_REVIEW_LIMIT futás (ismétlésvédelem).
 */
export const reviewIssue = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(z.object({ id: z.string().uuid(), mode: z.enum(["initial", "recheck", "rerun"]).default("initial") }).strict()).handler(async ({ data, context }) => {
  const { performIssueReview } = await import("./issue-review.server");
  return (await performIssueReview(context.supabase, context.userId, data)).row;
});

/** A hívó által látható szakértői jelentések (RLS: kérő vagy tulajdonos, és a szülő jegy látható). */
export const listIssueFindings = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).inputValidator(z.object({ id: z.string().uuid() }).strict()).handler(async ({ data, context }) => {
  const res = await context.supabase.from("issue_report_findings").select("id,agent_id,contribution,report_status,summary,findings,recommended_actions,open_questions,confidence,verified_source_count,unverified_claim_count,created_at").eq("issue_id", data.id).order("created_at", { ascending: false }).limit(30);
  if (res.error) throw new Error("A szakértői jelentések nem tölthetők be.");
  return res.data ?? [];
});
