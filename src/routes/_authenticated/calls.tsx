import { createFileRoute } from "@tanstack/react-router";
import { Phone, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, EmptyState } from "@/components/page-header";

export const Route = createFileRoute("/_authenticated/calls")({
  component: () => (
    <div className="flex flex-col">
      <PageHeader title="Hívások" description="Telefonbeszélgetések projektekhez kötve." actions={<Button size="sm" disabled><Plus className="mr-1 h-4 w-4" />Új hívás</Button>} />
      <div className="p-6"><EmptyState icon={Phone} title="Nincs hívás" description="TODO: backend — phone_calls tábla." /></div>
    </div>
  ),
});