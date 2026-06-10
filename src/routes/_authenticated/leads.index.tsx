import { createFileRoute } from "@tanstack/react-router";
import { Sparkles, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, EmptyState } from "@/components/page-header";

export const Route = createFileRoute("/_authenticated/leads/")({
  component: () => (
    <div className="flex flex-col">
      <PageHeader title="Leadek" description="Új érdeklődők, források, státusz, felelős." actions={<Button size="sm" disabled><Plus className="mr-1 h-4 w-4" />Új lead</Button>} />
      <div className="p-6"><EmptyState icon={Sparkles} title="Még nincs lead" description="TODO: backend — leads tábla." /></div>
    </div>
  ),
});