import { useMemo } from "react";
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Következő sprintek</CardTitle>
          <CardDescription>Ezek a szekciók a következő sprintekben jelennek meg.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1 text-sm text-muted-foreground">
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