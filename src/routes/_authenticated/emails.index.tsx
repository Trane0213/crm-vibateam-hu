import { createFileRoute } from "@tanstack/react-router";
import { Mail } from "lucide-react";
import { ResourcePage, fmtDateTime, useLookup } from "@/components/resource/resource-page";

function EmailsPage() {
  const projectLabel = useLookup("projects", "title");
  const companyLabel = useLookup("companies", "name");
  return (
    <ResourcePage
      title="Emailek"
      description="Bejövő/kimenő üzenetek projektekhez kötve. (Gmail szinkron: következő fázis.)"
      icon={Mail}
      table="emails"
      order="created_at"
      ascending={false}
      fields={[
        { name: "subject", label: "Tárgy", type: "text", required: true },
        { name: "from_address", label: "Feladó", type: "text" },
        { name: "to_address", label: "Címzett", type: "text" },
        { name: "direction", label: "Irány", type: "select", options: [
          { value: "inbound", label: "Bejövő" },
          { value: "outbound", label: "Kimenő" },
        ]},
        { name: "project_id", label: "Projekt", type: "ref", ref: { table: "projects", labelColumn: "title" } },
        { name: "company_id", label: "Cég", type: "ref", ref: { table: "companies", labelColumn: "name" } },
        { name: "body", label: "Tartalom", type: "textarea" },
      ]}
      columns={[
        { key: "subject", label: "Tárgy", className: "font-medium max-w-[320px] truncate" },
        { key: "direction", label: "Irány" },
        { key: "from_address", label: "Feladó", className: "text-muted-foreground" },
        { key: "project", label: "Projekt", render: (r) => projectLabel(r.project_id) },
        { key: "company", label: "Cég", render: (r) => companyLabel(r.company_id) },
        { key: "created_at", label: "Időpont", render: (r) => fmtDateTime(r.created_at) },
      ]}
    />
  );
}

export const Route = createFileRoute("/_authenticated/emails/")({
  component: EmailsPage,
});