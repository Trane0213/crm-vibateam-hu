import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { humanizeSupabaseError } from "@/lib/db-hooks";
import { updateLeadOrThrow } from "@/lib/sales/lead-update";
import { logActivity } from "@/lib/activity-log";
import { LEAD_STATUS_LABEL, statusToLostStage, type LeadStatus } from "@/lib/sales/constants";

type LeadRef = { id: string; status: LeadStatus } | null;

/**
 * A Pipeline egyetlen státusz- és elveszett-írási útvonala (részletablak és új
 * húzható tábla közösen): visszaolvasott update + aktivitásnapló + ["pipeline"]
 * és ["leads"] invalidálás. A „won” átmenet nem itt, hanem a meglévő
 * CreateProjectDialog → sales_mark_won_with_project úton történik.
 */
export function usePipelineLeadMutations(onLostDone?: () => void) {
  const qc = useQueryClient();
  const invalidate = (leadId?: string) => {
    qc.invalidateQueries({ queryKey: ["pipeline"] });
    if (leadId) qc.invalidateQueries({ queryKey: ["pipeline", "activity", leadId] });
    qc.invalidateQueries({ queryKey: ["leads"] });
  };

  const statusMut = useMutation({
    mutationFn: async ({ lead, next }: { lead: NonNullable<LeadRef>; next: LeadStatus }) => {
      await updateLeadOrThrow(lead.id, { status: next });
      await logActivity("leads", "status_change", lead.id, { from: lead.status, to: next });
    },
    onError: (e: any) => toast.error("Státuszváltás sikertelen", { description: humanizeSupabaseError(e) }),
    onSuccess: (_d, { lead, next }) => { toast.success(`Az ügy átkerült: ${LEAD_STATUS_LABEL[next]}`); invalidate(lead.id); },
  });

  const lostMut = useMutation({
    mutationFn: async ({ lead, lost_reason, lost_note }: { lead: NonNullable<LeadRef>; lost_reason: string; lost_note: string | null }) => {
      await updateLeadOrThrow(lead.id, {
        status: "lost",
        // lost_at-et az adatbázis trigger tölti ki; lost_stage a tényleges aktuális szakasz.
        lost_reason, lost_note, lost_stage: statusToLostStage(lead.status),
      });
      await logActivity("leads", "status_change", lead.id, { from: lead.status, to: "lost", reason: lost_reason });
    },
    onError: (e: any) => toast.error("Az Elveszett jelölés sikertelen", { description: humanizeSupabaseError(e) }),
    onSuccess: (_d, { lead }) => { toast.success("Az ügy elveszettként lezárva"); invalidate(lead.id); onLostDone?.(); },
  });

  return { statusMut, lostMut, invalidate };
}
