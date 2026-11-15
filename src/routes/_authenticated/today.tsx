import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useWorkspaceV2 } from "@/hooks/use-workspace-v2";
import { canAccessRoute } from "@/lib/permissions";
import { usePermissions } from "@/hooks/use-permissions";
import { OwnerHome } from "@/components/today/owner-home";
import { SalesHome } from "@/components/today/sales-home";
import { MarketingHome } from "@/components/today/marketing-home";
import { PmHome } from "@/components/today/pm-home";
import { ownerLaneFromSearch, type OwnerLane } from "@/lib/owner/owner-day-flow";

export const Route = createFileRoute("/_authenticated/today")({
  // `lane`: csak a tulajdonosi teendőlista szűrője (mélylink); más szerepkör figyelmen kívül hagyja.
  validateSearch: (s: Record<string, unknown>): { lane?: OwnerLane } => {
    const lane = ownerLaneFromSearch(s.lane);
    return lane ? { lane } : {};
  },
  head: () => ({ meta: [
    { title: "Ma – napi áttekintés | VIBA CRM" },
    { name: "description", content: "Saját napi teendők és vezetői napi munka a VIBA CRM-ben." },
    { property: "og:title", content: "Ma – napi áttekintés | VIBA CRM" },
    { property: "og:description", content: "Aktuális ügyek és határidők budapesti nap szerint." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: TodayPage,
});

function TodayPage() {
  const { role, isLoading } = usePermissions();
  const { lane } = Route.useSearch();
  const navigate = Route.useNavigate();
  // Aki az új munkaterületet választotta, annak a kezdőlapja az (a régi CRM-be a munkaterület „Régi CRM” gombja visz vissza).
  const { enabled: workspaceV2 } = useWorkspaceV2();

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
        Betöltés…
      </div>
    );
  }

  if (workspaceV2 && role !== "owner" && canAccessRoute(role, "/munka")) return <Navigate to="/munka" replace />;

  switch (role) {
    case "owner":           return <OwnerHome lane={lane} onLane={(l) => void navigate({ search: l ? { lane: l } : {}, replace: true })} />;
    case "sales":           return <SalesHome />;
    case "marketing":       return <MarketingHome />;
    case "project_manager": return <PmHome />;
    default:                return <OwnerHome />;
  }
}
