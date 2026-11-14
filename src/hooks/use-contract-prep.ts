/**
 * Szerződés-előkészítés adatai a hívó jogosultságával (RLS). Kulcs a ["leads", …]
 * alatt, így a meglévő lead-/Pipeline-invalidáció és a közös realtime frissítés
 * ezt is frissíti. Csak olvas.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { contractPrepSummary, type ContractPrepInput, type ContractPrepSummary } from "@/lib/contract/contract-prep";
import { loadContractPrepInput } from "@/lib/contract/contract-prep-loader";

export type ContractPrepData = { input: ContractPrepInput; summary: ContractPrepSummary };

export function useContractPrep(ids: { leadId?: string | null; projectId?: string | null }, enabled = true) {
  return useQuery({
    queryKey: ["leads", "contract-prep", ids.leadId ?? null, ids.projectId ?? null],
    enabled: enabled && !!(ids.leadId || ids.projectId),
    queryFn: async (): Promise<ContractPrepData> => {
      const input = await loadContractPrepInput(supabase as any, ids);
      return { input, summary: contractPrepSummary(input) };
    },
  });
}
