import { createFileRoute } from "@tanstack/react-router";
import { SalesShell } from "@/components/sales/sales-shell";
import { PipelineBoard } from "@/components/pipeline/pipeline-board";

export const Route = createFileRoute("/_authenticated/sales/leads")({
  head: () => ({ meta: [
    { title: "Pipeline | VIBA CRM" },
    { name: "description", content: "Értékesítési ügyek szakaszonként: ajánlat, kiküldés, utánkövetés, szerződés." },
    { property: "og:title", content: "Pipeline | VIBA CRM" },
    { property: "og:description", content: "A VIBA CRM aktív értékesítési ügyei szakaszonként." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  validateSearch: (s: Record<string, unknown>): { lead?: string } =>
    typeof s.lead === "string" && /^[0-9a-f-]{36}$/i.test(s.lead) ? { lead: s.lead } : {},
  component: PipelinePage,
});

function PipelinePage() {
  const { lead } = Route.useSearch();
  return (
    <SalesShell
      title="Pipeline"
      description="Ajánlat → kiküldés → utánkövetés → szerződés → Megnyertük (projektátadás). Kattints egy ügyre a következő teendőhöz."
    >
      <PipelineBoard initialLeadId={lead ?? null} />
    </SalesShell>
  );
}
