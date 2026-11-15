// Pipeline-húzás döntése. Tiszta függvény: a meglévő STATUS_TRANSITIONS szabályt
// alkalmazza, a „Megnyert” mindig a meglévő projektlétrehozó ablakot nyitja,
// az „Elveszett” a meglévő okválasztót. Adatot nem ír.
import { LEAD_STATUS_LABEL, STATUS_TRANSITIONS, type LeadStatus } from "@/lib/sales/constants";

export type DropTarget = LeadStatus;
export type DropDecision =
  | { kind: "noop" }
  | { kind: "status"; to: LeadStatus }
  | { kind: "won-dialog" }
  | { kind: "lost-dialog" }
  | { kind: "blocked"; reason: string };

export function pipelineDrop(from: LeadStatus, to: DropTarget): DropDecision {
  if (from === to) return { kind: "noop" };
  if (from === "won" || from === "lost") return { kind: "blocked", reason: "Lezárt ügy nem helyezhető át." };
  const allowed = STATUS_TRANSITIONS[from] ?? [];
  if (to === "won") {
    return allowed.includes("won")
      ? { kind: "won-dialog" }
      : { kind: "blocked", reason: `Megnyerni csak a „${LEAD_STATUS_LABEL.contract}” szakaszból lehet, projektvezető megadásával.` };
  }
  if (to === "lost") return allowed.includes("lost") ? { kind: "lost-dialog" } : { kind: "blocked", reason: "Ez az ügy nem zárható le elveszettként." };
  if (allowed.includes(to)) return { kind: "status", to };
  const list = allowed.filter((s) => s !== "lost" && s !== "won").map((s) => LEAD_STATUS_LABEL[s]);
  return {
    kind: "blocked",
    reason: `Nem engedélyezett lépés: ${LEAD_STATUS_LABEL[from]} → ${LEAD_STATUS_LABEL[to]}.${list.length ? ` Innen ide léphet: ${list.join(", ")}.` : ""}`,
  };
}

/** Oszloponkénti darabszám és ismert nettó összeg; ismeretlen érték nem számít bele, de jelöljük. */
export function columnSummary(leads: { quote_total?: number | null }[]) {
  let sum = 0, unknown = 0;
  for (const l of leads) {
    if (typeof l.quote_total === "number" && Number.isFinite(l.quote_total)) sum += l.quote_total;
    else unknown++;
  }
  return { count: leads.length, sum, unknown };
}
