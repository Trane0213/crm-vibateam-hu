import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { scanContactConflicts } from "@/lib/dedupe/global-scans";

function useContactConflictMap() {
  return useQuery({
    queryKey: ["contacts", "list", "conflict-map"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const list = await scanContactConflicts();
      const m = new Map<string, ("email" | "phone")[]>();
      for (const c of list) {
        for (const k of c.contacts) {
          const arr = m.get(k.id) ?? [];
          arr.push(c.key);
          m.set(k.id, arr);
        }
      }
      return m;
    },
  });
}

type Row = { id: string; email?: string | null; phone?: string | null; company_id?: string | null };

/** „Kapcsolat állapot" (D7 megfogalmazás). */
export function ContactQualityCell({ row }: { row: Row }) {
  const conflicts = useContactConflictMap();
  const conflictsForRow = conflicts.data?.get(row.id) ?? [];

  const filled = [row.email, row.phone, row.company_id].filter(Boolean).length;
  const pct = Math.round((filled / 3) * 100);

  if (conflictsForRow.length > 0) {
    return (
      <Badge variant="outline" className="gap-1 border-destructive text-destructive">
        <AlertTriangle className="h-3 w-3" />
        Konfliktus · {conflictsForRow.map((k) => (k === "email" ? "email" : "telefon")).join(", ")}
      </Badge>
    );
  }
  if (pct === 100)
    return <Badge variant="outline" className="border-emerald-400 text-emerald-700">🟢 Teljes</Badge>;
  if (pct >= 50)
    return <Badge variant="outline" className="border-amber-400 text-amber-700">🟡 Hiányos · {pct}%</Badge>;
  return <Badge variant="outline" className="border-destructive/40 text-destructive">🔴 Hiányos · {pct}%</Badge>;
}

export function ContactLinkStateCell({ row }: { row: Row }) {
  if (!row.company_id)
    return <Badge variant="outline" className="border-amber-400 text-amber-700">Nincs céghez kötve</Badge>;
  return <Badge variant="secondary">Összekapcsolva</Badge>;
}