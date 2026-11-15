import { createFileRoute } from "@tanstack/react-router";
import { EmailThreadView } from "@/components/emails/email-thread-view";

export const Route = createFileRoute("/_authenticated/emails/$threadId")({
  validateSearch: (search: Record<string, unknown>): { mailbox?: string } => ({ mailbox: typeof search.mailbox === "string" ? search.mailbox : undefined }),
  head: () => ({ meta: [
    { title: "Levélszál | VIBA CRM" }, { name: "description", content: "Ügyféllevelezések és CRM-kapcsolatok a VIBA CRM-ben." },
    { property: "og:title", content: "Levélszál | VIBA CRM" }, { property: "og:description", content: "VIBA ügyféllevelezés és kapcsolódó adatok." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: EmailThreadRoute,
});

function EmailThreadRoute() {
  const { threadId } = Route.useParams();
  const { mailbox } = Route.useSearch();
  return <EmailThreadView threadId={threadId} mailbox={mailbox} />;
}
