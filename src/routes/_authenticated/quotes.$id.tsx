import { createFileRoute } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";

export const Route = createFileRoute("/_authenticated/quotes/$id")({
  component: () => {
    const { id } = Route.useParams();
    return (
      <div className="flex flex-col">
        <PageHeader title={`Ajánlat #${id}`} description="Tételek, státusz-történet, kiküldés, follow-up." />
        <div className="p-6"><EmptyState icon={FileText} title="Ajánlat adatlap" description="TODO: backend — quote + quote_items kapcsolódó projekttel." /></div>
      </div>
    );
  },
});