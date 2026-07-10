/**
 * Knowledge Graph — server functions.
 *
 *   * kg_get_node       — egy node lekérése + közvetlen szomszédok
 *   * kg_find_related   — 1-hop szomszédok szűréssel
 *   * kg_stats          — node/edge count kind/relation szerint (Owner UI-hoz)
 *
 * RLS: authenticated → SELECT az összes kg_* táblára engedélyezett,
 * ezért a middleware által biztosított user Supabase kliens is olvashat.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/middleware";

type GetNodeInput = {
  node_id?: string | null;
  kind?: string | null;
  ref_table?: string | null;
  ref_id?: string | null;
  ref_uri?: string | null;
  neighbor_limit?: number | null;
};

function validateGetNode(input: unknown): GetNodeInput {
  const i = (input ?? {}) as GetNodeInput;
  const hasId = !!i.node_id;
  const hasRef = !!(i.kind && i.ref_table && i.ref_id);
  const hasUri = !!(i.kind && i.ref_uri);
  if (!hasId && !hasRef && !hasUri) {
    throw new Error(
      "kg_get_node: kötelező vagy `node_id`, vagy (`kind` + `ref_table` + `ref_id`), vagy (`kind` + `ref_uri`).",
    );
  }
  return i;
}

export const kgGetNode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateGetNode)
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    let nodeQ = sb.from("kg_nodes").select("*").limit(1);
    if (data.node_id) nodeQ = nodeQ.eq("id", data.node_id);
    else if (data.kind && data.ref_table && data.ref_id) {
      nodeQ = nodeQ.eq("kind", data.kind).eq("ref_table", data.ref_table).eq("ref_id", data.ref_id);
    } else if (data.kind && data.ref_uri) {
      nodeQ = nodeQ.eq("kind", data.kind).eq("ref_uri", data.ref_uri);
    }
    const { data: nodes, error: nodeErr } = await nodeQ;
    if (nodeErr) throw new Error(nodeErr.message);
    const node = (nodes ?? [])[0] ?? null;
    if (!node) return { node: null, out_edges: [], in_edges: [] };

    const neighborLimit = Math.min(Math.max(Number(data.neighbor_limit ?? 50), 1), 200);
    const [{ data: outE }, { data: inE }] = await Promise.all([
      sb.from("kg_edges").select("*").eq("from_node_id", node.id).limit(neighborLimit),
      sb.from("kg_edges").select("*").eq("to_node_id", node.id).limit(neighborLimit),
    ]);
    return { node, out_edges: outE ?? [], in_edges: inE ?? [] };
  });

type FindRelatedInput = {
  kind: string;
  ref_id: string;
  relation?: string | null;
  direction?: "out" | "in" | "both" | null;
  limit?: number | null;
};

function validateFindRelated(input: unknown): FindRelatedInput {
  const i = (input ?? {}) as FindRelatedInput;
  if (!i.kind || !i.ref_id) {
    throw new Error("kg_find_related: `kind` és `ref_id` kötelező.");
  }
  return i;
}

export const kgFindRelated = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateFindRelated)
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: nodes, error } = await sb
      .from("kg_nodes")
      .select("id")
      .eq("kind", data.kind)
      .eq("ref_id", data.ref_id)
      .limit(1);
    if (error) throw new Error(error.message);
    const node = (nodes ?? [])[0];
    if (!node) return { node_id: null, edges: [] };

    const limit = Math.min(Math.max(Number(data.limit ?? 50), 1), 200);
    const dir = data.direction ?? "both";
    const results: unknown[] = [];
    if (dir === "out" || dir === "both") {
      let q = sb.from("kg_edges").select("*").eq("from_node_id", node.id).limit(limit);
      if (data.relation) q = q.eq("relation", data.relation);
      const { data: rows, error: e1 } = await q;
      if (e1) throw new Error(e1.message);
      results.push(...(rows ?? []));
    }
    if (dir === "in" || dir === "both") {
      let q = sb.from("kg_edges").select("*").eq("to_node_id", node.id).limit(limit);
      if (data.relation) q = q.eq("relation", data.relation);
      const { data: rows, error: e2 } = await q;
      if (e2) throw new Error(e2.message);
      results.push(...(rows ?? []));
    }
    return { node_id: node.id, edges: results.slice(0, limit) };
  });

export const kgStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase;
    const [nodesRes, edgesRes, publishersRes] = await Promise.all([
      sb.from("kg_nodes").select("kind"),
      sb.from("kg_edges").select("relation"),
      sb
        .from("kg_publishers")
        .select("module,source_kind,last_run_at,nodes_upserted,edges_upserted,edges_removed,status")
        .order("last_run_at", { ascending: false })
        .limit(50),
    ]);
    const byKind: Record<string, number> = {};
    for (const r of (nodesRes.data ?? []) as Array<{ kind: string }>) {
      byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;
    }
    const byRelation: Record<string, number> = {};
    for (const r of (edgesRes.data ?? []) as Array<{ relation: string }>) {
      byRelation[r.relation] = (byRelation[r.relation] ?? 0) + 1;
    }
    return {
      nodes_total: (nodesRes.data ?? []).length,
      edges_total: (edgesRes.data ?? []).length,
      nodes_by_kind: byKind,
      edges_by_relation: byRelation,
      publishers: publishersRes.data ?? [],
    };
  });