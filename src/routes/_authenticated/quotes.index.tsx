import { createFileRoute } from "@tanstack/react-router";
import { FileText, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, EmptyState } from "@/components/page-header";

export const Route = createFileRoute("/_authenticated/quotes/")({
  component: () => (
    <div className="flex flex-col">
      <PageHeader
        title="Ajánlatok"
        description="Az Excel-alapú ajánlatkövetés digitális kiváltása. Státusz, határidő, érték, felelős."
        actions={<Button size="sm" disabled><Plus className="mr-1 h-4 w-4" />Új ajánlat</Button>}
      />
      <div className="p-6">
        <EmptyState icon={FileText} title="Még nincs ajánlat" description="A quotes + quote_items táblák bekötésére vár. Sűrű táblázat, inline szerkesztés, színkódolt státuszok." />
      </div>
    </div>
  ),
});