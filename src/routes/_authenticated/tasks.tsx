import { createFileRoute } from "@tanstack/react-router";
import { ListChecks, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, EmptyState } from "@/components/page-header";

export const Route = createFileRoute("/_authenticated/tasks")({
  component: () => (
    <div className="flex flex-col">
      <PageHeader title="Feladatok" description="Napi teendők projektenként és felelősönként." actions={<Button size="sm" disabled><Plus className="mr-1 h-4 w-4" />Új feladat</Button>} />
      <div className="p-6"><EmptyState icon={ListChecks} title="Nincs feladat" description="TODO: backend — tasks tábla." /></div>
    </div>
  ),
});