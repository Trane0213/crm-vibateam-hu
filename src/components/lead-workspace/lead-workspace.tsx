import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { LeadListColumn } from "./lead-list-column";
import { LeadDossierColumn } from "./lead-dossier-column";
import { SalesPrepPanel } from "./sales-prep-panel";
import { LeadDetailColumn } from "./lead-detail-column";
import { LeadActionPanel } from "./lead-action-panel";
import { useAuth } from "@/hooks/use-auth";
import { isOwnSalesLead } from "@/lib/sales/lead-visibility";

/**
 * Lead Workspace — 3 oszlop.
 *
 * SALES mód (a sales előkészítő szakasz munkafelülete):
 *   1) Lead lista (csak még nem pipeline-ba került leadek)
 *   2) Lead előélet — read-only dosszié
 *   3) Sales előkészítő panel — aktivitás, következő lépés, Pipeline-ba / Elveszett
 *
 * MARKETING mód: változatlan — a marketinges munkafelület.
 */
export function LeadWorkspace({
  mode, className, initialLeadId = null,
}: {
  mode: "marketing" | "sales";
  className?: string;
  /** Mélylink (/leads?lead=<id>): a megcélzott lead kiválasztása. */
  initialLeadId?: string | null;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(initialLeadId);

  // Mélylink: ha a lead nem látható (RLS) vagy nem létezik, jelezzük, és nem
  // mutatunk helyette másik leadet csendben.
  // SALES módban a mélylink csak saját (assigned_to = user) leadet nyithat meg;
  // az ellenőrzésig nem jelenítjük meg (nincs villanás más ügyével).
  const { user } = useAuth();
  useEffect(() => {
    if (!initialLeadId) return;
    if (mode === "sales" && !user?.id) return;
    setSelectedId(mode === "sales" ? null : initialLeadId);
    let cancelled = false;
    supabase.from("leads").select("id,assigned_to").eq("id", initialLeadId).maybeSingle().then(({ data }) => {
      if (cancelled) return;
      const allowed = !!data && (mode !== "sales" || isOwnSalesLead(data, user?.id));
      if (allowed) { setSelectedId(initialLeadId); return; }
      toast.error("A megnyitni kívánt lead nem található, vagy nincs hozzá jogosultságod.");
      setSelectedId(null);
    });
    return () => { cancelled = true; };
  }, [initialLeadId, mode, user?.id]);

  const shell =
    className ??
    "mx-6 mb-6 flex h-[calc(100vh-9rem)] min-h-[560px] overflow-hidden rounded-lg border bg-card";

  if (mode === "sales") {
    return (
      <div className={shell}>
        <div className="min-h-0 w-[240px] flex-shrink-0 border-r xl:w-[300px]">
          <LeadListColumn selectedId={selectedId} onSelect={setSelectedId} mode="sales" />
        </div>
        <div className="min-h-0 min-w-0 flex-1 border-r">
          <LeadDossierColumn leadId={selectedId} />
        </div>
        <div className="min-h-0 w-[300px] min-w-0 flex-shrink-0 overflow-y-auto xl:w-[360px]">
          <SalesPrepPanel leadId={selectedId} />
        </div>
      </div>
    );
  }

  // Marketing mód — meglévő részletek + akciók (változatlan).
  return (
    <div className={shell}>
      <div className="min-h-0 w-[240px] flex-shrink-0 border-r xl:w-[300px]">
        <LeadListColumn selectedId={selectedId} onSelect={setSelectedId} mode="marketing" />
      </div>
      <div className="min-h-0 min-w-0 flex-1 border-r">
        <LeadDetailColumn leadId={selectedId} mode="marketing" />
      </div>
      <div className="min-h-0 w-[300px] min-w-0 flex-shrink-0 overflow-y-auto xl:w-[340px]">
        <LeadActionPanel leadId={selectedId} mode="marketing" />
      </div>
    </div>
  );
}