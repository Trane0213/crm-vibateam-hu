import type { PmTab } from "@/lib/pm/pm-day-flow";
import type { HandoffItem } from "./sales-pm-handoff";

/** Egy átadási tétel pótlási helye a projekt adatlapján (fül). Az alapadatok és az állapot az Átadás fülön / fejlécben. */
export function handoffFixTab(i: Pick<HandoffItem, "fix">): PmTab | null {
  switch (i.fix.kind) {
    case "tab": return i.fix.tab;
    case "basics": return "handover";
    case "status": return "handover";
    default: return null;
  }
}
