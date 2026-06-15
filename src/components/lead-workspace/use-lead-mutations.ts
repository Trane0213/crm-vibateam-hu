import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { humanizeSupabaseError } from "@/lib/db-hooks";

/** Inline lead update (státusz, summary/jegyzet). Optimista nélkül — egyszerű invalidate. */
export function useUpdateLead(leadId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Record<string, any>) => {
      if (!leadId) throw new Error("Nincs kiválasztott lead.");
      // A won státusz kizárólag a `sales_mark_won_with_project` RPC-n
      // keresztül állítható (atomic projekt-létrehozással). Inline patch
      // a kliensből nem írhat won-t — a backend trigger amúgy is elutasítaná.
      if (patch.status === "won") {
        throw new Error(
          "A megnyert státusz csak a „Megnyertük” gombbal állítható (pipeline → projekt).",
        );
      }
      const { error } = await supabase.from("leads").update(patch).eq("id", leadId);
      if (error) throw error;
    },
    onError: (e: any) => toast.error("Mentés sikertelen", { description: humanizeSupabaseError(e) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
  });
}

export type FollowupQuickInput = {
  due_date: string;
  followup_type: string;
  result?: string;
};

/** Lead-hez kötött gyors followup létrehozás (company_id-n keresztül). */
export function useCreateLeadFollowup(lead: { id: string; company_id: string | null } | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: FollowupQuickInput) => {
      if (!lead) throw new Error("Nincs kiválasztott lead.");
      const payload: Record<string, any> = {
        due_date: input.due_date,
        followup_type: input.followup_type,
        result: input.result ?? null,
        completed: false,
      };
      if (lead.company_id) payload.company_id = lead.company_id;
      const { error } = await supabase.from("followups").insert(payload);
      if (error) throw error;
    },
    onError: (e: any) => toast.error("Followup létrehozás sikertelen", { description: humanizeSupabaseError(e) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["followups"] });
      toast.success("Utókövetés rögzítve");
    },
  });
}