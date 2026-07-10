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
          Michael a Google Ads specialista agent. M3 állapot: kapcsolat, VIBA Ads Constitution,
          SAFE READ toolok, számított baseline és change history. Az itt felvett HARD szabályok
          minden Michael-futásba automatikusan bekerülnek. Write toolok és Dry Run az M5–M6-ban.
        </p>
      </div>
      <GoogleAdsConnectCard />
      <GoogleAdsDiagnosticsCard />
      <GoogleAdsConstitutionEditor />
    </div>
  );
}