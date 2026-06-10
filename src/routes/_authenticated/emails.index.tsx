import { createFileRoute } from "@tanstack/react-router";
import { Mail } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { ResourcePage, fmtDateTime } from "@/components/resource/resource-page";

function EmailsPage() {
  return (
    <ResourcePage
      title="Emailek"
      description="Email üzenetek és szálak. (Gmail szinkron: következő fázis.)"
      icon={Mail}
      table="emails"
      order="created_at"
      ascending={false}
      fields={[
        { name: "from_email", label: "Feladó", type: "text" },
        { name: "to_email", label: "Címzett", type: "text" },
        { name: "thread_id", label: "Szál azonosító", type: "text" },
        { name: "summary", label: "Összefoglaló", type: "text" },
        { name: "body", label: "Tartalom", type: "textarea" },
      ]}
      columns={[
        {
          key: "summary",
          label: "Tárgy",
          className: "font-medium max-w-[360px] truncate",
          render: (r) =>
            r.thread_id ? (
              <Link to="/emails/$threadId" params={{ threadId: r.thread_id }} className="text-primary hover:underline">
                {r.summary ?? "(nincs tárgy)"}
              </Link>
            ) : (r.summary ?? "—"),
        },
        { key: "from_email", label: "Feladó", className: "text-muted-foreground" },
        { key: "to_email", label: "Címzett", className: "text-muted-foreground" },
        { key: "created_at", label: "Időpont", render: (r) => fmtDateTime(r.created_at) },
      ]}
    />
  );
}

export const Route = createFileRoute("/_authenticated/emails/")({
  component: EmailsPage,
});