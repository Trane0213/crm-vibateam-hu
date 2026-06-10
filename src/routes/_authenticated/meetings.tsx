import { createFileRoute } from "@tanstack/react-router";
import { Calendar } from "lucide-react";
import { ResourcePage, fmtDateTime, useLookup } from "@/components/resource/resource-page";

function MeetingsPage() {
  const projectLabel = useLookup("projects", "title");
  const companyLabel = useLookup("companies", "name");
  return (
    <ResourcePage
      title="Találkozók"
      description="Helyszíni felmérés, prezentáció, szerződéskötés."
      icon={Calendar}
      table="meetings"
      order="start_at"
      ascending={true}
      fields={[
        { name: "title", label: "Megnevezés", type: "text", required: true },
        { name: "start_at", label: "Kezdés", type: "datetime", required: true },
        { name: "end_at", label: "Vége", type: "datetime" },
        { name: "location", label: "Helyszín", type: "text" },
        { name: "project_id", label: "Projekt", type: "ref", ref: { table: "projects", labelColumn: "title" } },
        { name: "company_id", label: "Cég", type: "ref", ref: { table: "companies", labelColumn: "name" } },
        { name: "notes", label: "Jegyzet", type: "textarea" },
      ]}
      columns={[
        { key: "start_at", label: "Kezdés", className: "font-medium tabular-nums", render: (r) => fmtDateTime(r.start_at) },
        { key: "title", label: "Megnevezés" },
        { key: "location", label: "Helyszín", className: "text-muted-foreground" },
        { key: "project", label: "Projekt", render: (r) => projectLabel(r.project_id) },
        { key: "company", label: "Cég", render: (r) => companyLabel(r.company_id) },
      ]}
    />
  );
}

export const Route = createFileRoute("/_authenticated/meetings")({
  component: MeetingsPage,
});