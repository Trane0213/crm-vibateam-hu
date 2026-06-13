import { useState } from "react";
import { LeadListColumn } from "./lead-list-column";
import { LeadDetailColumn } from "./lead-detail-column";
import { LeadActionPanel } from "./lead-action-panel";

/**
 * Lead Workspace — 3 oszlopos, oldalváltás nélküli munkafelület.
 * Bal: lista + szűrők. Közép: lead részletek + inline szerkesztés + idővonal.
 * Jobb: akciók (Email → Followup → AI → Ajánlat[sales]).
 */
export function LeadWorkspace({
  mode, className,
}: {
  mode: "marketing" | "sales";
  className?: string;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  return (
    <div
      className={
        className ??
        "mx-6 mb-6 grid h-[640px] grid-cols-1 overflow-hidden rounded-lg border bg-card lg:grid-cols-[280px_minmax(0,1fr)_300px]"
      }
    >
      <div className="border-r">
        <LeadListColumn selectedId={selectedId} onSelect={setSelectedId} mode={mode} />
      </div>
      <div className="border-r min-w-0">
        <LeadDetailColumn leadId={selectedId} mode={mode} />
      </div>
      <div>
        <LeadActionPanel leadId={selectedId} mode={mode} />
      </div>
    </div>
  );
}