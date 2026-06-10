import { createFileRoute } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";

export const Route = createFileRoute("/_authenticated/leads/$id")({
  component: () => {
    const { id } = Route.useParams();
    return (
      <div className="flex flex-col">
        <PageHeader title={`Lead #${id}`} />
        <div className="p-6"><EmptyState icon={Sparkles} title="Lead adatlap" description="TODO: backend." /></div>
      </div>
    );
  },
});