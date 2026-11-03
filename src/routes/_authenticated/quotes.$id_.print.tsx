import { createFileRoute } from "@tanstack/react-router";
import { QuotePrintDocument } from "@/components/quotes/quote-print-document";

export const Route = createFileRoute("/_authenticated/quotes/$id_/print")({
  head: () => ({ meta: [
    { title: "Ajánlat nyomtatása | VIBA CRM" },
    { name: "description", content: "VIBA-TEAM ajánlat nyomtatható nézete és PDF-mentése." },
    { property: "og:title", content: "Ajánlat nyomtatása | VIBA CRM" },
    { property: "og:description", content: "VIBA-TEAM ajánlat tételei, kapcsolattartója és feltételei." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: QuotePrint,
});

function QuotePrint() {
  const { id } = Route.useParams();
  return <QuotePrintDocument id={id} />;
}
