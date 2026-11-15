import { createFileRoute } from "@tanstack/react-router";
import { campaignEntrySearch } from "@/lib/marketing/campaign-entry";
import { CampaignListWorkspace } from "@/components/marketing/campaign-list-workspace";
import { CaseAssistant } from "@/components/workspace-v2/parts";
import { caseAssistantPrompts } from "@/lib/workspace-v2/case-assistant";
import { wsHead } from "@/lib/workspace-v2/head";

export const Route = createFileRoute("/_authenticated/munka/marketing/kampany")({
  validateSearch: campaignEntrySearch,
  head: () => wsHead("Kampány szerkesztése", "Címzettek, üzenet, ellenőrzés, TESZT-küldés és ütemezés jóváhagyással."),
  component: CampaignCase,
});

/** A meglévő, jóváhagyásos kampányszerkesztő az új kereten belül. */
function CampaignCase() {
  const entry = Route.useSearch();
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0 overflow-hidden rounded-xl border bg-card shadow-[var(--shadow-card)]"><CampaignListWorkspace entry={entry} /></div>
      <div><CaseAssistant agent="marketing" prompts={caseAssistantPrompts("marketing", "campaign", { id: entry.campaignId ?? "kijelölt" })} /></div>
    </div>
  );
}
