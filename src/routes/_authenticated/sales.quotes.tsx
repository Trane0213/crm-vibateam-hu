import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { SalesShell } from "@/components/sales/sales-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatHuf } from "@/lib/format";
import { humanizeSupabaseError } from "@/lib/db-hooks";
import { useQuoteList } from "@/components/quotes/use-quote-list";
import { summarizeActiveQuotes } from "@/lib/quotes/quote-list";
import { QUOTE_STATUSES, QUOTE_STATUS_LABEL } from "@/lib/quotes/quote-status";

export const Route = createFileRoute("/_authenticated/sales/quotes")({
  component: SalesQuotesPage,
});

/** S7: csak riport — a szerkesztés az Ajánlatok listán / adatlapon történik. */
function SalesQuotesPage() {
  const list = useQuoteList();
  const s = useMemo(() => summarizeActiveQuotes(list.data ?? []), [list.data]);

  return (
    <SalesShell
      title="Ajánlatok – riport"
      description="Aktuális ajánlati állapotok és ismert összegek. Az alternatívák és régi verziók nem adódnak össze."
      actions={<Link to="/quotes"><Button size="sm" variant="outline">Ajánlatok lista</Button></Link>}
    >
      {list.isLoading ? (
        <p className="text-sm text-muted-foreground">Betöltés…</p>
      ) : list.error ? (
        <p className="text-sm text-destructive">A riport nem tölthető be: {humanizeSupabaseError(list.error)}</p>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <Kpi label="Aktív ajánlat (aktuális verzió)" value={String(s.activeCount)} />
            <Kpi label="Érintett ügy" value={String(s.deals)} />
            <Kpi label="Aktív nettó érték (ügyenként egyszer)" value={s.net == null ? "Nincs megadva" : formatHuf(s.net)} />
            <Kpi label="Ügy összeg nélkül" value={String(s.withoutValue)} />
          </div>
          <Card>
            <CardContent className="p-4">
              <div className="mb-2 text-sm font-medium">Aktuális verziók állapot szerint</div>
              <ul className="divide-y rounded-md border text-sm">
                {QUOTE_STATUSES.map((st) => (
                  <li key={st} className="flex items-center justify-between px-3 py-2">
                    <span>{QUOTE_STATUS_LABEL[st]}</span>
                    <span className="tabular-nums text-muted-foreground">{s.byStatus[st] ?? 0}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      )}
    </SalesShell>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Card><CardContent className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
    </CardContent></Card>
  );
}
