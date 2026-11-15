// Marketing – Ma: megjelenítési leképezés a meglévő marketing-day-flow fölött.
import type { MarketingPriorityKind, MarketingPriorityRow } from "@/lib/marketing/marketing-day-flow";
import type { WsStatus } from "@/components/workspace-v2/status-badge";

const STATUS: Record<MarketingPriorityKind, WsStatus> = {
  reply: "review",
  "followup-overdue": "missing",
  callback: "review",
  "followup-today": "review",
  "task-overdue": "missing",
  "task-today": "review",
  "handoff-ready": "approval",
  "missing-contact": "missing",
  "new-contact": "auto",
};

export function marketingRowStatus(kind: MarketingPriorityKind): WsStatus {
  return STATUS[kind];
}

/** Céges teendő az ügyféladatlapra (a megfelelő fülre) visz; saját feladat helyben zárható, nincs hivatkozása. */
export function marketingRowLink(row: Pick<MarketingPriorityRow, "target">):
  | { to: "/munka/ugyfel/$id"; params: { id: string }; search: { tab?: string } }
  | null {
  if (row.target.kind !== "company") return null;
  return { to: "/munka/ugyfel/$id", params: { id: row.target.companyId }, search: row.target.tab ? { tab: row.target.tab } : {} };
}

/** A napi listában szereplő saját feladat azonosítója (a sor azonosítójából). */
export function marketingTaskId(row: Pick<MarketingPriorityRow, "id" | "kind">): string | null {
  return row.kind === "task-overdue" || row.kind === "task-today" ? row.id.replace(/^task-/, "") : null;
}

export function scarletDailyPrompt(input: { rows: number; replies: number; qualified: number; activeCampaigns: number | null }) {
  return `Készíts napi marketingjavaslatot: ${input.rows} teendő, ${input.replies} beérkezett válasz, ${input.qualified} átadható cég${input.activeCampaigns != null ? `, ${input.activeCampaigns} nyitott kampány` : ""}. Rangsorold a teendőket, és javasolj tartalmat vagy kampánylépést. Ne küldj és ne módosíts semmit.`;
}
