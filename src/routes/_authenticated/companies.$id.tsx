import { createFileRoute } from "@tanstack/react-router";
import { Building2 } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";

export const Route = createFileRoute("/_authenticated/companies/$id")({
  component: () => {
    const { id } = Route.useParams();
    return (
      <div className="flex flex-col">
        <PageHeader title={`Cég #${id}`} />
        <div className="p-6"><EmptyState icon={Building2} title="Cég adatlap" description="TODO: backend." /></div>
      </div>
    );
  },
});