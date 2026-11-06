import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { issueInput } from "./issue-reports-model";
const columns = "id,reporter_id,reporter_role,created_at,page_path,description,expected_result,actual_result,technical_code,status,owner_note,updated_at";
export const submitIssue = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(issueInput).handler(async ({ data, context }) => {
  const { supabase, userId } = context;
  const old = await supabase.from("issue_reports").select(`${columns},submission_key`).eq("reporter_id", userId).eq("submission_key", data.submissionKey).maybeSingle();
  if (old.error) throw new Error("A hibajegy ellenőrzése nem sikerült.");
  if (old.data) {
    if (old.data.description !== data.description || old.data.expected_result !== data.expectedResult || old.data.actual_result !== data.actualResult || old.data.page_path !== data.pagePath || (old.data.technical_code ?? "") !== data.technicalCode) throw new Error("Ezzel az azonosítóval más tartalmú jelentés már mentve van.");
    return old.data;
  }
  const { data: row, error } = await supabase.from("issue_reports").insert({ reporter_id: userId, reporter_role: "derived", submission_key: data.submissionKey, page_path: data.pagePath, description: data.description, expected_result: data.expectedResult, actual_result: data.actualResult, technical_code: data.technicalCode || null }).select(columns).single();
  if (error || !row) throw new Error("A hibajegy nem menthető. Újrapróbálás előtt ellenőrizd a saját jelentéseidet.");
  const saved = await supabase.from("issue_reports").select(columns).eq("id", row.id).single();
  if (saved.error || !saved.data) throw new Error("A mentés visszaolvasása nem igazolt. Ellenőrizd a saját jelentéseidet.");
  return saved.data;
});
export const listIssues = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).inputValidator(z.object({ page: z.number().int().min(0).max(10000) })).handler(async ({ data, context }) => {
  const owner = await context.supabase.rpc("is_owner_role", { _auth_user: context.userId });
  if (owner.error) throw new Error("A jogosultság nem ellenőrizhető.");
  const q = context.supabase.from("issue_reports").select(columns, { count: "exact" }).order("created_at", { ascending: false }).order("id").range(data.page * 20, data.page * 20 + 19);
  const result = await (owner.data ? q : q.eq("reporter_id", context.userId));
  if (result.error) throw new Error("A hibajegyek nem tölthetők be.");
  return { rows: result.data ?? [], total: result.count ?? 0, owner: owner.data === true };
});
export const updateIssue = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(z.object({ id: z.string().uuid(), status: z.enum(["new", "investigating", "awaiting_fix", "checking", "closed", "usage_question"]), note: z.string().max(2000), expectedUpdatedAt: z.string() }).strict()).handler(async ({ data, context }) => {
  const owner = await context.supabase.rpc("is_owner_role", { _auth_user: context.userId });
  if (owner.error || owner.data !== true) throw new Error("Csak a tulajdonos kezelhet hibastátuszt.");
  const { data: row, error } = await context.supabase.from("issue_reports").update({ status: data.status, owner_note: data.note }).eq("id", data.id).eq("updated_at", data.expectedUpdatedAt).select(columns).single();
  if (error || !row) throw new Error("A státusz nem menthető vagy a jelentés időközben változott. Frissítsd a listát.");
  return row;
});