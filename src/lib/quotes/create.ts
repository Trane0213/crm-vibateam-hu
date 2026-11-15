import { supabase } from "@/integrations/supabase/client";
import type { QuoteWorkflow } from "@/lib/quotes/workflow";

/**
 * Új, önálló ajánlat egy kiválasztott ügyhöz és ajánlattípussal — egyetlen DB-tranzakcióban
 * (`quote_create_for_lead` RPC, security invoker → RLS érvényes). Ügy nélkül nem jön létre
 * „címzetlen” piszkozat; ha az ügynek már van ajánlata, az RPC megtagadja: módosításhoz
 * `quote_new_version`, párhuzamos műszaki változathoz `quote_new_alternative` való.
 * Az ügy kapcsolattartója és megnevezése előtöltődik.
 */
export async function createQuoteForLead(input: { leadId: string; kind: QuoteWorkflow }): Promise<string> {
  if (!input.leadId) throw new Error("Válaszd ki, melyik ügyhöz készül az ajánlat.");
  const { data, error } = await supabase.rpc("quote_create_for_lead", { p_lead_id: input.leadId, p_kind: input.kind });
  if (error) throw error;
  if (!data) throw new Error("Az ajánlat nem jött létre (nincs jogosultság?)");
  return data as unknown as string;
}
