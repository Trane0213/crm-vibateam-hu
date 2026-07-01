import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FileText, Building2, Radar } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/page-header";
import { supabase } from "@/integrations/supabase/client";
import { fmtDateTime, useLookup } from "@/components/resource/resource-page";

export const Route = createFileRoute("/_authenticated/quotes/$id")({
  component: QuoteDetail,
});

/**
 * Ajánlat adatlap — Sprint 1 / 1. lépés.
 *
 * Ez most szándékosan CSAK egy üres váz: bizonyítja, hogy a lead → új ajánlat
 * → ajánlat adatlap navigáció végigmegy, és a rekord létrejön a DB-ben.
 * A tényleges szerkesztő (tételek, státusz, verziók, összeg) a következő
 * lépésben épül rá — most nincs itt semmi menthető mező.
 */
type QuoteRow = {
  id: string;
  lead_id: string | null;
  project_id: string | null;
  version: number | null;
  is_current: boolean | null;
  status: string | null;
  created_at: string | null;
};

function QuoteDetail() {
  const { id } = Route.useParams();
  const companyLabel = useLookup("companies", "name");

  const q = useQuery({
    queryKey: ["quotes", "detail", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select("id, lead_id, project_id, version, is_current, status, created_at")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as QuoteRow | null;
    },
  });

  const lead = useQuery({
    queryKey: ["quotes", "detail", id, "lead", q.data?.lead_id],
    enabled: !!q.data?.lead_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("id, company_id, summary")
        .eq("id", q.data!.lead_id!)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  if (q.isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Ajánlat betöltése…</div>;
  }
  if (q.error || !q.data) {
    return (
      <div className="p-6">
        <EmptyState
          icon={FileText}
          title="Az ajánlat nem található"
          description={(q.error as any)?.message}
        />
      </div>
    );
  }
  const quote = q.data;
  const companyId = lead.data?.company_id ?? null;

  return (
    <div className="flex flex-col">
      <div className="border-b bg-background px-6 py-4">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Ajánlat</div>
        <h1 className="mt-1 flex items-center gap-2 text-xl font-semibold">
          {quote.version != null ? `v${quote.version}` : `#${String(quote.id).slice(0, 8)}`}
          <Badge variant="secondary">{quote.status ?? "draft"}</Badge>
          {quote.is_current && <Badge variant="outline">aktuális</Badge>}
        </h1>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          {companyId && (
            <span>
              Ügyfél:{" "}
              <Link to="/customers/$id" params={{ id: companyId }} className="text-primary hover:underline">
                <Building2 className="mr-1 inline h-3.5 w-3.5" />
                {companyLabel(companyId)}
              </Link>
            </span>
          )}
          {quote.lead_id && (
            <span>
              Lead:{" "}
              <Link to="/leads" className="text-primary hover:underline">
                <Radar className="mr-1 inline h-3.5 w-3.5" />
                {lead.data?.summary?.slice(0, 60) ?? `#${quote.lead_id.slice(0, 8)}`}
              </Link>
            </span>
          )}
          <span>Létrejött: {fmtDateTime(quote.created_at)}</span>
        </div>
      </div>

      <div className="p-6">
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          Ez az ajánlat adatlap üres váz. A szerkesztő (tételek, összeg, státusz,
          verziók) a következő lépésben épül rá.
        </div>
      </div>
    </div>
  );
}