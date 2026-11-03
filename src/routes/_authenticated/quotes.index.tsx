import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { FileText, Plus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtDate, fmtDateTime } from "@/components/resource/resource-page";
import { createDraftQuote } from "@/lib/quotes/create";
import { humanizeSupabaseError } from "@/lib/db-hooks";
import { formatHuf } from "@/lib/format";
import { useAssigneeLookup } from "@/lib/sales/use-assignee-name";
import { useQuoteList } from "@/components/quotes/use-quote-list";
import { filterQuoteRows } from "@/lib/quotes/quote-list";
import { QUOTE_STATUSES, QUOTE_STATUS_LABEL, quoteStatusLabel } from "@/lib/quotes/quote-status";
import { NewQuoteButton } from "@/components/quotes/new-quote-button";

const KIND_LABEL: Record<string, string> = { received_budget: "Kapott költségvetés", viba_offer: "Saját VIBA" };
const PAGE = 50;

function QuotesPage() {
  const navigate = useNavigate();
  const who = useAssigneeLookup();
  const list = useQuoteList();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [currentOnly, setCurrentOnly] = useState(true);
  const [page, setPage] = useState(0);

  const rows = useMemo(() => filterQuoteRows(list.data ?? [], { search, status, currentOnly }), [list.data, search, status, currentOnly]);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const shown = rows.slice(page * PAGE, page * PAGE + PAGE);

  return (
    <div className="p-6">
      <PageHeader
        title="Ajánlatok"
        description="Minden ajánlat, amihez hozzáférsz: ügyfél, felelős, állapot, kiküldés, összeg és következő utánkövetés."
        actions={<NewQuoteButton variant="default" />}
      />
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Input className="w-72" placeholder="Keresés: cím, ügyfél, ügy, projekt" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
        <Select value={status} onValueChange={(v) => { setStatus(v); setPage(0); }}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Minden állapot</SelectItem>
            {QUOTE_STATUSES.map((s) => <SelectItem key={s} value={s}>{QUOTE_STATUS_LABEL[s]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" variant={currentOnly ? "default" : "outline"} onClick={() => { setCurrentOnly(!currentOnly); setPage(0); }}>
          {currentOnly ? "Csak aktuális verziók" : "Minden verzió"}
        </Button>
        <span className="text-xs text-muted-foreground">{rows.length} találat</span>
      </div>
      {list.isLoading ? (
        <p className="mt-6 text-sm text-muted-foreground">Betöltés…</p>
      ) : list.error ? (
        <p className="mt-6 text-sm text-destructive">Az ajánlatok nem tölthetők be: {humanizeSupabaseError(list.error)}</p>
      ) : rows.length === 0 ? (
        <EmptyState icon={FileText} title="Nincs találat" description="Módosítsd a szűrést, vagy hozz létre új ajánlatot." />
      ) : (
        <>
          <div className="mt-4 rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ajánlat</TableHead>
                  <TableHead>Ügyfél</TableHead>
                  <TableHead>Ügy / projekt</TableHead>
                  <TableHead>Felelős</TableHead>
                  <TableHead>Típus</TableHead>
                  <TableHead>Verzió</TableHead>
                  <TableHead>Állapot</TableHead>
                  <TableHead>Kiküldve</TableHead>
                  <TableHead className="text-right">Nettó</TableHead>
                  <TableHead>Köv. utánkövetés</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((r) => (
                  <TableRow key={r.id} className="cursor-pointer" onClick={() => navigate({ to: "/quotes/$id", params: { id: r.id } })}>
                    <TableCell className="max-w-[220px] truncate font-medium">{r.title?.trim() || <span className="text-muted-foreground">— (címzetlen)</span>}</TableCell>
                    <TableCell>
                      {r.company_id ? (
                        <Link to="/customers/$id" params={{ id: r.company_id }} onClick={(e) => e.stopPropagation()} className="text-primary hover:underline">{r.company_name ?? "—"}</Link>
                      ) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="max-w-[220px] truncate text-muted-foreground">
                      {r.lead_id ? (
                        <Link to="/leads" search={{ lead: r.lead_id } as any} onClick={(e) => e.stopPropagation()} className="hover:underline">{r.lead_summary ?? "Ügy"}</Link>
                      ) : r.project_id ? (
                        <Link to="/projects/$id" params={{ id: r.project_id }} onClick={(e) => e.stopPropagation()} className="hover:underline">{r.project_title ?? "Projekt"}</Link>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{r.responsible_user_id ? who(r.responsible_user_id) : "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{r.quote_kind ? KIND_LABEL[r.quote_kind] ?? r.quote_kind : "—"}</TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {r.alternative_key ?? "A"} · v{r.version ?? 1}{r.is_current && <Badge variant="outline" className="ml-1">aktuális</Badge>}
                    </TableCell>
                    <TableCell><Badge variant="secondary">{quoteStatusLabel(r.status)}</Badge></TableCell>
                    <TableCell className="text-muted-foreground">{r.sent_at ? fmtDate(r.sent_at) : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.net == null ? <span className="text-muted-foreground">Nincs megadva</span> : formatHuf(r.net)}</TableCell>
                    <TableCell className="text-muted-foreground">{r.next_followup ? fmtDateTime(r.next_followup) : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {pages > 1 && (
            <div className="mt-3 flex items-center justify-end gap-2 text-sm">
              <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>Előző</Button>
              <span className="text-muted-foreground">{page + 1} / {pages}</span>
              <Button size="sm" variant="outline" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Következő</Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/quotes/")({
  head: () => ({ meta: [
    { title: "Ajánlatok | VIBA-TEAM CRM" },
    { name: "description", content: "Kapott költségvetések és saját VIBA-ajánlatok kezelése." },
    { property: "og:title", content: "Ajánlatok | VIBA-TEAM CRM" },
    { property: "og:description", content: "Ajánlatok, verziók, kiküldések és utánkövetések." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: QuotesPage,
});
