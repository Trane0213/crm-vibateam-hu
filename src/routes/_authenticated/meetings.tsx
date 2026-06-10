import { createFileRoute } from "@tanstack/react-router";
import { Calendar } from "lucide-react";
import { ResourcePage, fmtDateTime, useLookup } from "@/components/resource/resource-page";

function MeetingsPage() {
  const projectLabel = useLookup("projects", "title");
  const companyLabel = useLookup("companies", "name");
  return (
    <ResourcePage
      title="Találkozók"
      description="Itt kezelheted a helyszíni egyeztetéseket és személyes találkozókat."
      emptyTitle="Itt kezelheted a helyszíni egyeztetéseket."
      emptyDescription={`Még nincs rögzített találkozó. A „Új találkozó” gombbal vehetsz fel helyszíni felmérést, prezentációt vagy szerződéskötést.`}
      newButtonLabel="Új találkozó"
      icon={Calendar}
      table="meetings"
      order="meeting_date"
      ascending={true}
      fields={[
        { name: "title", label: "Megnevezés", type: "text", required: true },
        { name: "meeting_date", label: "Időpont", type: "datetime", required: true },
        { name: "location", label: "Helyszín", type: "text" },
        { name: "project_id", label: "Projekt", type: "ref", ref: { table: "projects", labelColumn: "title" } },
        { name: "company_id", label: "Cég", type: "ref", ref: { table: "companies", labelColumn: "name" } },
        { name: "summary", label: "Összefoglaló / jegyzet", type: "textarea" },
      ]}
      columns={[
        { key: "meeting_date", label: "Időpont", className: "font-medium tabular-nums", render: (r) => fmtDateTime(r.meeting_date) },
        { key: "title", label: "Megnevezés" },
        { key: "location", label: "Helyszín", className: "text-muted-foreground" },
        { key: "project", label: "Projekt", render: (r) => projectLabel(r.project_id) },
        { key: "company", label: "Cég", render: (r) => companyLabel(r.company_id) },
        { key: "summary", label: "Jegyzet", className: "text-muted-foreground max-w-[260px] truncate" },
      ]}
    />
  );
}

export const Route = createFileRoute("/_authenticated/meetings")({
  component: MeetingsPage,
});