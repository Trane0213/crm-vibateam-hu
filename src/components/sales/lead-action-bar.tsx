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
import { LEAD_STATUS_LABEL, STATUS_TRANSITIONS, type LeadStatus } from "@/lib/sales/constants";
import { menuTransitions } from "@/lib/sales/sales-flow";

/**
 * Pipeline műveletek. A menü csak a meglévő állapotgép (STATUS_TRANSITIONS)
 * által engedett köztes szakaszokat mutatja — tiltott elemek nem jelennek meg.
 * Megnyerés/Elveszett külön gombon; a szabályokat a DB triggerek érvényesítik.
 */
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
  const targets = menuTransitions(current);
  const canWin = allowed.has("won");

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={busy || targets.length === 0}>
              Szakasz módosítása <ChevronDown className="ml-1 h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-60">
            <DropdownMenuLabel>Áthelyezés ide</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {targets.map((s) => (
              <DropdownMenuItem key={s} onClick={() => onChangeStatus(s)}>
                {LEAD_STATUS_LABEL[s]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button size="sm" variant="default" disabled={!canWin || busy} onClick={onWon}>
          <Trophy className="mr-1 h-4 w-4" /> Megnyertük
        </Button>
        <Button size="sm" variant="outline" className="text-destructive" disabled={!allowed.has("lost") || busy} onClick={onLost}>
          <XCircle className="mr-1 h-4 w-4" /> Elveszett
        </Button>
      </div>
      {!canWin && current !== "won" && current !== "lost" && (
        <p className="text-[11px] text-muted-foreground">„Megnyertük” csak a Szerződés szakaszból indítható; egy lépésben létrehozza a projektet.</p>
      )}
    </div>
  );
}
