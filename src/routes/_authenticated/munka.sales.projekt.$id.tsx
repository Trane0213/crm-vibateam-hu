import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { CaseAssistant, WsPageHeader } from "@/components/workspace-v2/parts";
import { RelatedDocumentsPanel } from "@/components/documents/related-documents-panel";
import { PROJECT_STATUS_LABEL } from "@/lib/viba-constants";
import { formatDate } from "@/lib/format";
import { humanizeSupabaseError } from "@/lib/db-hooks";
import { wsHead } from "@/lib/workspace-v2/head";
import { caseAssistantPrompts } from "@/lib/workspace-v2/case-assistant";

export const Route = createFileRoute("/_authenticated/munka/sales/projekt/$id")({
  head: () => wsHead("Projekt", "A megnyert ügyből létrejött projekt állapota és átadása."),
  component: ProjectSummary,
});

/** Sales nézet a megnyert ügy projektjéről: csak olvas; a kivitelezés a projektvezető felületén zajlik. */
function ProjectSummary() {
  const { id } = Route.useParams();
  const p = useQuery({
    queryKey: ["projects", "v2", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("id,title,status,deadline,start_date,address,handoff_at,company_id,lead_id,project_manager_user_id,companies(name)").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const pm = useQuery({
    queryKey: ["users_profile", "name", p.data?.project_manager_user_id],
    enabled: !!p.data?.project_manager_user_id,
    queryFn: async () => {
      const { data } = await supabase.from("users_profile").select("full_name,email").eq("auth_user_id", p.data!.project_manager_user_id!).maybeSingle();
      return data;
    },
  });
  if (p.isLoading) return <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Projekt betöltése…</div>;
  if (p.isError) return <p role="alert" className="text-sm text-destructive">A projekt nem tölthető be: {humanizeSupabaseError(p.error)}</p>;
  if (!p.data) return <p className="text-sm text-muted-foreground">Ez a projekt nem létezik, vagy nincs hozzá jogosultságod.</p>;
  const d = p.data;
  const company = (d.companies as { name: string | null } | null)?.name ?? null;
  const rows: [string, React.ReactNode][] = [
    ["Állapot", d.status ? PROJECT_STATUS_LABEL[d.status] ?? d.status : null],
    ["Ügyfél", d.company_id ? <Link to="/munka/ugyfel/$id" params={{ id: d.company_id }} className="text-primary hover:underline">{company ?? "Ügyfél"}</Link> : null],
    ["Ügy", d.lead_id ? <Link to="/munka/ugy/$id" params={{ id: d.lead_id }} className="text-primary hover:underline">Megnyert ügy megnyitása</Link> : null],
    ["Projektvezető", pm.data?.full_name ?? pm.data?.email ?? null],
    ["Kezdés", d.start_date ? formatDate(d.start_date) : null],
    ["Határidő", d.deadline ? formatDate(d.deadline) : null],
    ["Cím", d.address],
    ["Átadva a projektvezetőnek", d.handoff_at ? formatDate(d.handoff_at) : null],
  ];
  return (
    <>
      <WsPageHeader title={d.title} subtitle={company ?? "Projekt"} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <section className="rounded-xl border bg-card p-4 text-sm shadow-[var(--shadow-card)]">
            {rows.map(([k, v]) => (
              <div key={k} className="grid grid-cols-[180px_minmax(0,1fr)] gap-2 border-b py-2 last:border-0">
                <span className="text-muted-foreground">{k}</span><span className="min-w-0 break-words">{v ?? <span className="text-muted-foreground">nincs megadva</span>}</span>
              </div>
            ))}
          </section>
          <RelatedDocumentsPanel ctx={{ projectIds: [id] }} title="Projekt dokumentumai" />
        </div>
        <CaseAssistant agent="sales" prompts={caseAssistantPrompts("sales", "project", { id, name: d.title })} />
      </div>
    </>
  );
}
