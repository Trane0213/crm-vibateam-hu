import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

function requireOwner(owner: { data: unknown; error: unknown }) {
  if (owner.error) throw new Error("A jogosultság nem ellenőrizhető.");
  if (owner.data !== true) throw new Error("Csak Tulajdonos indíthatja és láthatja a teljes feldolgozási sort.");
}

export const knowledgeQueueOverview = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  requireOwner(await context.supabase.rpc("is_owner_role", { _auth_user: context.userId }));
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.from("knowledge_documents").select("source_table,processing_status,superseded_at").not("source_table", "is", null).range(0, 9999);
  if (error) throw new Error("A feldolgozási állapot nem tölthető be.");
  const counts: Record<string, number> = {}; let superseded = 0;
  for (const r of data ?? []) { if (r.superseded_at) { superseded++; continue; } counts[r.processing_status] = (counts[r.processing_status] ?? 0) + 1; }
  const problems = await supabaseAdmin.from("knowledge_documents").select("id,title,source_table,processing_status,error_code,processed_at")
    .is("superseded_at", null).in("processing_status", ["error", "needs_review", "partial"]).order("processed_at", { ascending: false }).limit(15);
  const chunks = await supabaseAdmin.from("knowledge_chunks").select("id", { count: "exact", head: true });
  const runs = await supabaseAdmin.from("knowledge_ingest_runs").select("id,status,claimed,outcomes,started_at,finished_at,error_message").order("started_at", { ascending: false }).limit(5);
  return { counts, superseded, chunks: chunks.count ?? 0, problems: problems.data ?? [], runs: runs.data ?? [] };
});

export const knowledgeProcessBatch = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ limit: z.number().int().min(1).max(10).default(5) }).strict())
  .handler(async ({ data, context }) => {
    requireOwner(await context.supabase.rpc("is_owner_role", { _auth_user: context.userId }));
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { processBatch } = await import("./ingest.server");
    // AI OS 2.0/8 C: minden kötegről ellenőrizhető napló (ki, mikor, mit, milyen eredménnyel).
    const log = await supabaseAdmin.from("knowledge_ingest_runs").insert({ started_by: context.userId, requested_limit: data.limit }).select("id").single();
    if (log.error || !log.data) throw new Error("A feldolgozási napló nem nyitható meg; a feldolgozás nem indult el.");
    try {
      const result = await processBatch(supabaseAdmin, data.limit);
      await supabaseAdmin.from("knowledge_ingest_runs").update({ status: "ok", claimed: result.claimed, outcomes: result.outcomes, document_ids: result.documentIds, finished_at: new Date().toISOString() }).eq("id", log.data.id);
      return { claimed: result.claimed, outcomes: result.outcomes, runId: log.data.id };
    } catch (e) {
      await supabaseAdmin.from("knowledge_ingest_runs").update({ status: "error", error_message: (e instanceof Error ? e.message : String(e)).slice(0, 300), finished_at: new Date().toISOString() }).eq("id", log.data.id);
      throw e;
    }
  });
