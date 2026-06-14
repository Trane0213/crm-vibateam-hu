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

export function LeadActionBar({
  status,
  onChangeStatus,
  onWon,
  onLost,
  busy,
}: {
  status: LeadStatus | string | null | undefined;
  onChangeStatus: (next: LeadStatus) => void;
  onWon: () => void;
  onLost: () => void;
  busy?: boolean;
}) {
  const current = (status ?? "new") as LeadStatus;
  const allowed = new Set(STATUS_TRANSITIONS[current] ?? []);
  // A Won / Lost külön gombokon megy, a dropdown a köztes átmenetekért felel.
  const dropdownTargets = LEAD_STATUSES.filter((s) => s !== current && s !== "won" && s !== "lost");

  return (
    <div className="flex flex-wrap items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={busy}>
            Státuszváltás <ChevronDown className="ml-1 h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel>Engedélyezett átmenet</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {dropdownTargets.map((s) => {
            const ok = allowed.has(s);
            return (
              <DropdownMenuItem key={s} disabled={!ok} onClick={() => onChangeStatus(s)}>
                {LEAD_STATUS_LABEL[s]}
                {!ok && <span className="ml-auto text-[10px] text-muted-foreground">tiltott</span>}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
      <Button size="sm" variant="default" disabled={!allowed.has("won") || busy} onClick={onWon}>
        <Trophy className="mr-1 h-4 w-4" /> Megnyerés
      </Button>
      <Button size="sm" variant="destructive" disabled={!allowed.has("lost") || busy} onClick={onLost}>
        <XCircle className="mr-1 h-4 w-4" /> Elveszett
      </Button>
    </div>
  );
}