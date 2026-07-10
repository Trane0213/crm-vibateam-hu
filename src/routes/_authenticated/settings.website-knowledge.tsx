import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Lock, Globe, RefreshCw } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/use-permissions";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { CrawlRunStatus, CrawlTrigger } from "@/lib/website-knowledge/types";

export const Route = createFileRoute("/_authenticated/settings/website-knowledge")({
  component: WebsiteKnowledgeSettingsPage,
});

type CrawlRunListRow = {
  id: string;
  trigger: CrawlTrigger;
  status: CrawlRunStatus;
  netlify_deploy_id: string | null;
  netlify_site_id: string | null;
  started_at: string;
  finished_at: string | null;
  pages_crawled: number;
  pages_updated: number;
  pages_skipped: number;
  pages_failed: number;
  ai_jobs_total: number;
  ai_cost_usd: number;
  error_message: string | null;
};

function statusVariant(
  status: CrawlRunStatus,
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "success":
      return "default";
    case "failed":
      return "destructive";
    case "pending":
    case "running":
      return "secondary";
    default:
      return "outline";
  }
}

function fmt(ts: string | null): string {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString("hu-HU");
  } catch {
    return ts;
  }
}

function WebsiteKnowledgeSettingsPage() {
  const { role } = usePermissions();

  if (role !== "owner") {
    return (
      <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-4">
        <Lock className="mt-0.5 h-4 w-4 text-muted-foreground" />
        <div>
          <div className="font-medium">Csak Tulajdonos szerkesztheti</div>
          <p className="mt-1 text-sm text-muted-foreground">
            A Website Knowledge nézet kizárólag „owner" szerepkörrel érhető el.
          </p>
        </div>
      </div>
    );
  }

  return <WebsiteKnowledgeContent />;
}

function WebsiteKnowledgeContent() {
  const runsQ = useQuery({
    queryKey: ["website_crawl_runs", "recent"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("website_crawl_runs")
        .select(
          "id, trigger, status, netlify_deploy_id, netlify_site_id, started_at, finished_at, pages_crawled, pages_updated, pages_skipped, pages_failed, ai_jobs_total, ai_cost_usd, error_message",
        )
        .order("started_at", { ascending: false })
        .limit(50);
      if (error) throw new Error(error.message);
      return (data ?? []) as CrawlRunListRow[];
    },
  });

  const runs = useMemo(() => runsQ.data ?? [], [runsQ.data]);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <Globe className="h-5 w-5" />
          <h2 className="text-lg font-semibold">Website Knowledge</h2>
          <Badge variant="outline">WK-1 · csontváz</Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          A vibateam.hu Netlify deploy webhookjai itt landolnak. Ez a
          sprint csak a run-audit sort írja — a tényleges crawl, AI-összefoglaló
          és Knowledge Graph publikáció a következő sprintekben (WK-2 → WK-4)
          kerül élesítésre.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Crawl runs</CardTitle>
            <CardDescription>
              Utolsó 50 futás a{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                website_crawl_runs
              </code>{" "}
              táblából.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => runsQ.refetch()}
            disabled={runsQ.isFetching}
          >
            <RefreshCw
              className={`mr-2 h-3.5 w-3.5 ${runsQ.isFetching ? "animate-spin" : ""}`}
            />
            Frissítés
          </Button>
        </CardHeader>
        <CardContent>
          {runsQ.isLoading ? (
            <div className="text-sm text-muted-foreground">Betöltés…</div>
          ) : runsQ.isError ? (
            <div className="text-sm text-destructive">
              Hiba: {(runsQ.error as Error).message}
            </div>
          ) : runs.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              Még nincs futás. Az első Netlify deploy után jelennek meg itt a
              webhook által készített run rekordok.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Started</th>
                    <th className="py-2 pr-3 font-medium">Trigger</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                    <th className="py-2 pr-3 font-medium">Netlify deploy</th>
                    <th className="py-2 pr-3 font-medium">Pages</th>
                    <th className="py-2 pr-3 font-medium">AI jobs</th>
                    <th className="py-2 pr-3 font-medium">Cost (USD)</th>
                    <th className="py-2 pr-3 font-medium">Finished</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r.id} className="border-b last:border-b-0">
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {fmt(r.started_at)}
                      </td>
                      <td className="py-2 pr-3">
                        <Badge variant="outline" className="font-mono text-[10px]">
                          {r.trigger}
                        </Badge>
                      </td>
                      <td className="py-2 pr-3">
                        <Badge variant={statusVariant(r.status)}>
                          {r.status}
                        </Badge>
                        {r.error_message && (
                          <div
                            className="mt-1 text-[11px] text-destructive"
                            title={r.error_message}
                          >
                            {r.error_message.slice(0, 80)}
                            {r.error_message.length > 80 ? "…" : ""}
                          </div>
                        )}
                      </td>
                      <td className="py-2 pr-3 font-mono text-xs">
                        {r.netlify_deploy_id ?? "—"}
                      </td>
                      <td className="py-2 pr-3 text-xs tabular-nums">
                        {r.pages_crawled} / +{r.pages_updated} / ↷{r.pages_skipped}
                        {r.pages_failed > 0 && (
                          <span className="ml-1 text-destructive">
                            !{r.pages_failed}
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3 tabular-nums">
                        {r.ai_jobs_total}
                      </td>
                      <td className="py-2 pr-3 tabular-nums">
                        {Number(r.ai_cost_usd ?? 0).toFixed(4)}
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap text-muted-foreground">
                        {fmt(r.finished_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Következő sprintek</CardTitle>
          <CardDescription>Ezek a szekciók a következő sprintekben jelennek meg.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1 text-sm text-muted-foreground">
            <li>WK-2 · Page-lista, verzió- és diff nézet, media-metaadat.</li>
            <li>WK-3 · Summary preview, entity browser, AI run breakdown.</li>
            <li>WK-4 · Utolsó KG publikáció mini-státusz.</li>
            <li>WK-5 · Manuális refresh (page / batch / entire).</li>
            <li>WK-6 · Website AI OS toolok agent-hozzáférése.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}