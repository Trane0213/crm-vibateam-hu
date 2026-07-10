import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Activity, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { runGoogleAdsHealthCheck, type HealthReport } from "@/lib/google-ads/health.functions";
import { toast } from "sonner";

export function GoogleAdsDiagnosticsCard() {
  const run = useServerFn(runGoogleAdsHealthCheck);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<HealthReport | null>(null);

  const onRun = async () => {
    setBusy(true);
    try {
      const r = await run();
      setReport(r);
    } catch (e: any) {
      toast.error("Diagnosztika", { description: e?.message ?? String(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            <CardTitle>Kapcsolat diagnosztika</CardTitle>
          </div>
          <Button onClick={onRun} disabled={busy} variant="outline" size="sm">
            {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
            {busy ? "Ellenőrzés…" : "Ellenőrzés futtatása"}
          </Button>
        </div>
        <CardDescription>
          Végpontok: DB kapcsolat sor → refresh token dekódolás → új access token → Developer Token → Google Ads API
          (`listAccessibleCustomers`). Semmit nem módosít Google oldalán.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {!report && !busy && (
          <p className="text-sm text-muted-foreground">Még nem futott ellenőrzés.</p>
        )}
        {report && (
          <>
            <ul className="space-y-1.5 text-sm">
              {report.checks.map((c) => (
                <li key={c.key} className="flex items-start gap-2">
                  {c.ok ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 text-[color:var(--status-success)]" />
                  ) : (
                    <XCircle className="mt-0.5 h-4 w-4 text-destructive" />
                  )}
                  <div className="min-w-0">
                    <div className={c.ok ? "" : "text-destructive"}>{c.label}</div>
                    {c.detail && (
                      <div className="text-xs text-muted-foreground break-words">{c.detail}</div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <div className="pt-2 text-xs text-muted-foreground">
              Utolsó ellenőrzés: {new Date(report.checked_at).toLocaleString("hu-HU")} —{" "}
              {report.overall_ok ? (
                <span className="text-[color:var(--status-success)]">minden rendben</span>
              ) : (
                <span className="text-destructive">hiba található</span>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}