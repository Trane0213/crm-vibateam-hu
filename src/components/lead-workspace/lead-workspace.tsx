import { useState } from "react";
import { LeadListColumn } from "./lead-list-column";

/**
 * Lead Workspace — átmeneti állapot: csak a lista oszlop él.
 * A 2. (Részletek) és 3. (Akciók) oszlopot szándékosan eltávolítottuk —
 * a teljes lead-nézet és sales műveleti panel újratervezés alatt.
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

  return (
    <div className={shell}>
      <div className="min-h-0 w-full max-w-md flex-shrink-0 border-r">
        <LeadListColumn selectedId={selectedId} onSelect={setSelectedId} mode={mode} />
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-8 text-center text-sm text-muted-foreground">
        A lead részletek és sales akciók nézete újratervezés alatt.
      </div>
    </div>
  );
}