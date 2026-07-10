/**
 * Knowledge Graph — edges. SERVER-ONLY.
 *
 * Írás service_role admin klienssel. syncEdges idempotens: adott
 * (from_node_id, relation) párra a target listát diff-eli — ami hiányzik
 * beszúrja, ami plusz törli, ami már ott van marad.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdminClient } from "@/integrations/supabase/server";
import type { EdgePayload, SyncEdgesInput } from "./types";

function admin(): SupabaseClient {
  return getAdminClient();
}

export type KgEdge = {
  id: string;
  from_node_id: string;
  to_node_id: string;
  relation: string;
  direction: "directed" | "undirected";
  weight: number | null;
  confidence: number | null;
  source: string;
  origin_ref_table: string | null;
  origin_ref_id: string | null;
  evidence: Record<string, unknown> | null;
  valid_from: string | null;
  valid_to: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  created_by_user_id: string | null;
};

function normalizeEdge(input: EdgePayload) {
  return {
    from_node_id: input.from_node_id,
    to_node_id: input.to_node_id,
    relation: input.relation,
    direction: input.direction ?? "directed",
    weight: input.weight ?? null,
    confidence: input.confidence ?? null,
    source: input.source,
    origin_ref_table: input.origin_ref_table ?? null,
    origin_ref_id: input.origin_ref_id ?? null,
    evidence: (input.evidence ?? null) as Record<string, unknown> | null,
    valid_from: input.valid_from ?? null,
    valid_to: input.valid_to ?? null,
    metadata: (input.metadata ?? {}) as Record<string, unknown>,
    created_by_user_id: input.created_by_user_id ?? null,
  };
}

/** Idempotens él upsert (UNIQUE(from,to,relation)). */
export async function upsertEdge(input: EdgePayload): Promise<KgEdge> {
  const row = normalizeEdge(input);
  const { data, error } = await admin()
    .from("kg_edges")
    .upsert(row, { onConflict: "from_node_id,to_node_id,relation" })
    .select("*")
    .maybeSingle();
  if (error) throw new Error(`kg_edges upsert: ${error.message}`);
  if (!data) throw new Error("kg_edges upsert: nincs visszatérő sor");
  return data as KgEdge;
}

/**
 * Egyetlen (from_node_id, relation) párra álljon elő pontosan a
 * target_node_ids halmaz. A source és opcionális origin_ref az új
 * élekre kerül. Visszatér az érintett darabszámokkal.
 */
export async function syncEdges(input: SyncEdgesInput): Promise<{
  inserted: number;
  removed: number;
  kept: number;
}> {
  const sb = admin();
  const targets = new Set(input.target_node_ids);

  const { data: existing, error: selErr } = await sb
    .from("kg_edges")
    .select("id, to_node_id")
    .eq("from_node_id", input.from_node_id)
    .eq("relation", input.relation);
  if (selErr) throw new Error(`kg_edges select: ${selErr.message}`);

  const existingSet = new Set(
    ((existing ?? []) as Array<{ id: string; to_node_id: string }>).map((r) => r.to_node_id),
  );
  const toRemoveIds = ((existing ?? []) as Array<{ id: string; to_node_id: string }>)
    .filter((r) => !targets.has(r.to_node_id))
    .map((r) => r.id);
  const toInsertTargets = Array.from(targets).filter((t) => !existingSet.has(t));

  let removed = 0;
  if (toRemoveIds.length > 0) {
    const { error, count } = await sb
      .from("kg_edges")
      .delete({ count: "exact" })
      .in("id", toRemoveIds);
    if (error) throw new Error(`kg_edges delete: ${error.message}`);
    removed = count ?? toRemoveIds.length;
  }

  let inserted = 0;
  if (toInsertTargets.length > 0) {
    const rows = toInsertTargets.map((to_node_id) =>
      normalizeEdge({
        from_node_id: input.from_node_id,
        to_node_id,
        relation: input.relation,
        direction: input.direction,
        source: input.source,
        origin_ref_table: input.origin_ref_table ?? null,
        origin_ref_id: input.origin_ref_id ?? null,
      }),
    );
    const { error, count } = await sb
      .from("kg_edges")
      .insert(rows, { count: "exact" });
    if (error) throw new Error(`kg_edges insert: ${error.message}`);
    inserted = count ?? rows.length;
  }

  return {
    inserted,
    removed,
    kept: existingSet.size - removed,
  };
}

export async function deleteEdges(input: {
  from_node_id?: string;
  to_node_id?: string;
  relation?: string;
}): Promise<number> {
  let q = admin().from("kg_edges").delete({ count: "exact" });
  if (input.from_node_id) q = q.eq("from_node_id", input.from_node_id);
  if (input.to_node_id) q = q.eq("to_node_id", input.to_node_id);
  if (input.relation) q = q.eq("relation", input.relation);
  const { error, count } = await q;
  if (error) throw new Error(`kg_edges delete: ${error.message}`);
  return count ?? 0;
}

export async function findEdges(input: {
  node_id: string;
  relation?: string;
  direction?: "out" | "in" | "both";
  limit?: number;
}): Promise<KgEdge[]> {
  const sb = admin();
  const limit = Math.min(Math.max(Number(input.limit ?? 100), 1), 500);
  const dir = input.direction ?? "both";
  const collected: KgEdge[] = [];

  if (dir === "out" || dir === "both") {
    let q = sb.from("kg_edges").select("*").eq("from_node_id", input.node_id).limit(limit);
    if (input.relation) q = q.eq("relation", input.relation);
    const { data, error } = await q;
    if (error) throw new Error(`kg_edges out: ${error.message}`);
    collected.push(...((data ?? []) as KgEdge[]));
  }
  if (dir === "in" || dir === "both") {
    let q = sb.from("kg_edges").select("*").eq("to_node_id", input.node_id).limit(limit);
    if (input.relation) q = q.eq("relation", input.relation);
    const { data, error } = await q;
    if (error) throw new Error(`kg_edges in: ${error.message}`);
    collected.push(...((data ?? []) as KgEdge[]));
  }
  return collected.slice(0, limit);
}