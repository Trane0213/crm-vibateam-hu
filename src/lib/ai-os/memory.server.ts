/**
 * AI OS — Objektum-alapú memória. SERVER-ONLY.
 *
 * subject_type pl.: 'user' | 'company' | 'contact' | 'lead' | 'project' | 'conversation'
 * scope: 'shared' (minden user olvashatja) | 'private' (csak a létrehozó)
 *
 * NEM agent-specifikus. Minden agent ugyanebből olvas.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type MemoryRow = {
  id: string;
  subject_type: string;
  subject_id: string;
  scope: "shared" | "private";
  key: string;
  value: unknown;
  source: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

/** Adott subject(ek)hez tartozó memória-darabok lekérése. */
export async function getMemory(
  client: SupabaseClient,
  subjects: Array<{ subject_type: string; subject_id: string }>,
  opts: { limit?: number } = {},
): Promise<MemoryRow[]> {
  if (!subjects.length) return [];
  // OR feltétel kézzel — supabase-js .or() string-szintaxissal:
  const orParts = subjects.map(
    (s) => `and(subject_type.eq.${s.subject_type},subject_id.eq.${s.subject_id})`,
  );
  const { data, error } = await client
    .from("ai_memory")
    .select("*")
    .or(orParts.join(","))
    .order("updated_at", { ascending: false })
    .limit(opts.limit ?? 100);
  if (error) throw new Error(`ai_memory olvasás: ${error.message}`);
  return (data ?? []) as MemoryRow[];
}

/** Egy memória-darab beírása (upsert kulcs alapján). */
export async function writeMemory(
  client: SupabaseClient,
  input: {
    subject_type: string;
    subject_id: string;
    key: string;
    value: unknown;
    scope?: "shared" | "private";
    source?: string;
    created_by: string;
  },
): Promise<MemoryRow> {
  const row = {
    subject_type: input.subject_type,
    subject_id: input.subject_id,
    key: input.key,
    value: input.value as object,
    scope: input.scope ?? "shared",
    source: input.source ?? null,
    created_by: input.created_by,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await client
    .from("ai_memory")
    .upsert(row, { onConflict: "subject_type,subject_id,scope,key,created_by" })
    .select()
    .single();
  if (error) throw new Error(`ai_memory írás: ${error.message}`);
  return data as MemoryRow;
}

export async function deleteMemory(
  client: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await client.from("ai_memory").delete().eq("id", id);
  if (error) throw new Error(`ai_memory törlés: ${error.message}`);
}