import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/use-permissions";
import { SalesPrepPanel } from "@/components/lead-workspace/sales-prep-panel";
import { LeadDossierColumn } from "@/components/lead-workspace/lead-dossier-column";
import { LeadDetailColumn } from "@/components/lead-workspace/lead-detail-column";
import { LeadActionPanel } from "@/components/lead-workspace/lead-action-panel";
import { PipelineDetailSheet } from "@/components/pipeline/pipeline-detail-sheet";
import { fetchPipelineLeads } from "@/components/pipeline/pipeline-data";
import { CaseAssistant, WsPageHeader } from "@/components/workspace-v2/parts";
import { LEAD_STATUS_LABEL, type LeadStatus } from "@/lib/sales/constants";
import { humanizeSupabaseError } from "@/lib/db-hooks";
import { wsHead } from "@/lib/workspace-v2/head";
import { caseAssistantPrompts } from "@/lib/workspace-v2/case-assistant";

export const Route = createFileRoute("/_authenticated/munka/ugy/$id")({
  head: () => wsHead("Ügy", "Egy ügy munkalapja: következő lépés, ajánlat, előzmények."),
  component: CasePage,
});

const box = "min-w-0 overflow-hidden rounded-xl border bg-card shadow-[var(--shadow-card)]";

/**
 * Egy ügy munkalapja a meglévő részekből, a jogosultság szerint (RLS):
 * aktív Pipeline-ügynél a Pipeline-műveletek, előkészítésnél a Sales-előkészítés,
 * marketingesnél a marketinges ügyrészletek.
 */
function CasePage() {
  const { id } = Route.useParams();
  const { role } = usePermissions();
  const marketing = role === "marketing";
  const lead = useQuery({
    queryKey: ["leads", "v2-case", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("leads").select("id,status,summary,pipeline_entered_at,companies(name)").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const activePipeline = !marketing && !!lead.data?.pipeline_entered_at && lead.data.status !== "won" && lead.data.status !== "lost";
  const board = useQuery({ queryKey: ["pipeline", "board"], queryFn: fetchPipelineLeads, enabled: activePipeline });
  const pipelineLead = (board.data ?? []).find((l) => l.id === id) ?? null;

  if (lead.isLoading) return <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Ügy betöltése…</div>;
  if (lead.isError) return <p role="alert" className="text-sm text-destructive">Az ügy nem tölthető be: {humanizeSupabaseError(lead.error)}</p>;
  if (!lead.data) return <p className="text-sm text-muted-foreground">Ez az ügy nem létezik, vagy nincs hozzá jogosultságod.</p>;
  const l = lead.data;
  const company = (l.companies as { name: string | null } | null)?.name ?? null;
  const agent = marketing ? "marketing" : "sales";
  const assistant = <CaseAssistant agent={agent} prompts={caseAssistantPrompts(agent, "lead", { name: company ?? l.summary, id })} />;
  const header = <WsPageHeader title={company ?? l.summary ?? "Ügy"} subtitle={[LEAD_STATUS_LABEL[l.status as LeadStatus] ?? l.status, company ? l.summary : null].filter(Boolean).join(" · ")} />;

  if (activePipeline) {
    return (
      <>
        {header}
        <div className={box}>
          {board.isLoading ? <div className="p-6 text-sm text-muted-foreground">Betöltés…</div>
            : pipelineLead ? <PipelineDetailSheet inline lead={pipelineLead} open onOpenChange={() => {}} />
            : <p className="p-6 text-sm text-muted-foreground">Az ügy Pipeline-adatai nem tölthetők be.</p>}
        </div>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className={box}><LeadDossierColumn leadId={id} /></div>
          <div>{assistant}</div>
        </div>
      </>
    );
  }
  return (
    <>
      {header}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className={box}>{marketing ? <LeadDetailColumn leadId={id} mode="marketing" /> : <LeadDossierColumn leadId={id} />}</div>
        <div className="space-y-3">
          {assistant}
          <div className={box}>{marketing ? <LeadActionPanel leadId={id} mode="marketing" /> : <SalesPrepPanel leadId={id} />}</div>
        </div>
      </div>
    </>
  );
}
