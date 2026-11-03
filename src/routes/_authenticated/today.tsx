import { createFileRoute } from "@tanstack/react-router";
import { usePermissions } from "@/hooks/use-permissions";
import { OwnerHome } from "@/components/today/owner-home";
import { SalesHome } from "@/components/today/sales-home";
import { MarketingHome } from "@/components/today/marketing-home";
import { PmHome } from "@/components/today/pm-home";

export const Route = createFileRoute("/_authenticated/today")({
  head: () => ({ meta: [
    { title: "Ma – napi áttekintés | VIBA CRM" },
    { name: "description", content: "Saját napi teendők és vezetői csapatáttekintés a VIBA CRM-ben." },
    { property: "og:title", content: "Ma – napi áttekintés | VIBA CRM" },
    { property: "og:description", content: "Aktuális ügyek és határidők budapesti nap szerint." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: TodayPage,
});

function TodayPage() {
  const { role, isLoading } = usePermissions();

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
        Betöltés…
      </div>
    );
  }

  switch (role) {
    case "owner":           return <OwnerHome />;
    case "sales":           return <SalesHome />;
    case "marketing":       return <MarketingHome />;
    case "project_manager": return <PmHome />;
    default:                return <OwnerHome />;
  }
}