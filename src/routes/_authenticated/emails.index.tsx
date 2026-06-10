import { createFileRoute } from "@tanstack/react-router";
import { Mail } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PageHeader, EmptyState } from "@/components/page-header";

export const Route = createFileRoute("/_authenticated/emails/")({
  component: () => (
    <div className="flex flex-col">
      <PageHeader title="Emailek" description="Bejövő/kimenő üzenetek projektekhez rendelve." actions={<Badge variant="secondary">Gmail integráció hamarosan</Badge>} />
      <div className="p-6"><EmptyState icon={Mail} title="Még nincs email" description="TODO: backend — emails / email_threads + Gmail OAuth." /></div>
    </div>
  ),
});