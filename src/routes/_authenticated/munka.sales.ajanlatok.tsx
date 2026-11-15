import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Loader2, Search, FileSpreadsheet, Calculator } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useQuoteList } from "@/components/quotes/use-quote-list";
import { NewQuoteButton } from "@/components/quotes/new-quote-button";
import { WsPageHeader } from "@/components/workspace-v2/parts";
import { StatusBadge } from "@/components/workspace-v2/status-badge";
import { QUOTE_TAB_LABEL, quoteWsStatus, splitQuotes, type QuoteTab } from "@/lib/workspace-v2/quotes-view";
import { quoteStatusLabel } from "@/lib/quotes/quote-status";
import { formatDate, formatHuf } from "@/lib/format";
import { humanizeSupabaseError } from "@/lib/db-hooks";
import { wsHead } from "@/lib/workspace-v2/head";
import { cn } from "@/lib/utils";

const TABS: QuoteTab[] = ["received_budget", "viba_offer", "none"];

export const Route = createFileRoute("/_authenticated/munka/sales/ajanlatok")({
  head: () => wsHead("Ajánlatok", "Kapott Excel árazása és saját VIBA-ajánlatok külön munkafolyamatban."),
  validateSearch: (s: Record<string, unknown>): { tipus?: QuoteTab } =>
    TABS.includes(s.tipus as QuoteTab) ? { tipus: s.tipus as QuoteTab } : {},
  component: QuotesPage,
});

function QuotesPage() {
  const { tipus } = Route.useSearch();
  const tab: QuoteTab = tipus ?? "received_budget";
  const list = useQuoteList();
  const [search, setSearch] = useState("");
  const groups = useMemo(() => splitQuotes(list.data ?? []), [list.data]);
  const rows = groups[tab].filter((r) => !search.trim() || r.searchText.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <>
      <WsPageHeader title="Ajánlatok" subtitle="A két munkafolyamat külön kezelőfelülettel" right={<NewQuoteButton variant="default" openIn="v2" />} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Link to="/munka/sales/ajanlatok" search={{ tipus: "received_budget" }} className={cn("rounded-xl border bg-card p-4 transition hover:border-primary/40", tab === "received_budget" && "border-primary ring-1 ring-primary/30")}>
          <FileSpreadsheet className="h-5 w-5 text-status-success" />
          <div className="mt-1 font-display font-semibold">Kapott Excel árazása</div>
          <p className="text-xs text-muted-foreground">Az ügyfél költségvetését árazod; a saját tételszerkesztő itt nem jelenik meg. ({groups.received_budget.length})</p>
        </Link>
        <Link to="/munka/sales/ajanlatok" search={{ tipus: "viba_offer" }} className={cn("rounded-xl border bg-card p-4 transition hover:border-primary/40", tab === "viba_offer" && "border-primary ring-1 ring-primary/30")}>
          <Calculator className="h-5 w-5 text-primary" />
          <div className="mt-1 font-display font-semibold">Saját VIBA-ajánlat</div>
          <p className="text-xs text-muted-foreground">Paraméterekből kalkulált saját ajánlat tételekkel. ({groups.viba_offer.length})</p>
        </Link>
      </div>
      <section className="rounded-xl border bg-card p-4 shadow-[var(--shadow-card)]">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <h2 className="truncate font-display text-base font-semibold">{QUOTE_TAB_LABEL[tab]} ({rows.length})</h2>
          {groups.none.length > 0 && tab !== "none" && <Link to="/munka/sales/ajanlatok" search={{ tipus: "none" }} className="text-xs text-primary hover:underline">Típus nélkül: {groups.none.length}</Link>}
        </div>
        <div className="relative mt-3 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Keresés: cím, ügyfél, azonosító…" className="pl-8" aria-label="Keresés az ajánlatok között" />
        </div>
        {list.isLoading ? <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Ajánlatok betöltése…</div>
          : list.isError ? <p role="alert" className="py-4 text-sm text-destructive">Az ajánlatok nem tölthetők be: {humanizeSupabaseError(list.error)}</p>
          : rows.length === 0 ? <p className="py-6 text-sm text-muted-foreground">Nincs ajánlat ebben a munkafolyamatban.</p>
          : (
            <ul className="mt-2 divide-y">
              {rows.map((r) => (
                <li key={r.id}>
                  <Link to="/munka/sales/ajanlat/$id" params={{ id: r.id }} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-2.5 hover:bg-muted/40">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{r.title?.trim() || `#${r.id.slice(0, 8)}`}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {r.company_name ?? "Ügyfél nincs megadva"} · {quoteStatusLabel(r.status)} · {r.net == null ? "nettó: hiányzik" : formatHuf(r.net)}
                        {r.next_followup ? ` · utánkövetés: ${formatDate(r.next_followup)}` : ""}
                      </div>
                    </div>
                    <StatusBadge status={quoteWsStatus(r.status, r.net)} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
      </section>
    </>
  );
}
