/**
 * AI OS — Knowledge Graph (`kg`) tool adapterek. SERVER-ONLY.
 *
 * KG-1: kizárólag READ toolok. Semmi mutation. Az agent nem publikál a
 * gráfba — a publisherek (Website, CRM, Ads, ...) a saját domain moduljukban
 * élnek és közvetlenül a projector.server.ts-t hívják.
 *
 *   * kg_get_node       — bárki (allowed_roles üres)
 *   * kg_find_related   — bárki
 *   * kg_stats          — Owner only
 *
 * A toolok a tool context user Supabase kliensét (RLS) használják.
 * A kg_* táblákra authenticated → SELECT engedélyezve van.
 */

import { registerTool } from "../tool-registry";
import { OWNER_ROLES } from "../roles";

function ok<T>(data: T) { return { ok: true, data }; }
function fail(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return { ok: false, error: message };
}

const DOMAIN = "kg";

export function registerKgTools() {
  // -------------------- kg_get_node --------------------
  registerTool(
    {
      name: "kg_get_node",
      description:
        "Egy Knowledge Graph node lekérése azonosító vagy (kind + ref_table + ref_id) vagy (kind + ref_uri) alapján, közvetlen szomszéd élekkel együtt.",
      domain: DOMAIN,
      parameters: {
        type: "object",
        properties: {
          node_id: { type: "string", description: "kg_nodes.id (uuid)." },
          kind: { type: "string", description: "Node kind (kg_node_kinds.kind)." },
          ref_table: { type: "string" },
          ref_id: { type: "string", description: "Forrás-rekord uuid." },
          ref_uri: { type: "string" },
          neighbor_limit: { type: "integer", default: 50, minimum: 1, maximum: 200 },
        },
      },
    },
    async (args, ctx) => {
      try {
        const sb = ctx.supabaseUser;
        let q = sb.from("kg_nodes").select("*").limit(1);
        if (args.node_id) {
          q = q.eq("id", String(args.node_id));
        } else if (args.kind && args.ref_table && args.ref_id) {
          q = q
            .eq("kind", String(args.kind))
            .eq("ref_table", String(args.ref_table))
            .eq("ref_id", String(args.ref_id));
        } else if (args.kind && args.ref_uri) {
          q = q.eq("kind", String(args.kind)).eq("ref_uri", String(args.ref_uri));
        } else {
          return fail("Add meg vagy `node_id`-t, vagy `kind` + `ref_table` + `ref_id`-t, vagy `kind` + `ref_uri`-t.");
        }
        const { data: nodes, error } = await q;
        if (error) throw new Error(error.message);
        const node = (nodes ?? [])[0] ?? null;
        if (!node) return ok({ node: null, out_edges: [], in_edges: [] });

        const nlimit = Math.min(Math.max(Number(args.neighbor_limit ?? 50), 1), 200);
        const [outE, inE] = await Promise.all([
          sb.from("kg_edges").select("*").eq("from_node_id", node.id).limit(nlimit),
          sb.from("kg_edges").select("*").eq("to_node_id", node.id).limit(nlimit),
        ]);
        return ok({ node, out_edges: outE.data ?? [], in_edges: inE.data ?? [] });
      } catch (err) {
        return fail(err);
      }
    },
  );

  // -------------------- kg_find_related --------------------
  registerTool(
    {
      name: "kg_find_related",
      description:
        "Egy forrás-rekord (kind + ref_id) 1-hop szomszéd élei a Knowledge Graph-ban. Szűrhető reláció-típusra és irányra.",
      domain: DOMAIN,
      parameters: {
        type: "object",
        properties: {
          kind: { type: "string" },
          ref_id: { type: "string", description: "Forrás-rekord uuid." },
          relation: { type: "string", description: "Opcionális kg_relations.relation szűrő." },
          direction: { type: "string", enum: ["out", "in", "both"], default: "both" },
          limit: { type: "integer", default: 50, minimum: 1, maximum: 200 },
        },
        required: ["kind", "ref_id"],
      },
    },
    async (args, ctx) => {
      try {
        const sb = ctx.supabaseUser;
        const { data: nodes, error } = await sb
          .from("kg_nodes")
          .select("id")
          .eq("kind", String(args.kind))
          .eq("ref_id", String(args.ref_id))
          .limit(1);
        if (error) throw new Error(error.message);
        const node = (nodes ?? [])[0];
        if (!node) return ok({ node_id: null, edges: [] });

        const limit = Math.min(Math.max(Number(args.limit ?? 50), 1), 200);
        const dir = (args.direction as string | undefined) ?? "both";
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const results: any[] = [];
        if (dir === "out" || dir === "both") {
          let q = sb.from("kg_edges").select("*").eq("from_node_id", node.id).limit(limit);
          if (args.relation) q = q.eq("relation", String(args.relation));
          const { data: rows, error: e1 } = await q;
          if (e1) throw new Error(e1.message);
          results.push(...(rows ?? []));
        }
        if (dir === "in" || dir === "both") {
          let q = sb.from("kg_edges").select("*").eq("to_node_id", node.id).limit(limit);
          if (args.relation) q = q.eq("relation", String(args.relation));
          const { data: rows, error: e2 } = await q;
          if (e2) throw new Error(e2.message);
          results.push(...(rows ?? []));
        }
        return ok({ node_id: node.id, edges: results.slice(0, limit) });
      } catch (err) {
        return fail(err);
      }
    },
  );

  // -------------------- kg_stats (Owner only) --------------------
  registerTool(
    {
      name: "kg_stats",
      description:
        "Knowledge Graph összesítő statisztika: node count kind szerint, edge count reláció szerint, utolsó publisher-futások.",
      domain: DOMAIN,
      allowed_roles: [...OWNER_ROLES],
      parameters: { type: "object", properties: {} },
    },
    async (_args, ctx) => {
      try {
        const sb = ctx.supabaseUser;
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
        return ok({
          nodes_total: (nodesRes.data ?? []).length,
          edges_total: (edgesRes.data ?? []).length,
          nodes_by_kind: byKind,
          edges_by_relation: byRelation,
          publishers: publishersRes.data ?? [],
        });
      } catch (err) {
        return fail(err);
      }
    },
  );
}