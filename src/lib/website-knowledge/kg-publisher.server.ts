/**
 * Website → Knowledge Graph publisher — WK-4.
 *
 * Egyetlen `page_id`-hez összegyűjti a friss WK állapotot (page + legutolsó
 * verzió + entitások + media + linkek), majd:
 *   1) upsertNode-al feloldja az összes érintett KG node id-ját (idempotens),
 *   2) egyetlen `projectFromSource` hívással beírja az éleket
 *      (has_entity / contains_media / links_to) és `kg_publishers` audit sort ír.
 *
 * Csak a `src/lib/knowledge-graph/`-tól függ (KG modul) — nem hív vissza más
 * domain modult. Az AI OS toolok (kg_get_node, kg_find_related) ezek után
 * ugyanezekhez a node/edge sorokhoz férnek hozzá az RLS SELECT policy alatt.
 */

import { getAdminClient } from "@/integrations/supabase/server";
import { upsertNode } from "@/lib/knowledge-graph/nodes.server";
import { projectFromSource } from "@/lib/knowledge-graph/projector.server";
import type { EdgePayload } from "@/lib/knowledge-graph/types";
import {
  entityNodePayload,
  externalUrlNodePayload,
  extractLinksFromHtml,
  mediaNodePayload,
  pageNodePayload,
  type WkEntityRow,
  type WkMediaRow,
  type WkPageRow,
} from "./kg-mapping";

export interface PublishPageChangeInput {
  page_id: string;
  run_id?: string | null;
}

export type PublishPageChangeResult =
  | {
      skipped: true;
      reason: "page_not_found" | "no_current_version";
    }
  | {
      skipped: false;
      page_node_id: string;
      nodes_upserted: number;
      edges_upserted: number;
      status: "ok" | "partial" | "error";
      error_message?: string | null;
    };

const MAX_ENTITIES = 30;
const MAX_MEDIA = 40;
const MAX_INTERNAL_LINKS = 40;
const MAX_EXTERNAL_LINKS = 30;

export async function publishPageChange(
  input: PublishPageChangeInput,
): Promise<PublishPageChangeResult> {
  const admin = getAdminClient();

  // 1) page + current_version
  const { data: pageRow } = await admin
    .from("website_pages")
    .select("id, url, path, title, asset_kind, current_version_id")
    .eq("id", input.page_id)
    .maybeSingle();
  if (!pageRow) return { skipped: true, reason: "page_not_found" };
  const page = pageRow as WkPageRow;
  if (!page.current_version_id) return { skipped: true, reason: "no_current_version" };

  const { data: versionRow } = await admin
    .from("website_page_versions")
    .select("id, version_number, raw_html")
    .eq("id", page.current_version_id)
    .maybeSingle();
  const raw_html = ((versionRow as { raw_html?: string | null } | null)?.raw_html) ?? "";
  const version_number = (versionRow as { version_number?: number } | null)?.version_number;

  // 2) entities (join a katalógusra)
  const { data: linkRows } = await admin
    .from("website_page_entities")
    .select("entity_id, role, confidence")
    .eq("page_version_id", page.current_version_id)
    .limit(MAX_ENTITIES);
  const entityIds = Array.from(
    new Set(
      ((linkRows ?? []) as Array<{ entity_id: string }>).map((r) => r.entity_id),
    ),
  );
  let entities: WkEntityRow[] = [];
  if (entityIds.length > 0) {
    const { data: entRows } = await admin
      .from("website_entities")
      .select("id, entity_kind, name, normalized_name")
      .in("id", entityIds);
    entities = ((entRows ?? []) as WkEntityRow[]).slice(0, MAX_ENTITIES);
  }
  const entityMeta = new Map<string, { role: string | null; confidence: number | null }>();
  for (const r of (linkRows ?? []) as Array<{
    entity_id: string;
    role: string | null;
    confidence: number | null;
  }>) {
    if (!entityMeta.has(r.entity_id)) {
      entityMeta.set(r.entity_id, { role: r.role, confidence: r.confidence });
    }
  }

  // 3) media
  const { data: mediaRows } = await admin
    .from("website_media")
    .select("id, url, media_kind, alt_text, mime_type")
    .eq("page_version_id", page.current_version_id)
    .limit(MAX_MEDIA);
  const mediaList = ((mediaRows ?? []) as WkMediaRow[]).slice(0, MAX_MEDIA);

  // 4) linkek HTML-ből
  const { internal, external } = raw_html
    ? extractLinksFromHtml(raw_html, page.url)
    : { internal: [], external: [] };
  const internalLinks = internal.slice(0, MAX_INTERNAL_LINKS).filter((u) => u !== page.url);
  const externalLinks = external.slice(0, MAX_EXTERNAL_LINKS);

  // 5) node id feloldás — upsertNode idempotens
  const pageNode = await upsertNode(pageNodePayload(page, version_number));

  const entityNodeIds: Array<{ id: string; entity_id: string }> = [];
  for (const e of entities) {
    const n = await upsertNode(entityNodePayload(e));
    entityNodeIds.push({ id: n.id, entity_id: e.id });
  }

  const mediaNodeIds: string[] = [];
  for (const m of mediaList) {
    const n = await upsertNode(mediaNodePayload(m));
    mediaNodeIds.push(n.id);
  }

  // Belső link: ha a website_pages-ben ismert URL → website_page node,
  // egyébként external_url. Batch lookup egy SELECT-tel.
  const internalPageMap = new Map<string, string>(); // url → node_id
  if (internalLinks.length > 0) {
    const { data: knownPages } = await admin
      .from("website_pages")
      .select("id, url, path, title, asset_kind, current_version_id")
      .in("url", internalLinks);
    for (const kp of (knownPages ?? []) as WkPageRow[]) {
      const n = await upsertNode(pageNodePayload(kp));
      internalPageMap.set(kp.url, n.id);
    }
  }
  const internalUnknownIds: string[] = [];
  for (const url of internalLinks) {
    if (internalPageMap.has(url)) continue;
    const n = await upsertNode(externalUrlNodePayload(url));
    internalUnknownIds.push(n.id);
  }

  const externalNodeIds: string[] = [];
  for (const url of externalLinks) {
    const n = await upsertNode(externalUrlNodePayload(url));
    externalNodeIds.push(n.id);
  }

  // 6) élek összeállítása
  const edges: EdgePayload[] = [];
  const now = new Date().toISOString();

  for (const en of entityNodeIds) {
    const meta = entityMeta.get(en.entity_id) ?? { role: null, confidence: null };
    edges.push({
      from_node_id: pageNode.id,
      to_node_id: en.id,
      relation: "has_entity",
      source: "ai_extraction",
      origin_ref_table: "website_page_entities",
      origin_ref_id: null,
      confidence: meta.confidence,
      valid_from: now,
      metadata: meta.role ? { role: meta.role } : {},
    });
  }

  for (const mid of mediaNodeIds) {
    edges.push({
      from_node_id: pageNode.id,
      to_node_id: mid,
      relation: "contains_media",
      source: "crawl_link",
      origin_ref_table: "website_media",
      origin_ref_id: null,
      valid_from: now,
    });
  }

  for (const [, nid] of internalPageMap) {
    if (nid === pageNode.id) continue;
    edges.push({
      from_node_id: pageNode.id,
      to_node_id: nid,
      relation: "links_to",
      source: "crawl_link",
      valid_from: now,
    });
  }
  for (const nid of internalUnknownIds) {
    edges.push({
      from_node_id: pageNode.id,
      to_node_id: nid,
      relation: "links_to",
      source: "crawl_link",
      valid_from: now,
    });
  }
  for (const nid of externalNodeIds) {
    edges.push({
      from_node_id: pageNode.id,
      to_node_id: nid,
      relation: "links_to",
      source: "crawl_link",
      valid_from: now,
    });
  }

  // 7) projektálás — audit + újbóli idempotens page-node upsert + edge upsertek
  const stats = await projectFromSource({
    module: "website",
    source_kind: "crawl",
    run_id: input.run_id ?? null,
    batch: [
      {
        node: pageNodePayload(page, version_number),
        edges,
      },
    ],
  });

  return {
    skipped: false,
    page_node_id: pageNode.id,
    nodes_upserted: stats.nodes_upserted,
    edges_upserted: stats.edges_upserted,
    status: stats.status,
    error_message: stats.error_message ?? null,
  };
}