import { createFileRoute } from "@tanstack/react-router";
import { campaignEntrySearch } from "@/lib/marketing/campaign-entry";
import { CampaignListWorkspace } from "@/components/marketing/campaign-list-workspace";

export const Route = createFileRoute("/_authenticated/campaign-list")({
  validateSearch: campaignEntrySearch,
  head: () => ({
    meta: [
      { title: "Kampánylista | VIBA CRM" },
      { name: "description", content: "Kijelölt marketingkampány és kereshető CRM-cégek." },
      { property: "og:title", content: "Kampánylista | VIBA CRM" },
      { property: "og:description", content: "Marketingcégek és kapcsolattartók a VIBA CRM-ben." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CampaignListRoute,
});

function CampaignListRoute() {
  return <CampaignListWorkspace entry={Route.useSearch()} />;
}
