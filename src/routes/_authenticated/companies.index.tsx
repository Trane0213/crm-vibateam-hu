import { createFileRoute } from "@tanstack/react-router";
import { Building2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, EmptyState } from "@/components/page-header";

export const Route = createFileRoute("/_authenticated/companies/")({
  component: () => (
    <div className="flex flex-col">
      <PageHeader title="Cégek" description="Ügyfelek és potenciális partnerek." actions={<Button size="sm" disabled><Plus className="mr-1 h-4 w-4" />Új cég</Button>} />
      <div className="p-6"><EmptyState icon={Building2} title="Még nincs cég" description="TODO: backend — companies tábla." /></div>
    </div>
  ),
});