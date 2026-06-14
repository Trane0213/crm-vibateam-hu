import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { SalesShell } from "@/components/sales/sales-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/sales/quotes")({
  component: SalesQuotesPage,
});

function SalesQuotesPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["sales", "quotes-by-lead"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select("id, lead_id, version, is_current, status, created_at")
        .not("lead_id", "is", null)
        .order("lead_id", { ascending: true })
        .order("version", { ascending: false })
        .limit(300);
      if (error) throw error;
      const grouped: Record<string, any[]> = {};
      for (const q of data ?? []) {
        const key = (q as any).lead_id as string;
        (grouped[key] ||= []).push(q);
      }
      return grouped;
    },
  });

  return (
    <SalesShell
      title="Ajánlatok"
      description="Leadenként csoportosított ajánlat-verziók (váz). Új ajánlat hamarosan."
      actions={
        <Button size="sm" disabled title="Quote modul: hamarosan">
          Új ajánlat
        </Button>
      }
    >
      <div className="space-y-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Betöltés…</p>
        ) : !data || Object.keys(data).length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Még nincs leadhez kötött ajánlat.
            </CardContent>
          </Card>
        ) : (
          Object.entries(data).map(([leadId, quotes]) => (
            <Card key={leadId}>
              <CardContent className="space-y-2 p-4">
                <div className="flex items-center justify-between">
                  <Link to="/leads/$id" params={{ id: leadId }} className="text-sm font-medium text-primary hover:underline">
                    Lead #{leadId.slice(0, 8)}
                  </Link>
                  <span className="text-xs text-muted-foreground">{quotes.length} verzió</span>
                </div>
                <ul className="divide-y rounded-md border">
                  {quotes.map((q: any) => (
                    <li key={q.id} className="flex items-center justify-between px-3 py-2 text-sm">
                      <span className="flex items-center gap-2">
                        <Badge variant="outline">v{q.version}</Badge>
                        {q.is_current && <Badge>aktuális</Badge>}
                        <span className="text-muted-foreground">{q.status ?? "—"}</span>
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {q.created_at ? new Date(q.created_at).toLocaleDateString("hu-HU") : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </SalesShell>
  );
}