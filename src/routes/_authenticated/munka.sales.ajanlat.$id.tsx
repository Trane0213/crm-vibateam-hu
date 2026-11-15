import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { QuoteWorkflowDetail } from "@/components/quotes/quote-workflow-detail";
import { QUOTE_TAB_LABEL, quoteTab } from "@/lib/workspace-v2/quotes-view";
import { wsHead } from "@/lib/workspace-v2/head";

export const Route = createFileRoute("/_authenticated/munka/sales/ajanlat/$id")({
  head: () => wsHead("Ajánlat munkaterület", "Kapott Excel árazása vagy saját VIBA-ajánlat, kiküldés, utánkövetés és szerződés-előkészítés."),
  component: QuoteWorkspace,
});

/**
 * Az új ajánlat-munkaterület a meglévő ajánlatfelületet használja egyszerűsített
 * módban: ugyanaz a mentés, árazás, csomag, Gmail-küldés és szerződés-előkészítés,
 * párhuzamos írási útvonal nélkül. A típus szerint csak a hozzá tartozó elemek jelennek meg.
 */
function QuoteWorkspace() {
  const { id } = Route.useParams();
  const kind = useQuery({
    queryKey: ["quotes", "v2-kind", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("quotes").select("id,quote_kind").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const tab = quoteTab(kind.data?.quote_kind);
  return (
    <>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div className="min-w-0 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{kind.isLoading ? "Ajánlat" : QUOTE_TAB_LABEL[tab]}</span> · új munkaterület
        </div>
        <div className="flex gap-2">
          <Button asChild size="sm" variant="ghost"><Link to="/munka/sales/ajanlatok" search={tab === "none" ? { tipus: "none" } : { tipus: tab }}><ArrowLeft className="h-4 w-4" />Ajánlatok</Link></Button>
          <Button asChild size="sm" variant="outline"><Link to="/quotes/$id" params={{ id }}>Részletes nézet</Link></Button>
        </div>
      </div>
      <div className="overflow-hidden rounded-xl border bg-card shadow-[var(--shadow-card)]">
        <QuoteWorkflowDetail id={id} simple />
      </div>
    </>
  );
}
