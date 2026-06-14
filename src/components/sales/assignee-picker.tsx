import { useQuery } from "@tanstack/react-query";
import { Check, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePermissions } from "@/hooks/use-permissions";

type SalesUser = { user_id: string; full_name: string; email: string; active_lead_count: number };

/**
 * Header inline picker a `leads.assigned_to` mezőhöz.
 * - A lead a marketing átadáskor mindig ki van osztva — nincs "Magamhoz veszem"
 *   és nincs "Lemondom" / kiosztás-törlés a sales folyamatban.
 * - Sales user csak olvasásra látja a felelőst (a saját nevét).
 * - Owner/admin másik sales user-re tudja átrendelni a `v_sales_user_load`-ból.
 */
export function AssigneePicker({
  assigneeId,
  assigneeLabel,
  onAssign,
  busy,
}: {
  assigneeId: string | null | undefined;
  assigneeLabel: string;
  onAssign: (next: string | null) => void;
  busy?: boolean;
}) {
  const { role } = usePermissions();
  const isOwner = role === "owner";

  const sales = useQuery({
    queryKey: ["v_sales_user_load"],
    staleTime: 5 * 60_000,
    enabled: isOwner,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_sales_user_load")
        .select("user_id, full_name, email, active_lead_count")
        .order("active_lead_count", { ascending: true });
      if (error) throw error;
      return (data ?? []) as SalesUser[];
    },
  });

  // Sales szerepkör: read-only felelős cimke.
  if (!isOwner) {
    return (
      <Button size="sm" variant="ghost" disabled className="pointer-events-none">
        <Users className="mr-1 h-4 w-4" /> Felelős: {assigneeLabel}
      </Button>
    );
  }

  // Owner: csak átrendelés másik sales userre (nincs unassign).
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" disabled={busy}>
          <Users className="mr-1 h-4 w-4" /> Felelős: {assigneeLabel}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-[11px] uppercase text-muted-foreground">Átrendelés sales csapaton belül</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {sales.isLoading && <DropdownMenuItem disabled>Betöltés…</DropdownMenuItem>}
        {(sales.data ?? []).map((u) => (
          <DropdownMenuItem key={u.user_id} onClick={() => onAssign(u.user_id)}>
            <span className="flex-1 truncate">{u.full_name || u.email}</span>
            <span className="ml-2 text-[10px] text-muted-foreground">{u.active_lead_count} aktív</span>
            {assigneeId === u.user_id && <Check className="ml-1 h-3.5 w-3.5" />}
          </DropdownMenuItem>
        ))}
        {!sales.isLoading && (sales.data ?? []).length === 0 && (
          <DropdownMenuItem disabled>Nincs sales user</DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
