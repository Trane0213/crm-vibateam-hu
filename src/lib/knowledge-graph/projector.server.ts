/**
 * Knowledge Graph — projector. SERVER-ONLY.
 *
 * Publisherek egységes belépési pontja. Egy hívás:
 *   1. minden `batch[i].node` payloadot upsert-el (kg_nodes)
 *   2. minden `batch[i].edges` payloadot upsert-el (kg_edges)
 *   3. a futás végén beír egy sort a kg_publishers táblába
 *
 * A KG modul soha nem függ vissza domain-modulra; a publisherek a saját
 * moduljukban élnek és innen csak ezt a függvényt hívják.
 *
 * KG-1-ben csak a mechanizmus áll rendelkezésre — élő publisher a WK
 * sprintekben jön.
 */

import { getAdminClient } from "@/integrations/supabase/server";
import { upsertNode } from "./nodes.server";
import { upsertEdge } from "./edges.server";
import type { ProjectFromSourceInput, PublisherRunStats } from "./types";

export async function projectFromSource(
  input: ProjectFromSourceInput,
): Promise<PublisherRunStats> {
  let nodes_upserted = 0;
  let edges_upserted = 0;
  const edges_removed = 0;
  let status: PublisherRunStats["status"] = "ok";
  let error_message: string | null = null;

  try {
    for (const item of input.batch) {
      await upsertNode(item.node);
      nodes_upserted += 1;
      if (item.edges?.length) {
        for (const edge of item.edges) {
          await upsertEdge(edge);
          edges_upserted += 1;
        }
      }
    }
  } catch (err) {
    status = "error";
    error_message = err instanceof Error ? err.message : String(err);
  }

  // audit sor — nem-kritikus: hiba esetén sem borítja a return-t
  try {
    await getAdminClient()
      .from("kg_publishers")
      .insert({
        module: input.module,
        source_kind: input.source_kind,
        nodes_upserted,
        edges_upserted,
        edges_removed,
        status,
        error_message,
      });
  } catch {
    // ignore — audit írási hiba nem törli az adatot
  }

  return { nodes_upserted, edges_upserted, edges_removed, status, error_message };
}