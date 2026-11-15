import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { wsHead } from "@/lib/workspace-v2/head";

export const Route = createFileRoute("/_authenticated/munka/kapcsolattarto/$id")({
  head: () => wsHead("Kapcsolattartó", "Kapcsolattartó az ügyféladatlapon."),
  component: ContactRedirect,
});

/** A kapcsolattartó az ügyféladatlap Kapcsolattartók fülén jelenik meg (kiemelve). */
function ContactRedirect() {
  const { id } = Route.useParams();
  const q = useQuery({
    queryKey: ["contacts", "v2-company-of", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("contacts").select("company_id").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  if (q.isLoading) return <div className="p-6 text-sm text-muted-foreground">Betöltés…</div>;
  if (!q.data?.company_id) return <p className="p-6 text-sm text-muted-foreground">A kapcsolattartó nem található, nincs céghez kötve, vagy nincs hozzá jogosultságod.</p>;
  return <Navigate to="/munka/ugyfel/$id" params={{ id: q.data.company_id }} search={{ tab: "contacts", contact: id }} replace />;
}
