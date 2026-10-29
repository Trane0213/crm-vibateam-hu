import { LEAD_STATUS_LABEL, type LeadStatus } from "@/lib/sales/constants";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { humanizeSupabaseError } from "@/lib/db-hooks";
import { logActivity } from "@/lib/activity-log";

/**
 * Inline lead update (státusz, felelős, következő lépés, jegyzet).
 * Ugyanazt a cache-t frissíti és ugyanúgy naplóz, mint a Pipeline adatlap,
 * hogy a két módosítási útvonal azonos állapotot mutasson.
 */
export function useUpdateLead(leadId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Record<string, any>) => {
      if (!leadId) throw new Error("Nincs kiválasztott lead.");
      // A won státusz kizárólag a `sales_mark_won_with_project` RPC-n
      // keresztül állítható (atomic projekt-létrehozással).
      if (patch.status === "won") {
        throw new Error(
          "A megnyert státusz csak a „Megnyertük” gombbal állítható (pipeline → projekt).",
        );
      }
      // lost_at / won_at / assigned_at időbélyegeket az adatbázis tölti ki.
      const { lost_at: _l, won_at: _w, assigned_at: _a, ...clean } = patch;
      const { data: before } = await supabase
        .from("leads").select("status").eq("id", leadId).maybeSingle();
      const { error } = await supabase.from("leads").update(clean as any).eq("id", leadId);
      if (error) throw error;
      if (clean.status && before?.status !== clean.status) {
        await logActivity("leads", "status_change", leadId, { from: before?.status ?? null, to: clean.status });
      } else {
        await logActivity("leads", "update", leadId, { fields: Object.keys(clean) });
      }
    },
    onError: (e: any) => toast.error("Mentés sikertelen", { description: humanizeSupabaseError(e) }),
    onSuccess: (_d, patch) => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["pipeline"] });
      // Egyértelmű visszajelzés minden mentés után (a hibát az onError jelzi).
      if (patch.status) {
        toast.success(`Státusz: ${LEAD_STATUS_LABEL[patch.status as LeadStatus] ?? patch.status}`);
      } else if ("next_step_type" in patch) {
        toast.success(patch.next_step_type ? "Következő lépés mentve" : "Következő lépés törölve");
      } else {
        toast.success("Mentve");
      }
    },
  });
}

export type FollowupQuickInput = {
  due_date: string;
  followup_type: string;
  result?: string;
};

/** Lead-hez kötött gyors followup létrehozás. A felelőst az adatbázis a lead sales felelőséből tölti. */
export function useCreateLeadFollowup(lead: { id: string; company_id: string | null } | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: FollowupQuickInput) => {
      if (!lead) throw new Error("Nincs kiválasztott lead.");
      const payload: Record<string, any> = {
        lead_id: lead.id,
        due_date: input.due_date,
        followup_type: input.followup_type,
        result: input.result ?? null,
        completed: false,
      };
      if (lead.company_id) payload.company_id = lead.company_id;
      const { error } = await supabase.from("followups").insert(payload as any);
      if (error) throw error;
    },
    onError: (e: any) => toast.error("Followup létrehozás sikertelen", { description: humanizeSupabaseError(e) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["followups"] });
      qc.invalidateQueries({ queryKey: ["leads"] });
      toast.success("Utókövetés rögzítve");
    },
  });
}
