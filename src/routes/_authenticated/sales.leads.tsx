import { createFileRoute } from "@tanstack/react-router";
import { SalesShell } from "@/components/sales/sales-shell";
import { PipelineBoard } from "@/components/pipeline/pipeline-board";

export const Route = createFileRoute("/_authenticated/sales/leads")({
  component: PipelinePage,
});

function PipelinePage() {
  return (
    <SalesShell
      title="Pipeline"
      description="Ajánlat előkészítés → kiadás → utánkövetés → szerződés → megnyert/elveszett."
    >
      <PipelineBoard />
    </SalesShell>
  );
}