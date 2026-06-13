import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { loadContactSurfaceMap } from "@/lib/crm/crm-surface";

function useContactSurfaceMap() {
  return useQuery({
    queryKey: ["contacts", "surface-map"],
    queryFn: loadContactSurfaceMap,
    staleTime: 60_000,
  });
}

export function ContactPercentCell({ contactId }: { contactId: string }) {
  const q = useContactSurfaceMap();
  const row = q.data?.get(contactId);
  if (!row) return <span className="text-xs text-muted-foreground">—</span>;
  return <span className="text-sm font-medium tabular-nums">{row.qualityPct}%</span>;
}

export function ContactMetricCell({ contactId, field }: { contactId: string; field: "activeLeadCount" | "emailActivityCount" }) {
  const q = useContactSurfaceMap();
  const row = q.data?.get(contactId);
  if (!row) return <span className="text-xs text-muted-foreground">—</span>;
  return <span className="text-sm tabular-nums">{row[field]}</span>;
}

export function ContactConflictBadgeCell({ contactId }: { contactId: string }) {
  const q = useContactSurfaceMap();
  const row = q.data?.get(contactId);
  const badges = row?.conflictBadges ?? [];
  if (badges.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <Badge variant="outline" className="gap-1 border-destructive/40 text-destructive">
      <AlertTriangle className="h-3 w-3" />
      {badges.join(", ")}
    </Badge>
  );
}