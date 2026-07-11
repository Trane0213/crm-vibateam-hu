import { useMemo } from "react";
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { wkTriggerManualCrawl } from "@/lib/website-knowledge/wk-admin.functions";
import {
  Lock,
  Globe,
  RefreshCw,
  FileText,
  History,
  GitCompare,
  Sparkles,
  Tags,
  Activity,
  Network,
  Play,
} from "lucide-react";

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
import { Input } from "@/components/ui/input";
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
  const [pageSearch, setPageSearch] = useState("");
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [fromVersionId, setFromVersionId] = useState<string | null>(null);
  const [toVersionId, setToVersionId] = useState<string | null>(null);
  const [entitySearch, setEntitySearch] = useState("");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const qc = useQueryClient();
  const triggerFn = useServerFn(wkTriggerManualCrawl);
  const triggerMut = useMutation({
    mutationFn: async () => triggerFn({}),
    onSuccess: (res) => {
      toast.success(
        `Manuális crawl kész — run ${String(res.run_id).slice(0, 8)}… · ${res.status ?? "ok"}`,
      );
      qc.invalidateQueries({ queryKey: ["website_crawl_runs"] });
      qc.invalidateQueries({ queryKey: ["website_pages"] });
    },
    onError: (e) => toast.error(`Crawl hiba: ${(e as Error).message}`),
  });

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

  const pagesQ = useQuery({
    queryKey: ["website_pages", "list", pageSearch],
    queryFn: async () => {
      let q = supabase
        .from("website_pages")
        .select(
          "id, url, path, title, asset_kind, is_active, last_crawled_at, last_seen_at, current_version_id",
        )
        .order("last_crawled_at", { ascending: false, nullsFirst: false })
        .limit(200);
      if (pageSearch.trim().length > 0) {
        const term = `%${pageSearch.trim()}%`;
        q = q.or(`url.ilike.${term},title.ilike.${term},path.ilike.${term}`);
      }
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const historyQ = useQuery({
    queryKey: ["website_page_history", selectedPageId],
    enabled: !!selectedPageId,
    queryFn: async () => {
      const { data: versions, error } = await supabase
        .from("website_page_versions")
        .select("id, version_number, content_hash, http_status, byte_size, fetched_at, run_id")
        .eq("page_id", selectedPageId!)
        .order("version_number", { ascending: false })
        .limit(50);
      if (error) throw new Error(error.message);
      return (versions ?? []) as Array<{
        id: string;
        version_number: number;
        content_hash: string;
        http_status: number | null;
        byte_size: number | null;
        fetched_at: string;
        run_id: string | null;
      }>;
    },
  });

  const diffQ = useQuery({
    queryKey: ["website_page_diff", fromVersionId, toVersionId],
    enabled: !!toVersionId,
    queryFn: async () => {
      const ids = [toVersionId!];
      if (fromVersionId) ids.push(fromVersionId);
      const { data, error } = await supabase
        .from("website_page_versions")
        .select("id, version_number, rendered_text")
        .in("id", ids);
      if (error) throw new Error(error.message);
      type V = { id: string; version_number: number; rendered_text: string | null };
      const list = (data ?? []) as V[];
      const to = list.find((r) => r.id === toVersionId) ?? null;
      const from = fromVersionId
        ? (list.find((r) => r.id === fromVersionId) ?? null)
        : null;
      return {
        from,
        to,
        // Diff számítás kliens oldalon: kis payload, jóváhagyott lib nélkül.
        lines: computeSimpleDiff(from?.rendered_text ?? "", to?.rendered_text ?? ""),
      };
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <Globe className="h-5 w-5" />
          <h2 className="text-lg font-semibold">Website Knowledge</h2>
          <Badge variant="outline">WK-2 · crawl + verziók</Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          A Netlify deploy webhookok inline crawl-t indítanak a vibateam.hu
          sitemap-ja alapján. Oldalanként hash + verzió + diff kerül a
          `website_pages`, `website_page_versions` és `website_page_changes`
          táblákba. Az AI-összefoglaló és a KG publikáció WK-3 → WK-4-ben jön.
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
                    <th className="py-2 pr-3 font-medium text-right"></th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <tr
                      key={r.id}
                      className={`border-b last:border-b-0 ${
                        selectedRunId === r.id ? "bg-muted/40" : ""
                      }`}
                    >
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
                      <td className="py-2 pr-3 text-right">
                        <Button
                          size="sm"
                          variant={selectedRunId === r.id ? "default" : "outline"}
                          onClick={() => setSelectedRunId(r.id)}
                          disabled={r.ai_jobs_total === 0}
                        >
                          <Activity className="mr-1 h-3.5 w-3.5" />
                          AI jobs
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pages */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            <div>
              <CardTitle className="text-base">Pages</CardTitle>
              <CardDescription>
                Utolsó 200 indexelt oldal. Kattints egy sorra a verziótörténethez.
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Input
              placeholder="Szűrés URL / cím szerint…"
              value={pageSearch}
              onChange={(e) => setPageSearch(e.target.value)}
              className="h-8 w-64"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => pagesQ.refetch()}
              disabled={pagesQ.isFetching}
            >
              <RefreshCw
                className={`mr-2 h-3.5 w-3.5 ${pagesQ.isFetching ? "animate-spin" : ""}`}
              />
              Frissítés
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {pagesQ.isLoading ? (
            <div className="text-sm text-muted-foreground">Betöltés…</div>
          ) : pagesQ.isError ? (
            <div className="text-sm text-destructive">
              Hiba: {(pagesQ.error as Error).message}
            </div>
          ) : (pagesQ.data ?? []).length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              Még nincs feldolgozott oldal. Az első sikeres crawl után jelennek meg.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Path</th>
                    <th className="py-2 pr-3 font-medium">Title</th>
                    <th className="py-2 pr-3 font-medium">Kind</th>
                    <th className="py-2 pr-3 font-medium">Last crawled</th>
                    <th className="py-2 pr-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {(pagesQ.data ?? []).map((p) => (
                    <tr
                      key={p.id}
                      className={`border-b last:border-b-0 ${
                        selectedPageId === p.id ? "bg-muted/40" : ""
                      }`}
                    >
                      <td className="py-2 pr-3 font-mono text-xs">{p.path}</td>
                      <td className="py-2 pr-3">{p.title ?? "—"}</td>
                      <td className="py-2 pr-3">
                        <Badge variant="outline" className="text-[10px]">
                          {p.asset_kind}
                        </Badge>
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap text-muted-foreground">
                        {fmt(p.last_crawled_at)}
                      </td>
                      <td className="py-2 pr-3 text-right">
                        <Button
                          size="sm"
                          variant={selectedPageId === p.id ? "default" : "outline"}
                          onClick={() => {
                            setSelectedPageId(p.id);
                            setFromVersionId(null);
                            setToVersionId(null);
                          }}
                        >
                          <History className="mr-1 h-3.5 w-3.5" />
                          Verziók
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Page history */}
      {selectedPageId && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <History className="h-4 w-4" />
              Page history
            </CardTitle>
            <CardDescription>
              Válaszd ki a két verziót a diff nézethez (from / to).
            </CardDescription>
          </CardHeader>
          <CardContent>
            {historyQ.isLoading ? (
              <div className="text-sm text-muted-foreground">Betöltés…</div>
            ) : (historyQ.data ?? []).length === 0 ? (
              <div className="text-sm text-muted-foreground">
                Nincs verzió (még nem futott crawl erre az oldalra).
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 pr-3 font-medium">#</th>
                      <th className="py-2 pr-3 font-medium">Fetched</th>
                      <th className="py-2 pr-3 font-medium">HTTP</th>
                      <th className="py-2 pr-3 font-medium">Bytes</th>
                      <th className="py-2 pr-3 font-medium">Hash</th>
                      <th className="py-2 pr-3 font-medium text-right">From</th>
                      <th className="py-2 pr-3 font-medium text-right">To</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(historyQ.data ?? []).map((v) => (
                      <tr key={v.id} className="border-b last:border-b-0">
                        <td className="py-2 pr-3 tabular-nums">v{v.version_number}</td>
                        <td className="py-2 pr-3 whitespace-nowrap">{fmt(v.fetched_at)}</td>
                        <td className="py-2 pr-3 tabular-nums">{v.http_status ?? "—"}</td>
                        <td className="py-2 pr-3 tabular-nums">{v.byte_size ?? "—"}</td>
                        <td className="py-2 pr-3 font-mono text-[10px] text-muted-foreground">
                          {v.content_hash.slice(0, 10)}…
                        </td>
                        <td className="py-2 pr-3 text-right">
                          <input
                            type="radio"
                            name="from-version"
                            checked={fromVersionId === v.id}
                            onChange={() => setFromVersionId(v.id)}
                          />
                        </td>
                        <td className="py-2 pr-3 text-right">
                          <input
                            type="radio"
                            name="to-version"
                            checked={toVersionId === v.id}
                            onChange={() => setToVersionId(v.id)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-3 flex items-center gap-2">
                  <Button
                    size="sm"
                    disabled={!toVersionId}
                    onClick={() => diffQ.refetch()}
                  >
                    <GitCompare className="mr-1 h-3.5 w-3.5" />
                    Diff megjelenítése
                  </Button>
                  {!fromVersionId && toVersionId && (
                    <span className="text-xs text-muted-foreground">
                      From nincs kiválasztva → a teljes „to” verzió jelenik meg
                      hozzáadott sorokként.
                    </span>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Page diff */}
      {toVersionId && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <GitCompare className="h-4 w-4" />
              Page diff
            </CardTitle>
            <CardDescription>
              Renderelt szöveg soralapú összehasonlítása. Max 500 sor.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {diffQ.isLoading ? (
              <div className="text-sm text-muted-foreground">Számolás…</div>
            ) : diffQ.isError ? (
              <div className="text-sm text-destructive">
                Hiba: {(diffQ.error as Error).message}
              </div>
            ) : !diffQ.data ? (
              <div className="text-sm text-muted-foreground">Válaszd ki a verziókat.</div>
            ) : (
              <pre className="max-h-[500px] overflow-auto rounded-md border bg-muted/20 p-3 text-xs leading-relaxed">
                {diffQ.data.lines.slice(0, 500).map((l, i) => (
                  <div
                    key={i}
                    className={
                      l.op === "add"
                        ? "bg-green-500/10 text-green-700 dark:text-green-300"
                        : l.op === "remove"
                          ? "bg-red-500/10 text-red-700 dark:text-red-300"
                          : "text-muted-foreground"
                    }
                  >
                    <span className="mr-2 select-none">
                      {l.op === "add" ? "+" : l.op === "remove" ? "-" : " "}
                    </span>
                    {l.text}
                  </div>
                ))}
              </pre>
            )}
          </CardContent>
        </Card>
      )}

      {/* WK-3: Summary preview a kiválasztott page current version-jéhez */}
      {selectedPageId && (
        <SummaryPreview pageId={selectedPageId} />
      )}

      {/* WK-3: AI run breakdown */}
      {selectedRunId && (
        <AiRunBreakdown runId={selectedRunId} />
      )}

      {/* WK-3: Entity browser (globális) */}
      <EntityBrowser search={entitySearch} setSearch={setEntitySearch} />

      {/* WK-4: KG snapshot a kiválasztott oldalhoz */}
      {selectedPageId && <KgSnapshot pageId={selectedPageId} />}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Következő sprintek</CardTitle>
          <CardDescription>Ezek a szekciók a következő sprintekben jelennek meg.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1 text-sm text-muted-foreground">
            <li>WK-5 · Manuális refresh (page / batch / entire).</li>
            <li>WK-6 · Website AI OS toolok agent-hozzáférése.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

// ========== WK-4 szekció ==========

function KgSnapshot({ pageId }: { pageId: string }) {
  const nodeQ = useQuery({
    queryKey: ["kg_node_for_page", pageId],
    enabled: !!pageId,
    queryFn: async () => {
      const { data: node } = await supabase
        .from("kg_nodes")
        .select("id, kind, label, ref_uri, metadata, updated_at")
        .eq("kind", "website_page")
        .eq("ref_table", "website_pages")
        .eq("ref_id", pageId)
        .maybeSingle();
      if (!node) return { node: null, out_edges: [] as Array<{ id: string; relation: string; to_node_id: string; source: string }> };
      const { data: edges } = await supabase
        .from("kg_edges")
        .select("id, relation, to_node_id, source")
        .eq("from_node_id", (node as { id: string }).id)
        .limit(200);
      return { node, out_edges: (edges ?? []) as Array<{ id: string; relation: string; to_node_id: string; source: string }> };
    },
  });

  const data = nodeQ.data;
  const byRel: Record<string, number> = {};
  for (const e of data?.out_edges ?? []) {
    byRel[e.relation] = (byRel[e.relation] ?? 0) + 1;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Network className="h-4 w-4" /> Knowledge Graph snapshot
        </CardTitle>
        <CardDescription>
          A kiválasztott oldal KG node-ja és kimenő élei (WK-4 publisher output).
        </CardDescription>
      </CardHeader>
      <CardContent>
        {nodeQ.isLoading ? (
          <p className="text-sm text-muted-foreground">Betöltés…</p>
        ) : !data?.node ? (
          <p className="text-sm text-muted-foreground">
            Ehhez az oldalhoz még nem futott le KG publikáció. Az él fog megjelenni a
            következő crawl után.
          </p>
        ) : (
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{(data.node as { kind: string }).kind}</Badge>
              <span className="font-medium">{(data.node as { label: string | null }).label ?? "—"}</span>
              <span className="text-muted-foreground text-xs">
                node_id: {(data.node as { id: string }).id}
              </span>
            </div>
            <div className="text-xs text-muted-foreground">
              Utolsó KG frissítés: {fmt((data.node as { updated_at: string }).updated_at)}
            </div>
            <div>
              <div className="text-xs font-medium mb-1">Kimenő élek relációnként:</div>
              {Object.keys(byRel).length === 0 ? (
                <p className="text-xs text-muted-foreground">Nincs kimenő él.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {Object.entries(byRel).map(([rel, n]) => (
                    <Badge key={rel} variant="secondary">
                      {rel}: {n}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ========== WK-3 szekciók ==========

type EntityKind =
  | "service"
  | "product"
  | "person"
  | "company"
  | "location"
  | "topic"
  | "technology"
  | "other";

function SummaryPreview({ pageId }: { pageId: string }) {
  const summaryQ = useQuery({
    queryKey: ["website_page_summary", pageId],
    queryFn: async () => {
      const { data: page, error: pErr } = await supabase
        .from("website_pages")
        .select("id, url, title, current_version_id")
        .eq("id", pageId)
        .maybeSingle();
      if (pErr) throw new Error(pErr.message);
      if (!page || !page.current_version_id) return { summary: null, entities: [] };

      const { data: summary } = await supabase
        .from("website_page_summaries")
        .select("id, summary, summary_json, model, created_at")
        .eq("page_version_id", page.current_version_id)
        .maybeSingle();

      const { data: links } = await supabase
        .from("website_page_entities")
        .select("id, role, confidence, entity_id")
        .eq("page_version_id", page.current_version_id)
        .limit(50);

      const linkList = (links ?? []) as Array<{
        id: string;
        role: string | null;
        confidence: number | null;
        entity_id: string;
      }>;
      const entityIds = Array.from(new Set(linkList.map((l) => l.entity_id)));
      let entities: Array<{ id: string; entity_kind: string; name: string }> = [];
      if (entityIds.length > 0) {
        const { data: entRows } = await supabase
          .from("website_entities")
          .select("id, entity_kind, name")
          .in("id", entityIds);
        entities = (entRows ?? []) as typeof entities;
      }
      const entMap = new Map(entities.map((e) => [e.id, e]));
      return {
        summary: summary as {
          id: string;
          summary: string | null;
          summary_json: Record<string, unknown>;
          model: string | null;
          created_at: string;
        } | null,
        entities: linkList.map((l) => ({
          ...l,
          entity: entMap.get(l.entity_id) ?? null,
        })),
      };
    },
  });

  const data = summaryQ.data;
  const sj = (data?.summary?.summary_json ?? {}) as {
    topic?: string;
    audience?: string;
    key_points?: string[];
    tone?: string;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          Summary preview
        </CardTitle>
        <CardDescription>
          A kiválasztott oldal aktuális verziójához tartozó AI összefoglaló és
          kinyert entitások.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {summaryQ.isLoading ? (
          <div className="text-sm text-muted-foreground">Betöltés…</div>
        ) : !data?.summary ? (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            Ehhez az oldalhoz még nincs AI összefoglaló. Az első sikeres crawl
            után automatikusan elkészül.
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Összefoglaló
              </div>
              <p className="mt-1 text-sm leading-relaxed">
                {data.summary.summary ?? "—"}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <MetaCell label="Téma" value={sj.topic ?? "—"} />
              <MetaCell label="Célközönség" value={sj.audience ?? "—"} />
              <MetaCell label="Hangnem" value={sj.tone ?? "—"} />
              <MetaCell label="Modell" value={data.summary.model ?? "—"} />
            </div>
            {Array.isArray(sj.key_points) && sj.key_points.length > 0 && (
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Kulcspontok
                </div>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">
                  {sj.key_points.slice(0, 10).map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              </div>
            )}
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Entitások ({data.entities.length})
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {data.entities.length === 0 ? (
                  <span className="text-sm text-muted-foreground">
                    Nincs kinyert entitás.
                  </span>
                ) : (
                  data.entities.map((l) => (
                    <Badge
                      key={l.id}
                      variant={l.role === "primary" ? "default" : "outline"}
                      className="text-[11px]"
                      title={`${l.role ?? "mentioned"} · confidence ${l.confidence ?? "—"}`}
                    >
                      <span className="mr-1 text-muted-foreground">
                        {l.entity?.entity_kind ?? "?"}
                      </span>
                      {l.entity?.name ?? "—"}
                    </Badge>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MetaCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 text-sm">{value}</div>
    </div>
  );
}

function AiRunBreakdown({ runId }: { runId: string }) {
  const jobsQ = useQuery({
    queryKey: ["website_ai_jobs", runId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("website_ai_jobs")
        .select(
          "id, job_kind, model, status, input_tokens, output_tokens, total_cost_usd, latency_ms, error_message, page_id, created_at",
        )
        .eq("run_id", runId)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw new Error(error.message);
      return (data ?? []) as Array<{
        id: string;
        job_kind: string;
        model: string;
        status: string;
        input_tokens: number | null;
        output_tokens: number | null;
        total_cost_usd: number | null;
        latency_ms: number | null;
        error_message: string | null;
        page_id: string | null;
        created_at: string;
      }>;
    },
  });

  const jobs = jobsQ.data ?? [];
  const totalCost = jobs.reduce(
    (s, j) => s + Number(j.total_cost_usd ?? 0),
    0,
  );
  const totalIn = jobs.reduce((s, j) => s + (j.input_tokens ?? 0), 0);
  const totalOut = jobs.reduce((s, j) => s + (j.output_tokens ?? 0), 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="h-4 w-4" />
          AI run breakdown
        </CardTitle>
        <CardDescription>
          A kiválasztott crawl-run AI hívásai. Összesen{" "}
          <span className="font-medium">{jobs.length}</span> job,{" "}
          <span className="font-medium">{totalIn}</span> in / {totalOut} out
          token, <span className="font-medium">${totalCost.toFixed(4)}</span>.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {jobsQ.isLoading ? (
          <div className="text-sm text-muted-foreground">Betöltés…</div>
        ) : jobs.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            Nincs AI job ehhez a runhoz.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Kind</th>
                  <th className="py-2 pr-3 font-medium">Model</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 pr-3 font-medium">In / Out</th>
                  <th className="py-2 pr-3 font-medium">Cost</th>
                  <th className="py-2 pr-3 font-medium">Latency</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => (
                  <tr key={j.id} className="border-b last:border-b-0">
                    <td className="py-2 pr-3">
                      <Badge variant="outline" className="text-[10px]">
                        {j.job_kind}
                      </Badge>
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs">{j.model}</td>
                    <td className="py-2 pr-3">
                      <Badge
                        variant={
                          j.status === "success"
                            ? "default"
                            : j.status === "failed"
                              ? "destructive"
                              : "secondary"
                        }
                        className="text-[10px]"
                      >
                        {j.status}
                      </Badge>
                      {j.error_message && (
                        <div
                          className="mt-1 text-[11px] text-destructive"
                          title={j.error_message}
                        >
                          {j.error_message.slice(0, 60)}
                          {j.error_message.length > 60 ? "…" : ""}
                        </div>
                      )}
                    </td>
                    <td className="py-2 pr-3 tabular-nums text-xs">
                      {j.input_tokens ?? "—"} / {j.output_tokens ?? "—"}
                    </td>
                    <td className="py-2 pr-3 tabular-nums text-xs">
                      ${Number(j.total_cost_usd ?? 0).toFixed(4)}
                    </td>
                    <td className="py-2 pr-3 tabular-nums text-xs">
                      {j.latency_ms != null ? `${j.latency_ms} ms` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EntityBrowser({
  search,
  setSearch,
}: {
  search: string;
  setSearch: (v: string) => void;
}) {
  const entQ = useQuery({
    queryKey: ["website_entities", "list", search],
    queryFn: async () => {
      let q = supabase
        .from("website_entities")
        .select("id, entity_kind, name, normalized_name, updated_at")
        .order("updated_at", { ascending: false })
        .limit(200);
      if (search.trim().length > 0) {
        const term = `%${search.trim()}%`;
        q = q.or(`name.ilike.${term},normalized_name.ilike.${term}`);
      }
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      const entities = (data ?? []) as Array<{
        id: string;
        entity_kind: EntityKind;
        name: string;
        normalized_name: string;
        updated_at: string;
      }>;

      const ids = entities.map((e) => e.id);
      const counts = new Map<string, number>();
      if (ids.length > 0) {
        const { data: linkRows } = await supabase
          .from("website_page_entities")
          .select("entity_id")
          .in("entity_id", ids);
        for (const l of (linkRows ?? []) as Array<{ entity_id: string }>) {
          counts.set(l.entity_id, (counts.get(l.entity_id) ?? 0) + 1);
        }
      }
      return entities.map((e) => ({ ...e, occurrences: counts.get(e.id) ?? 0 }));
    },
  });

  const entities = entQ.data ?? [];
  const grouped = useMemo(() => {
    const m = new Map<string, typeof entities>();
    for (const e of entities) {
      const list = m.get(e.entity_kind) ?? [];
      list.push(e);
      m.set(e.entity_kind, list);
    }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [entities]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <Tags className="h-4 w-4" />
          <div>
            <CardTitle className="text-base">Entity browser</CardTitle>
            <CardDescription>
              A `website_entities` katalógus, kategóriák szerint csoportosítva.
              Zárójelben az előfordulás-szám az oldalakon.
            </CardDescription>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Szűrés név szerint…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-64"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => entQ.refetch()}
            disabled={entQ.isFetching}
          >
            <RefreshCw
              className={`mr-2 h-3.5 w-3.5 ${entQ.isFetching ? "animate-spin" : ""}`}
            />
            Frissítés
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {entQ.isLoading ? (
          <div className="text-sm text-muted-foreground">Betöltés…</div>
        ) : entities.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            Még nincs kinyert entitás. Az első sikeres AI-feldolgozás után
            jelennek meg itt.
          </div>
        ) : (
          <div className="space-y-4">
            {grouped.map(([kind, list]) => (
              <div key={kind}>
                <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {kind} ({list.length})
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {list.map((e) => (
                    <Badge
                      key={e.id}
                      variant="outline"
                      className="text-[11px]"
                      title={`Utolsó frissítés: ${fmt(e.updated_at)}`}
                    >
                      {e.name}
                      {e.occurrences > 0 && (
                        <span className="ml-1 text-muted-foreground">
                          ({e.occurrences})
                        </span>
                      )}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// -------- Kliensoldali kis diff (ugyanaz az algoritmus, mint a server-en) --------

function computeSimpleDiff(
  before: string,
  after: string,
): Array<{ op: "add" | "remove" | "equal"; text: string }> {
  const a = before.replace(/\r\n/g, "\n").split("\n");
  const b = after.replace(/\r\n/g, "\n").split("\n");
  let start = 0;
  const minLen = Math.min(a.length, b.length);
  while (start < minLen && a[start] === b[start]) start++;
  let endA = a.length - 1;
  let endB = b.length - 1;
  while (endA >= start && endB >= start && a[endA] === b[endB]) {
    endA--;
    endB--;
  }
  const out: Array<{ op: "add" | "remove" | "equal"; text: string }> = [];
  for (let i = 0; i < start; i++) out.push({ op: "equal", text: a[i] });
  for (let i = start; i <= endA; i++) out.push({ op: "remove", text: a[i] });
  for (let i = start; i <= endB; i++) out.push({ op: "add", text: b[i] });
  for (let i = endA + 1; i < a.length; i++) out.push({ op: "equal", text: a[i] });
  return out;
}