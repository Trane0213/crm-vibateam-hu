// Ajánlatlista szétválasztása munkafolyamat szerint — csak megjelenítés.
import { quoteWorkflow, type QuoteWorkflow } from "@/lib/quotes/workflow";
import type { WsStatus } from "@/components/workspace-v2/status-badge";

export type QuoteTab = QuoteWorkflow | "none";
export const QUOTE_TAB_LABEL: Record<QuoteTab, string> = {
  received_budget: "Kapott Excel árazása",
  viba_offer: "Saját VIBA-ajánlat",
  none: "Típus nélkül",
};

export function quoteTab(kind: unknown): QuoteTab {
  return quoteWorkflow(kind) ?? "none";
}

/** Csak aktuális verziók, munkafolyamat szerint csoportosítva. */
export function splitQuotes<T extends { quote_kind: string | null; is_current: boolean | null }>(rows: T[]) {
  const out: Record<QuoteTab, T[]> = { received_budget: [], viba_offer: [], none: [] };
  for (const r of rows) if (r.is_current !== false) out[quoteTab(r.quote_kind)].push(r);
  return out;
}

/** Ajánlat állapota az egységes jelölésben. */
export function quoteWsStatus(status: string | null, net: number | null): WsStatus {
  if (status === "accepted") return "done";
  if (status === "rejected" || status === "withdrawn") return "done";
  if (status === "sent" || status === "negotiation") return "approval";
  if (net == null) return "missing";
  return "review";
}
