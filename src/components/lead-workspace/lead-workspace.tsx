import { useState } from "react";
import { List, FileText, Zap } from "lucide-react";
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
  // Mobil tab — desktopon (lg+) mindhárom oszlop egyszerre látszik, mobilon csak az aktív.
  const [mobileTab, setMobileTab] = useState<"list" | "detail" | "actions">("list");

  function handleSelect(id: string) {
    setSelectedId(id);
    setMobileTab("detail");
  }

  const shell =
    className ??
    "mx-6 mb-6 flex h-[calc(100vh-9rem)] min-h-[560px] flex-col overflow-hidden rounded-lg border bg-card lg:grid lg:grid-cols-[300px_minmax(0,1fr)_340px]";

  return (
    <div className={shell}>
      {/* Mobil tab fejléc */}
      <div className="flex shrink-0 gap-1 border-b bg-muted/30 p-1 text-[11px] lg:hidden">
        <MobileTab active={mobileTab === "list"}    icon={List}     label="Lista"     onClick={() => setMobileTab("list")} />
        <MobileTab active={mobileTab === "detail"}  icon={FileText} label="Részletek" onClick={() => setMobileTab("detail")} />
        <MobileTab active={mobileTab === "actions"} icon={Zap}      label="Akciók"    onClick={() => setMobileTab("actions")} />
      </div>

      <div className={`min-h-0 flex-1 lg:border-r ${mobileTab === "list" ? "block" : "hidden"} lg:block`}>
        <LeadListColumn selectedId={selectedId} onSelect={handleSelect} mode={mode} />
      </div>
      <div className={`min-h-0 min-w-0 flex-1 lg:border-r ${mobileTab === "detail" ? "block" : "hidden"} lg:block`}>
        <LeadDetailColumn leadId={selectedId} mode={mode} />
      </div>
      <div className={`min-h-0 flex-1 ${mobileTab === "actions" ? "block" : "hidden"} lg:block`}>
        <LeadActionPanel leadId={selectedId} mode={mode} />
      </div>
    </div>
  );
}

function MobileTab({
  active, icon: Icon, label, onClick,
}: {
  active: boolean;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-1.5 rounded px-2 py-1.5 font-medium transition-colors ${
        active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}