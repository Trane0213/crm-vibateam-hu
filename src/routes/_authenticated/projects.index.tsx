import { createFileRoute, Link } from "@tanstack/react-router";
import { Briefcase } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  ResourcePage,
  fmtDate,
  useLookup,
} from "@/components/resource/resource-page";

const PROJECT_STATUS = [
  { value: "lead", label: "Lead" },
  { value: "quoting", label: "Ajánlat alatt" },
  { value: "negotiation", label: "Tárgyalás" },
  { value: "won", label: "Megnyert" },
  { value: "in_progress", label: "Folyamatban" },
  { value: "completed", label: "Befejezve" },
  { value: "lost", label: "Elveszett" },
];

const STATUS_TONE: Record<string, string> = {
  lead: "bg-[color:var(--status-info)]/15 text-[color:var(--status-info)] border-[color:var(--status-info)]/30",
  quoting: "bg-primary/10 text-primary border-primary/30",
  negotiation: "bg-[color:var(--status-warning)]/15 text-[color:var(--status-warning)] border-[color:var(--status-warning)]/30",
  won: "bg-[color:var(--status-success)]/15 text-[color:var(--status-success)] border-[color:var(--status-success)]/30",
  in_progress: "bg-primary/10 text-primary border-primary/30",
  completed: "bg-muted text-muted-foreground border-border",
  lost: "bg-destructive/10 text-destructive border-destructive/30",
};

function ProjectsPage() {
  const companyLabel = useLookup("companies", "name");
  return (
    <ResourcePage
      title="Projektek"
      description="A rendszer központja — minden projekt köré épül: ügyfél, ajánlatok, dokumentumok, kommunikáció."
      icon={Briefcase}
      table="projects"
      fields={[
        { name: "title", label: "Projekt megnevezése", type: "text", required: true },
        {
          name: "company_id",
          label: "Ügyfél (cég)",
          type: "ref",
          ref: { table: "companies", labelColumn: "name" },
        },
        {
          name: "lead_id",
          label: "Forrás lead",
          type: "ref",
          ref: { table: "leads", labelColumn: "summary" },
        },
        { name: "status", label: "Státusz", type: "select", options: PROJECT_STATUS, required: true },
        { name: "address", label: "Helyszín / cím", type: "text" },
        { name: "start_date", label: "Kezdés", type: "date" },
        { name: "deadline", label: "Határidő", type: "date" },
        { name: "description", label: "Leírás", type: "textarea" },
      ]}
      columns={[
        {
          key: "title",
          label: "Megnevezés",
          className: "font-medium",
          render: (r) => (
            <Link
              to="/projects/$id"
              params={{ id: r.id }}
              className="text-primary hover:underline"
            >
              {r.title}
            </Link>
          ),
        },
        { key: "company", label: "Ügyfél", render: (r) => companyLabel(r.company_id) },
        {
          key: "status",
          label: "Státusz",
          render: (r) => (
            <Badge variant="outline" className={STATUS_TONE[r.status] ?? ""}>
              {PROJECT_STATUS.find((o) => o.value === r.status)?.label ?? r.status ?? "—"}
            </Badge>
          ),
        },
        { key: "address", label: "Helyszín", className: "text-muted-foreground" },
        {
          key: "deadline",
          label: "Határidő",
          render: (r) => fmtDate(r.deadline),
        },
        {
          key: "created_at",
          label: "Létrejött",
          className: "text-muted-foreground",
          render: (r) => fmtDate(r.created_at),
        },
      ]}
    />
  );
}

export const Route = createFileRoute("/_authenticated/projects/")({
  component: ProjectsPage,
});