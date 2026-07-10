import { createFileRoute } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { GoogleAdsConnectCard } from "@/components/integrations/google-ads-connect-card";
import { GoogleAdsConstitutionEditor } from "@/components/integrations/google-ads-constitution-editor";
import { GoogleAdsDiagnosticsCard } from "@/components/integrations/google-ads-diagnostics-card";
import { usePermissions } from "@/hooks/use-permissions";

export const Route = createFileRoute("/_authenticated/settings/google-ads")({
  component: GoogleAdsSettingsPage,
});

function GoogleAdsSettingsPage() {
  const { role } = usePermissions();
  if (role !== "owner") {
    return (
      <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-4">
        <Lock className="mt-0.5 h-4 w-4 text-muted-foreground" />
        <div>
          <div className="font-medium">Csak Tulajdonos szerkesztheti</div>
          <p className="mt-1 text-sm text-muted-foreground">
            A Google Ads kapcsolat és a VIBA Ads Constitution kizárólag „owner" szerepkörrel érhető el.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Google Ads — Michael</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Michael a Google Ads specialista agent. M1 állapot: kapcsolat + alkotmány. A tényleges
          adat-lekérdezés, elemzés és javaslatok a következő sprintekben kapcsolódnak be (M2–M6).
        </p>
      </div>
      <GoogleAdsConnectCard />
      <GoogleAdsDiagnosticsCard />
      <GoogleAdsConstitutionEditor />
    </div>
  );
}