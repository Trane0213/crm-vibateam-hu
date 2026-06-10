import { createFileRoute } from "@tanstack/react-router";
import { Calendar, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, EmptyState } from "@/components/page-header";

export const Route = createFileRoute("/_authenticated/meetings")({
  component: () => (
    <div className="flex flex-col">
      <PageHeader title="Találkozók" description="Helyszíni felmérés, prezentáció, szerződéskötés." actions={<Button size="sm" disabled><Plus className="mr-1 h-4 w-4" />Új találkozó</Button>} />
      <div className="p-6"><EmptyState icon={Calendar} title="Nincs ütemezett találkozó" description="TODO: backend — meetings tábla + naptár nézet." /></div>
    </div>
  ),
});