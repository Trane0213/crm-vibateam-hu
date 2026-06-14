import { useQuery } from "@tanstack/react-query";
import { Check, UserPlus, UserX } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/use-auth";
import { usePermissions } from "@/hooks/use-permissions";

type SalesUser = { user_id: string; full_name: string; email: string; active_lead_count: number };

/**
 * Header inline picker a `leads.assigned_to` mezőhöz.
 * - Sales user csak magához rendelhet (RLS `leads_update_sales` WITH CHECK).
 * - Owner/admin bármelyik sales user-hez rendelhet a `v_sales_user_load`-ból.
 * - Aki éppen a felelős, lekérheti magáról is.
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
  const { user } = useAuth();
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

  const meId = user?.id ?? null;
  const isMine = !!meId && meId === assigneeId;

  // Sales szerepkör: nincs dropdown, csak claim/unassign saját magához.
  if (!isOwner) {
    if (!meId) return null;
    if (!assigneeId) {
      return (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => onAssign(meId)}>
          <UserPlus className="mr-1 h-4 w-4" /> Magamhoz veszem
        </Button>
      );
    }
    if (isMine) {
      return (
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => onAssign(null)}>
          <UserX className="mr-1 h-4 w-4" /> Lemondom
        </Button>
      );
    }
    return null;
  }

  // Owner: full picker
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" disabled={busy}>
          <UserPlus className="mr-1 h-4 w-4" /> Felelős: {assigneeLabel}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Hozzárendelés</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {meId && (
          <DropdownMenuItem onClick={() => onAssign(meId)}>
            <UserPlus className="mr-2 h-4 w-4" /> Magamhoz veszem
          </DropdownMenuItem>
        )}
        <DropdownMenuItem disabled={!assigneeId} onClick={() => onAssign(null)}>
          <UserX className="mr-2 h-4 w-4" /> Kiosztás törlése
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-[11px] uppercase text-muted-foreground">Sales csapat</DropdownMenuLabel>
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
