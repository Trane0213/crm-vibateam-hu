import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, Trophy, XCircle } from "lucide-react";
import {
  LEAD_STATUSES,
  LEAD_STATUS_LABEL,
  STATUS_TRANSITIONS,
  type LeadStatus,
} from "@/lib/sales/constants";

export function LeadActionBar({ status }: { status: LeadStatus | string | null | undefined }) {
  const current = (status ?? "new") as LeadStatus;
  const allowed = new Set(STATUS_TRANSITIONS[current] ?? []);

  const notYet = () => toast.info("Sales UI v2: a státuszváltás hamarosan élesedik.");

  return (
    <div className="flex flex-wrap items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            Státuszváltás <ChevronDown className="ml-1 h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel>Engedélyezett átmenet</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {LEAD_STATUSES.filter((s) => s !== current).map((s) => {
            const ok = allowed.has(s);
            return (
              <DropdownMenuItem key={s} disabled={!ok} onClick={notYet}>
                {LEAD_STATUS_LABEL[s]}
                {!ok && <span className="ml-auto text-[10px] text-muted-foreground">tiltott</span>}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
      <Button size="sm" variant="default" disabled={!allowed.has("won")} onClick={notYet}>
        <Trophy className="mr-1 h-4 w-4" /> Megnyerés
      </Button>
      <Button size="sm" variant="destructive" disabled={!allowed.has("lost")} onClick={notYet}>
        <XCircle className="mr-1 h-4 w-4" /> Elveszett
      </Button>
    </div>
  );
}