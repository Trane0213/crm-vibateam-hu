import { createFileRoute } from "@tanstack/react-router";
import { BellRing } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/followups")({
  component: () => (
    <div className="flex flex-col">
      <PageHeader title="Follow-up" description="Lejárt, ma esedékes és közelgő utánkövetések — Excel-szerű inline szerkesztéssel." />
      <div className="p-6">
        <Tabs defaultValue="overdue">
          <TabsList>
            <TabsTrigger value="overdue" className="text-destructive">Lejárt</TabsTrigger>
            <TabsTrigger value="today">Ma</TabsTrigger>
            <TabsTrigger value="week">7 napon belül</TabsTrigger>
            <TabsTrigger value="all">Összes nyitott</TabsTrigger>
          </TabsList>
          {["overdue","today","week","all"].map(v => (
            <TabsContent key={v} value={v} className="mt-4">
              <EmptyState icon={BellRing} title="Nincs adat" description="TODO: backend — followups tábla." />
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  ),
});