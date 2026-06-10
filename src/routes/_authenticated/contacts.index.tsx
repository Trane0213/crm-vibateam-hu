import { createFileRoute } from "@tanstack/react-router";
import { UserPlus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, EmptyState } from "@/components/page-header";

export const Route = createFileRoute("/_authenticated/contacts/")({
  component: () => (
    <div className="flex flex-col">
      <PageHeader title="Kapcsolattartók" actions={<Button size="sm" disabled><Plus className="mr-1 h-4 w-4" />Új kapcsolat</Button>} />
      <div className="p-6"><EmptyState icon={UserPlus} title="Még nincs kapcsolattartó" description="TODO: backend — contacts tábla." /></div>
    </div>
  ),
});