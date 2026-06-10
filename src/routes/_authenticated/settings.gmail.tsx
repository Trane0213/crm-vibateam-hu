import { createFileRoute } from "@tanstack/react-router";
import { GmailConnectCard } from "@/components/integrations/gmail-connect-card";

export const Route = createFileRoute("/_authenticated/settings/gmail")({
  component: () => (
    <div className="space-y-3">
      <GmailConnectCard />
    </div>
  ),
});