/**
 * Knowledge Graph — nodes. SERVER-ONLY.
 *
 * Írás a service_role admin klienssel megy (RLS bypass). Az olvasás
 * ugyanezzel a klienssel — az AI OS toolok a saját tool-context user
 * kliensével RLS alatt SELECT-elnek (authenticated → SELECT engedélyezve).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdminClient } from "@/integrations/supabase/server";
import type { NodeKind, NodePayload } from "./types";

function admin(): SupabaseClient {
  return getAdminClient();
}

export type KgNode = {
  id: string;
  kind: string;
  ref_table: string | null;
  ref_id: string | null;
  ref_uri: string | null;
  label: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

/**
 * Idempotens node upsert.
 * Ha van (kind, ref_table, ref_id) → UNIQUE index alapján UPSERT-elünk.
 * Ha nincs ref → új rekord, kivéve ha `ref_uri` alapján találunk létezőt.
 */
export async function upsertNode(input: NodePayload): Promise<KgNode> {
  const sb = admin();
  const now = new Date().toISOString();
  const row = {
    kind: input.kind,
    ref_table: input.ref_table ?? null,
    ref_id: input.ref_id ?? null,
    ref_uri: input.ref_uri ?? null,
    label: input.label ?? null,
    metadata: (input.metadata ?? {}) as Record<string, unknown>,
    updated_at: now,
  };

  if (row.ref_table && row.ref_id) {
    // A `uq_kg_nodes_kind_ref` unique index PARTIAL
    // (WHERE ref_table IS NOT NULL AND ref_id IS NOT NULL), ezért
    // PostgREST `onConflict` nem tud rá támaszkodni — explicit SELECT +
    // UPDATE/INSERT ciklust futtatunk, hogy idempotens maradjon.
    const { data: existing, error: selErr } = await sb
      .from("kg_nodes")
      .select("*")
      .eq("kind", row.kind)
      .eq("ref_table", row.ref_table)
      .eq("ref_id", row.ref_id)
      .maybeSingle();
    if (selErr) throw new Error(`kg_nodes select: ${selErr.message}`);
    if (existing) {
      const { data: updated, error: updErr } = await sb
        .from("kg_nodes")
        .update(row)
        .eq("id", (existing as KgNode).id)
        .select("*")
        .maybeSingle();
      if (updErr) throw new Error(`kg_nodes update: ${updErr.message}`);
      if (!updated) throw new Error("kg_nodes update: nincs visszatérő sor");
      return updated as KgNode;
    }
    const { data: inserted, error: insErr } = await sb
      .from("kg_nodes")
      .insert(row)
      .select("*")
      .maybeSingle();
    if (insErr) throw new Error(`kg_nodes insert: ${insErr.message}`);
    if (!inserted) throw new Error("kg_nodes insert: nincs visszatérő sor");
    return inserted as KgNode;
  }

  // ref_uri alapú deduplikáció (opcionális)
  if (row.ref_uri) {
    const { data: existing } = await sb
      .from("kg_nodes")
      .select("*")
      .eq("kind", row.kind)
      .eq("ref_uri", row.ref_uri)
      .maybeSingle();
    if (existing) {
      const { data: updated, error } = await sb
        .from("kg_nodes")
        .update(row)
        .eq("id", (existing as KgNode).id)
        .select("*")
        .maybeSingle();
      if (error) throw new Error(`kg_nodes update: ${error.message}`);
      return updated as KgNode;
    }
  }

  const { data, error } = await sb
    .from("kg_nodes")
    .insert(row)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(`kg_nodes insert: ${error.message}`);
  if (!data) throw new Error("kg_nodes insert: nincs visszatérő sor");
  return data as KgNode;
}

export async function getNodeByRef(input: {
  kind: NodeKind;
  ref_table: string;
  ref_id: string;
}): Promise<KgNode | null> {
  const { data, error } = await admin()
    .from("kg_nodes")
    .select("*")
    .eq("kind", input.kind)
    .eq("ref_table", input.ref_table)
    .eq("ref_id", input.ref_id)
    .maybeSingle();
  if (error) throw new Error(`kg_nodes select: ${error.message}`);
  return (data as KgNode | null) ?? null;
}

export async function getNodeById(id: string): Promise<KgNode | null> {
  const { data, error } = await admin()
    .from("kg_nodes")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`kg_nodes select: ${error.message}`);
  return (data as KgNode | null) ?? null;
}

/** Soft cascade: az élek FK ON DELETE CASCADE-el mennek. */
export async function deleteNodeAndEdges(input: { node_id: string }): Promise<void> {
  const { error } = await admin().from("kg_nodes").delete().eq("id", input.node_id);
  if (error) throw new Error(`kg_nodes delete: ${error.message}`);
}