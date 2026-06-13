import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { loadCompanySurfaceMap } from "@/lib/crm/crm-surface";

function useCompanySurfaceMap() {
  return useQuery({
    queryKey: ["companies", "surface-map"],
    queryFn: loadCompanySurfaceMap,
    staleTime: 60_000,
  });
}

export function CompanyCrmCountCell({ companyId, field }: { companyId: string; field: "contactCount" | "activeLeadCount" | "emailActivityCount" | "conflictCount" | "identityStrength" }) {
  const q = useCompanySurfaceMap();
  const row = q.data?.get(companyId);
  if (!row) return <span className="text-xs text-muted-foreground">—</span>;

  if (field === "identityStrength") {
    return <span className="text-sm font-medium tabular-nums">{row.identityStrength}/100</span>;
  }

  const value = row[field];
  return <span className="text-sm tabular-nums">{value}</span>;
}

export function CompanyConflictBadgeCell({ companyId }: { companyId: string }) {
  const q = useCompanySurfaceMap();
  const row = q.data?.get(companyId);
  const count = row?.conflictCount ?? 0;
  if (count === 0) return <span className="text-xs text-muted-foreground">0</span>;
  return (
    <Badge variant="outline" className="border-destructive/40 text-destructive">
      {count} konfliktus
    </Badge>
  );
}