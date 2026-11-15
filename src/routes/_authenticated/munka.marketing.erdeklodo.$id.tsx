import { createFileRoute } from "@tanstack/react-router";
import { WebRequestDetail } from "@/components/web-requests/web-request-detail";
import { CaseAssistant } from "@/components/workspace-v2/parts";
import { caseAssistantPrompts } from "@/lib/workspace-v2/case-assistant";
import { wsHead } from "@/lib/workspace-v2/head";

export const Route = createFileRoute("/_authenticated/munka/marketing/erdeklodo/$id")({
  head: () => wsHead("Érdeklődő", "Webes érdeklődés eredeti adatai, CRM-be vétele és minősítése."),
  component: InboundCase,
});

function InboundCase() {
  const { id } = Route.useParams();
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 overflow-hidden rounded-xl border bg-card shadow-[var(--shadow-card)]"><WebRequestDetail id={id} /></div>
      <div><CaseAssistant agent="marketing" prompts={caseAssistantPrompts("marketing", "inbound", { id })} /></div>
    </div>
  );
}
