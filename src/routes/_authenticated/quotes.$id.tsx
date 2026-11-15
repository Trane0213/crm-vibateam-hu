import { createFileRoute } from "@tanstack/react-router";
import { parseQuoteView } from "@/lib/quotes/simple-workspace";
import { QuoteWorkflowDetail } from "@/components/quotes/quote-workflow-detail";

export const Route = createFileRoute("/_authenticated/quotes/$id")({
  head: () => ({ meta: [
    { title: "Ajánlat munkaterület | VIBA-TEAM CRM" },
    { name: "description", content: "VIBA-ajánlat alapadatok, dokumentumok, árazás, sablon, Gmail-kiküldés és utánkövetés." },
    { property: "og:title", content: "Ajánlat munkaterület | VIBA-TEAM CRM" },
    { property: "og:description", content: "Ajánlat előkészítése és követése a VIBA-TEAM CRM meglévő munkaterületein." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  validateSearch: (s: Record<string, unknown>): { nezet?: "egyszeru" } => ({ nezet: parseQuoteView(s.nezet) }),
  component: QuoteDetail,
});

function QuoteDetail() {
  const { id } = Route.useParams();
  return <QuoteWorkflowDetail id={id} />;
}

