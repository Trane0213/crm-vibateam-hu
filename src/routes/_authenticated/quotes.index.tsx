import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { FileText, Plus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader, EmptyState } from "@/components/page-header";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { fmtDate, useLookup } from "@/components/resource/resource-page";
import { supabase } from "@/integrations/supabase/client";
import { createDraftQuote } from "@/lib/quotes/create";
import { toast } from "sonner";
import { humanizeSupabaseError } from "@/lib/db-hooks";

/**
 * Ajánlatok lista — Sprint 1 / 1. lépés.
 * Csak működő alap: lista + „Új ajánlat" gomb, ami létrehoz egy piszkozat
 * rekordot (lead nélkül) és megnyitja az adatlapot. Szerkesztő később.
 */
function QuotesPage() {
  const navigate = useNavigate();
  const companyLabel = useLookup("companies", "name");

  const list = useQuery({
    queryKey: ["quotes", "list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Cégneveket a lead → company_id-n keresztül oldjuk fel.
  const leadIds = Array.from(new Set((list.data ?? []).map((r: any) => r.lead_id).filter(Boolean)));
  const leads = useQuery({
    queryKey: ["quotes", "list", "leads", leadIds.sort().join(",")],
    enabled: leadIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("id, company_id, summary")
        .in("id", leadIds as string[]);
      if (error) throw error;
      return data ?? [];
    },
  });
  const leadMap = new Map<string, any>((leads.data ?? []).map((l: any) => [l.id, l]));

  const onNew = async () => {
    try {
      const id = await createDraftQuote({ leadId: null });
      toast.success("Új piszkozat létrehozva");
      navigate({ to: "/quotes/$id", params: { id } });
    } catch (e: any) {
      toast.error("Nem sikerült létrehozni", { description: humanizeSupabaseError(e) });
    }
  };

  const rows = list.data ?? [];

  return (
    <div className="p-6">
      <PageHeader
        title="Ajánlatok"
        description="Ajánlatok listája. Új ajánlat: piszkozat rekord készül és megnyílik a szerkesztésre."
        actions={
          <Button size="sm" onClick={onNew}>
            <Plus className="mr-1.5 h-4 w-4" /> Új ajánlat
          </Button>
        }
      />
      {list.isLoading ? (
        <p className="mt-6 text-sm text-muted-foreground">Betöltés…</p>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Még nincs ajánlat"
          description={`Kattints az „Új ajánlat” gombra, vagy indíts ajánlatot egy leadről.`}
        />
      ) : (
        <div className="mt-4 rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cím</TableHead>
                <TableHead>Ügyfél</TableHead>
                <TableHead>Lead</TableHead>
                <TableHead className="w-24">Verzió</TableHead>
                <TableHead className="w-32">Státusz</TableHead>
                <TableHead className="w-40">Létrejött</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r: any) => {
                const l = r.lead_id ? leadMap.get(r.lead_id) : null;
                const cid = l?.company_id ?? null;
                return (
                  <TableRow key={r.id} className="cursor-pointer" onClick={() => navigate({ to: "/quotes/$id", params: { id: r.id } })}>
                    <TableCell className="max-w-[260px] truncate font-medium">
                      {r.title?.trim() || <span className="text-muted-foreground">— (címzetlen)</span>}
                    </TableCell>
                    <TableCell className="font-medium">
                      {cid ? (
                        <Link
                          to="/customers/$id"
                          params={{ id: cid }}
                          onClick={(e) => e.stopPropagation()}
                          className="text-primary hover:underline"
                        >
                          {companyLabel(cid)}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[280px] truncate text-muted-foreground">
                      {l?.summary ?? (r.lead_id ? `#${String(r.lead_id).slice(0, 8)}` : "—")}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      v{r.version ?? 1} {r.is_current && <Badge variant="outline" className="ml-1">aktuális</Badge>}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{r.status ?? "draft"}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{fmtDate(r.created_at)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/quotes/")({
  component: QuotesPage,
});