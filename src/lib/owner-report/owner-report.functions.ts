import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const kindInput = z.object({ kind: z.enum(["daily", "weekly"]) }).strict();
function requireOwner(owner: { data: unknown; error: unknown }) {
  if (owner.error) throw new Error("A jogosultság nem ellenőrizhető.");
  if (owner.data !== true) throw new Error("A tulajdonosi jelentést csak a Tulajdonos láthatja.");
}

/** Aktuális tények (AI nélkül, írás nélkül) + a legutóbbi George-jelentések. */
export const ownerReportOverview = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).inputValidator(kindInput).handler(async ({ data, context }) => {
  requireOwner(await context.supabase.rpc("is_owner_role", { _auth_user: context.userId }));
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { buildOwnerFacts } = await import("./facts.server");
  const { factsHash } = await import("./model");
  const facts = await buildOwnerFacts(context.supabase, supabaseAdmin, data.kind);
  const hash = await factsHash(facts);
  const reports = await context.supabase.from("ai_owner_reports").select("id,kind,period_label,period_start,period_end,status,report,facts,facts_hash,tokens_used,error,created_at,finished_at").eq("kind", data.kind).order("created_at", { ascending: false }).limit(8);
  if (reports.error) throw new Error("A korábbi jelentések nem tölthetők be.");
  return { facts, hash, reports: reports.data ?? [] };
});

/** George jelentése (fizetős AI-hívás; változatlan tényekre nem indul). */
export const ownerReportGenerate = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(z.object({ kind: z.enum(["daily", "weekly"]), force: z.boolean().default(false) }).strict()).handler(async ({ data, context }) => {
  requireOwner(await context.supabase.rpc("is_owner_role", { _auth_user: context.userId }));
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { generateOwnerReport } = await import("./report.server");
  return generateOwnerReport(context.supabase, supabaseAdmin, context.userId, data.kind, data.force);
});
