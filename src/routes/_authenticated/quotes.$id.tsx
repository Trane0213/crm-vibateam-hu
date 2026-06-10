import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FileText, Briefcase, BellRing } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/page-header";
import { supabase } from "@/integrations/supabase/client";
import { useListWhere } from "@/lib/db-hooks";
import { fmtDate, fmtDateTime, useLookup } from "@/components/resource/resource-page";
import { formatHuf } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/quotes/$id")({
  component: QuoteDetail,
});

function QuoteDetail() {
  const { id } = Route.useParams();
  const projectLabel = useLookup("projects", "title");
  const q = useQuery({
    queryKey: ["quotes", "detail", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("quotes").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });
  const followups = useListWhere<any>("followups", "quote_id", id, { order: "due_date", ascending: true });

  if (q.isLoading) return <div className="p-6 text-sm text-muted-foreground">Ajánlat betöltése…</div>;
  if (q.error || !q.data) {
    return <div className="p-6"><EmptyState icon={FileText} title="Az ajánlat nem található" description={(q.error as any)?.message} /></div>;
  }
  const quote = q.data;
  return (
    <div className="flex flex-col">
      <div className="border-b bg-background px-6 py-4">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Ajánlat</div>
        <h1 className="mt-1 text-xl font-semibold">
          {quote.version != null ? `v${quote.version}` : `#${String(quote.id).slice(0, 8)}`}
          {quote.status && <Badge variant="secondary" className="ml-2">{quote.status}</Badge>}
        </h1>
        <div className="mt-1 text-sm text-muted-foreground">
          Projekt:{" "}
          {quote.project_id ? (
            <Link to="/projects/$id" params={{ id: quote.project_id }} className="text-primary hover:underline">
              {projectLabel(quote.project_id)}
            </Link>
          ) : "—"}
        </div>
      </div>
      <div className="grid gap-4 p-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-sm">Adatok</CardTitle></CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            <Row label="Verzió" value={quote.version != null ? `v${quote.version}` : "—"} />
            <Row label="Státusz" value={quote.status ?? "—"} />
            <Row label="Összérték" value={quote.total_amount != null ? formatHuf(Number(quote.total_amount)) : "—"} />
            <Row label="Létrejött" value={fmtDateTime(quote.created_at)} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><BellRing className="h-4 w-4" />Follow-up-ok</CardTitle></CardHeader>
          <CardContent>
            {(followups.data ?? []).length === 0 ? (
              <EmptyState icon={BellRing} title="Nincs follow-up" />
            ) : (
              <ul className="space-y-1.5 text-sm">
                {(followups.data ?? []).map((f) => (
                  <li key={f.id} className="flex justify-between gap-2">
                    <span className="truncate">{f.followup_type ?? "—"} · {f.result ?? ""}</span>
                    <span className="tabular-nums text-muted-foreground">{fmtDateTime(f.due_date)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Briefcase className="h-4 w-4" />Projekt-kapcsolat</CardTitle></CardHeader>
          <CardContent className="text-sm">
            {quote.project_id ? (
              <Link to="/projects/$id" params={{ id: quote.project_id }} className="text-primary hover:underline">
                Ugrás a projektre: {projectLabel(quote.project_id)}
              </Link>
            ) : (
              <span className="text-muted-foreground">Nincs projekthez kötve.</span>
            )}
            <div className="mt-2 text-xs text-muted-foreground">
              Ajánlat tételek (<code>quote_items</code>) modul: következő fejlesztési kör.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}