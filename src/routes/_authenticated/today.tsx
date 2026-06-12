import { createFileRoute } from "@tanstack/react-router";
import { usePermissions } from "@/hooks/use-permissions";
import { OwnerHome } from "@/components/today/owner-home";
import { SalesHome } from "@/components/today/sales-home";
import { MarketingHome } from "@/components/today/marketing-home";
import { PmHome } from "@/components/today/pm-home";

export const Route = createFileRoute("/_authenticated/today")({
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