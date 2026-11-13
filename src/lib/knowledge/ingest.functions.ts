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
  return { counts, superseded, chunks: chunks.count ?? 0, problems: problems.data ?? [] };
});

export const knowledgeProcessBatch = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ limit: z.number().int().min(1).max(10).default(5) }).strict())
  .handler(async ({ data, context }) => {
    requireOwner(await context.supabase.rpc("is_owner_role", { _auth_user: context.userId }));
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { processBatch } = await import("./ingest.server");
    return processBatch(supabaseAdmin, data.limit);
  });
