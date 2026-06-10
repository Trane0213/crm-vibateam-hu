import { createFileRoute } from "@tanstack/react-router";
import { Phone } from "lucide-react";
import { ResourcePage, fmtDateTime, useLookup } from "@/components/resource/resource-page";

function CallsPage() {
  const projectLabel = useLookup("projects", "title");
  const contactLabel = useLookup("contacts", "full_name");
  return (
    <ResourcePage
      title="Hívások"
      description="Telefonbeszélgetések projektekhez és kapcsolattartókhoz kötve."
      icon={Phone}
      table="phone_calls"
      order="created_at"
      ascending={false}
      fields={[
        { name: "direction", label: "Irány", type: "select", options: [
          { value: "inbound", label: "Bejövő" },
          { value: "outbound", label: "Kimenő" },
        ]},
        { name: "phone_number", label: "Telefonszám", type: "text" },
        { name: "duration_seconds", label: "Időtartam (mp)", type: "number" },
        { name: "project_id", label: "Projekt", type: "ref", ref: { table: "projects", labelColumn: "title" } },
        { name: "contact_id", label: "Kapcsolattartó", type: "ref", ref: { table: "contacts", labelColumn: "full_name" } },
        { name: "notes", label: "Jegyzet", type: "textarea" },
      ]}
      columns={[
        { key: "created_at", label: "Időpont", className: "tabular-nums", render: (r) => fmtDateTime(r.created_at) },
        { key: "direction", label: "Irány" },
        { key: "phone_number", label: "Szám", className: "tabular-nums" },
        { key: "contact", label: "Kapcsolattartó", render: (r) => contactLabel(r.contact_id) },
        { key: "project", label: "Projekt", render: (r) => projectLabel(r.project_id) },
        { key: "notes", label: "Jegyzet", className: "text-muted-foreground max-w-[300px] truncate" },
      ]}
    />
  );
}

export const Route = createFileRoute("/_authenticated/calls")({
  component: CallsPage,
});