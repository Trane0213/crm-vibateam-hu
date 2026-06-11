import { createFileRoute } from "@tanstack/react-router";
import { Mail } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { ResourcePage, fmtDateTime, useLookup } from "@/components/resource/resource-page";
import { emailPreview } from "@/components/emails/email-body";

function EmailsPage() {
  const projectLabel = useLookup("projects", "title");
  const contactLabel = useLookup("contacts", "name");
  const threadSubject = useLookup("email_threads", "subject");
  return (
    <ResourcePage
      title="Emailek"
      description="Ügyfél- és projekt-kommunikáció egy helyen."
      icon={Mail}
      table="emails"
      emptyTitle="Itt jelennek meg a projekt-kommunikációk."
      emptyDescription={`Még nincs rögzített email. Az új üzeneteket a jobb felső „Új email” gombbal vehetjük fel, vagy a Gmail-szinkron után automatikusan ide kerülnek.`}
      newButtonLabel="Új email"
      order="created_at"
      ascending={false}
      fields={[
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
          className: "font-medium max-w-[320px]",
          render: (r) => {
            const rawSubject = threadSubject(r.thread_id);
            const subject = rawSubject && rawSubject !== "—" && rawSubject !== "(nincs tárgy)"
              ? rawSubject
              : "(nincs tárgy)";
            const preview = emailPreview(r.body, r.summary, 80);
            const inner = (
              <div className="min-w-0">
                <div className="truncate font-medium">{subject}</div>
                {preview && (
                  <div className="truncate text-xs font-normal text-muted-foreground">{preview}</div>
                )}
              </div>
            );
            return r.thread_id ? (
              <Link to="/emails/$threadId" params={{ threadId: r.thread_id }} className="block text-primary hover:underline">
                {inner}
              </Link>
            ) : inner;
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