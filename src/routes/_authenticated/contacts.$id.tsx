import { createFileRoute } from "@tanstack/react-router";
import { UserPlus } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";

export const Route = createFileRoute("/_authenticated/contacts/$id")({
  component: () => {
    const { id } = Route.useParams();
    return (
      <div className="flex flex-col">
        <PageHeader title={`Kapcsolattartó #${id}`} />
        <div className="p-6"><EmptyState icon={UserPlus} title="Kapcsolattartó adatlap" description="TODO: backend." /></div>
      </div>
    );
  },
});