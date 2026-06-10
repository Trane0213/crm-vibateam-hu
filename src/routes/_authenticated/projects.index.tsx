import { createFileRoute, Link } from "@tanstack/react-router";
import { Briefcase, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, EmptyState } from "@/components/page-header";

export const Route = createFileRoute("/_authenticated/projects/")({
  component: ProjectsIndex,
});

function ProjectsIndex() {
  return (
    <div className="flex flex-col">
      <PageHeader
        title="Projektek"
        description="A rendszer központja — minden projekt köré épül: ügyfél, ajánlatok, dokumentumok, kommunikáció."
        actions={<Button size="sm" disabled><Plus className="mr-1 h-4 w-4" />Új projekt</Button>}
      />
      <div className="p-6">
        <EmptyState
          icon={Briefcase}
          title="Még nincs projekt"
          description="A projects tábla bekötése után pipeline kanban és lista jelenik meg."
          action={
            <Link to="/projects/$id" params={{ id: "demo" }} className="text-xs text-primary hover:underline">
              Demo projekt adatlap megtekintése →
            </Link>
          }
        />
      </div>
    </div>
  );
}