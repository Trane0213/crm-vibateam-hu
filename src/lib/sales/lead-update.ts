import { supabase } from "@/integrations/supabase/client";

export const LEAD_NOT_UPDATED_MESSAGE =
  "A lead nem módosult: nincs jogosultságod a módosításhoz (más felelőshöz tartozik), vagy a lead nem létezik. A beírt adatok megmaradtak.";

/** Pontosan egy módosított sor számít sikernek; 0 sor (RLS-tiltás vagy nem létező lead) hiba. */
export function assertSingleLeadRow(rows: unknown[] | null | undefined): void {
  if (!rows || rows.length !== 1) throw new Error(LEAD_NOT_UPDATED_MESSAGE);
}

/**
 * Lead update, amely visszaolvassa a ténylegesen módosított sort.
 * A PostgREST RLS által kiszűrt update hiba nélkül 0 sort ad — ezt itt hibának vesszük.
 */
export async function updateLeadOrThrow(leadId: string, patch: Record<string, any>) {
  const { data, error } = await supabase
    .from("leads")
    .update(patch as any)
    .eq("id", leadId)
    .select("id");
  if (error) throw error;
  assertSingleLeadRow(data);
}
