import { createFileRoute } from "@tanstack/react-router";
import { PipelineBoardV2 } from "@/components/workspace-v2/pipeline-board-v2";
import { WsPageHeader } from "@/components/workspace-v2/parts";
import { NewQuoteButton } from "@/components/quotes/new-quote-button";
import { wsHead } from "@/lib/workspace-v2/head";

export const Route = createFileRoute("/_authenticated/munka/sales/pipeline")({
  head: () => wsHead("Ügyek – Pipeline", "Értékesítési ügyek húzható táblán, a meglévő lépésszabályokkal."),
  validateSearch: (s: Record<string, unknown>): { lead?: string } =>
    typeof s.lead === "string" && /^[0-9a-f-]{36}$/i.test(s.lead) ? { lead: s.lead } : {},
  component: PipelinePage,
});

function PipelinePage() {
  const { lead } = Route.useSearch();
  return (
    <>
      <WsPageHeader title="Ügyek – Pipeline" subtitle="Ajánlat → kiküldés → utánkövetés → szerződés → megnyerés" right={<NewQuoteButton variant="outline" openIn="v2" />} />
      <PipelineBoardV2 initialLeadId={lead ?? null} />
    </>
  );
}
