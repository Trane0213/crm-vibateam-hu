import { createFileRoute } from "@tanstack/react-router";
import { EmailThreadView } from "@/components/emails/email-thread-view";
import { CaseAssistant } from "@/components/workspace-v2/parts";
import { usePermissions } from "@/hooks/use-permissions";
import { caseAssistantPrompts } from "@/lib/workspace-v2/case-assistant";
import { wsHead } from "@/lib/workspace-v2/head";

export const Route = createFileRoute("/_authenticated/munka/levelezes/$threadId")({
  validateSearch: (s: Record<string, unknown>): { mailbox?: string } => ({ mailbox: typeof s.mailbox === "string" ? s.mailbox : undefined }),
  head: () => wsHead("Levélszál", "Levélszál, válasz és CRM-kapcsolatok."),
  component: ThreadCase,
});

function ThreadCase() {
  const { threadId } = Route.useParams();
  const { mailbox } = Route.useSearch();
  const { role } = usePermissions();
  const agent = role === "marketing" ? "marketing" : "sales";
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0 overflow-hidden rounded-xl border bg-card shadow-[var(--shadow-card)]"><EmailThreadView threadId={threadId} mailbox={mailbox} /></div>
      <div><CaseAssistant agent={agent} prompts={caseAssistantPrompts(agent, "thread", { id: threadId })} /></div>
    </div>
  );
}
