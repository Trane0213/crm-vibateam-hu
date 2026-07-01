import { supabase } from "@/integrations/supabase/client";

/**
 * Új ajánlat piszkozat rekord készítése.
 *
 * Sprint 1 / 1. lépés: csak azt garantálja, hogy létrejön egy quotes sor,
 * amely megnyitható az adatlapon. Nincs ItemsPanel, nincs státusz-workflow,
 * nincs project-hivatkozás. A lead-hez tartozó verziószámot inkrementáljuk,
 * és biztosítjuk, hogy egyszerre csak egy is_current sor legyen leadenként.
 */
export async function createDraftQuote(input: {
  leadId: string | null;
}): Promise<string> {
  let version = 1;
  if (input.leadId) {
    const { data: prior, error: pErr } = await supabase
      .from("quotes")
      .select("version, is_current, id")
      .eq("lead_id", input.leadId)
      .order("version", { ascending: false })
      .limit(1);
    if (pErr) throw pErr;
    if (prior && prior.length > 0) {
      version = (Number(prior[0].version) || 0) + 1;
      // Csak egy aktuális verzió leadenként — a régit lekapcsoljuk, hogy
      // az új draft lehessen az aktuális.
      const { error: offErr } = await supabase
        .from("quotes")
        .update({ is_current: false })
        .eq("lead_id", input.leadId)
        .eq("is_current", true);
      if (offErr) throw offErr;
    }
  }

  const { data, error } = await supabase
    .from("quotes")
    .insert({
      lead_id: input.leadId,
      version,
      is_current: true,
      status: "draft",
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}