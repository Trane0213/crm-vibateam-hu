import { createFileRoute } from "@tanstack/react-router";
import { Mail } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";

export const Route = createFileRoute("/_authenticated/emails/$threadId")({
  component: () => {
    const { threadId } = Route.useParams();
    return (
      <div className="flex flex-col">
        <PageHeader title={`Email szál #${threadId}`} />
        <div className="p-6"><EmptyState icon={Mail} title="Szál nézet" description="TODO: backend." /></div>
      </div>
    );
  },
});