import { supabase } from "@/integrations/supabase/client";

/**
 * Új ajánlat piszkozat (vagy új verzió leadhez) — egyetlen DB-tranzakcióban
 * (`quote_create_draft` RPC, security invoker → RLS érvényes). Leadenként
 * egy aktuális verziót egyedi index is véd.
 */
export async function createDraftQuote(input: { leadId: string | null }): Promise<string> {
  const { data, error } = await supabase.rpc("quote_create_draft" as any, { p_lead_id: input.leadId } as any);
  if (error) throw error;
  if (!data) throw new Error("Az ajánlat nem jött létre (nincs jogosultság?)");
  return data as unknown as string;
}
