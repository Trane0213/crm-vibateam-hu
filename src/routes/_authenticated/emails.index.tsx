import { createFileRoute } from "@tanstack/react-router";
import { Mail } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { ResourcePage, fmtDateTime, useLookup } from "@/components/resource/resource-page";

function EmailsPage() {
  const projectLabel = useLookup("projects", "title");
  const contactLabel = useLookup("contacts", "name");
  return (
    <ResourcePage
      title="Emailek"
      description="Email üzenetek és szálak. (Gmail szinkron: következő fázis.)"
      icon={Mail}
      table="emails"
      order="created_at"
      ascending={false}
      fields={[
        { name: "subject", label: "Tárgy", type: "text" },
        { name: "from_email", label: "Feladó", type: "text" },
        { name: "to_email", label: "Címzett", type: "text" },
        {
          name: "project_id",
          label: "Projekt",
          type: "ref",
          ref: { table: "projects", labelColumn: "title" },
        },
        {
          name: "contact_id",
          label: "Kapcsolattartó",
          type: "ref",
          ref: { table: "contacts", labelColumn: "name" },
        },
        { name: "thread_id", label: "Szál azonosító", type: "text" },
        { name: "summary", label: "Összefoglaló", type: "text" },
        { name: "body", label: "Tartalom", type: "textarea" },
      ]}
      columns={[
        {
          key: "subject",
          label: "Tárgy",
          className: "font-medium max-w-[360px] truncate",
          render: (r) => {
            const label = r.subject ?? r.summary ?? "(nincs tárgy)";
            return r.thread_id ? (
              <Link to="/emails/$threadId" params={{ threadId: r.thread_id }} className="text-primary hover:underline">
                {label}
              </Link>
            ) : label;
          },
        },
        { key: "from_email", label: "Feladó", className: "text-muted-foreground" },
        { key: "to_email", label: "Címzett", className: "text-muted-foreground" },
        { key: "project", label: "Projekt", render: (r) => projectLabel(r.project_id) },
        { key: "contact", label: "Kapcsolattartó", render: (r) => contactLabel(r.contact_id) },
        { key: "created_at", label: "Időpont", render: (r) => fmtDateTime(r.created_at) },
      ]}
    />
  );
}

export const Route = createFileRoute("/_authenticated/emails/")({
  component: EmailsPage,
});