import { useState } from "react";
import { LeadListColumn } from "./lead-list-column";
import { LeadDossierColumn } from "./lead-dossier-column";
import { SalesPrepPanel } from "./sales-prep-panel";
import { LeadDetailColumn } from "./lead-detail-column";
import { LeadActionPanel } from "./lead-action-panel";

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
  mode, className,
}: {
  mode: "marketing" | "sales";
  className?: string;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const shell =
    className ??
    "mx-6 mb-6 flex h-[calc(100vh-9rem)] min-h-[560px] overflow-hidden rounded-lg border bg-card";

  if (mode === "sales") {
    return (
      <div className={shell}>
        <div className="min-h-0 w-[300px] flex-shrink-0 border-r">
          <LeadListColumn selectedId={selectedId} onSelect={setSelectedId} mode="sales" />
        </div>
        <div className="min-h-0 flex-1 border-r">
          <LeadDossierColumn leadId={selectedId} />
        </div>
        <div className="min-h-0 w-[360px] flex-shrink-0">
          <SalesPrepPanel leadId={selectedId} />
        </div>
      </div>
    );
  }

  // Marketing mód — meglévő részletek + akciók (változatlan).
  return (
    <div className={shell}>
      <div className="min-h-0 w-[300px] flex-shrink-0 border-r">
        <LeadListColumn selectedId={selectedId} onSelect={setSelectedId} mode="marketing" />
      </div>
      <div className="min-h-0 flex-1 border-r">
        <LeadDetailColumn leadId={selectedId} mode="marketing" />
      </div>
      <div className="min-h-0 w-[340px] flex-shrink-0">
        <LeadActionPanel leadId={selectedId} mode="marketing" />
      </div>
    </div>
  );
}