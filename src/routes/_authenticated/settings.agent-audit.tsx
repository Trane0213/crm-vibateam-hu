import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, ChevronRight, AlertCircle, Wrench, Bot, Zap } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  listRecentAgentRuns,
  getAgentRunSteps,
  type AuditRunSummary,
  type AuditRunStep,
} from "@/lib/ai-os/audit-view.functions";

export const Route = createFileRoute("/_authenticated/settings/agent-audit")({
  component: AgentAuditPage,
});

const AGENT_FILTERS: { id: string | null; label: string }[] = [
  { id: null, label: "Összes" },
  { id: "michael", label: "Michael (Google Ads)" },
  { id: "george", label: "George" },
  { id: "scarlet", label: "Scarlet" },
  { id: "timothy", label: "Timothy" },
  { id: "boss", label: "Boss" },
];

function fmtDuration(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("hu-HU", { dateStyle: "short", timeStyle: "medium" });
}

function AgentAuditPage() {
  const [agentId, setAgentId] = useState<string | null>("michael");
  const [selectedRun, setSelectedRun] = useState<string | null>(null);

  const runsQuery = useQuery({
    queryKey: ["agent-audit", "runs", agentId],
    queryFn: () => listRecentAgentRuns({ data: { agentId, limit: 20 } }),
  });

  const stepsQuery = useQuery({
    queryKey: ["agent-audit", "steps", selectedRun],
    queryFn: () => getAgentRunSteps({ data: { runId: selectedRun! } }),
    enabled: !!selectedRun,
  });

  const runs: AuditRunSummary[] = runsQuery.data ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            <CardTitle>Agent futás audit</CardTitle>
          </div>
          <CardDescription>
            Az utolsó 20 agent-futás tool-használata (agent_runs + agent_run_steps). Owner-only.
            <br />
            Cél: látni, hogy az agent <strong>valójában</strong> milyen toolokat hív, milyen sorrendben,
            mennyi ideig futottak, és melyek adtak üres eredményt.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {AGENT_FILTERS.map((f) => (
            <Button
              key={f.id ?? "all"}
              size="sm"
              variant={agentId === f.id ? "default" : "outline"}
              onClick={() => {
                setAgentId(f.id);
                setSelectedRun(null);
              }}
            >
              {f.label}
            </Button>
          ))}
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto"
            onClick={() => runsQuery.refetch()}
            disabled={runsQuery.isFetching}
          >
            {runsQuery.isFetching ? "Frissítés…" : "Frissítés"}
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Futások</CardTitle>
            <CardDescription>
              {runsQuery.isLoading
                ? "Betöltés…"
                : runsQuery.error
                  ? "Hiba: " + (runsQuery.error as Error).message
                  : `${runs.length} futás`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {runs.map((r) => {
              const active = r.id === selectedRun;
              return (
                <button
                  key={r.id}
                  onClick={() => setSelectedRun(r.id)}
                  className={`w-full rounded-md border px-3 py-2 text-left text-xs transition-colors ${
                    active ? "border-primary bg-secondary" : "hover:bg-muted/50"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Bot className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-medium">{r.agent_id}</span>
                    <StatusBadge status={r.status} />
                    <span className="ml-auto text-muted-foreground">{fmtDate(r.started_at)}</span>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                    <span title="Futási idő">
                      <Zap className="mr-1 inline h-3 w-3" />
                      {fmtDuration(r.duration_ms)}
                    </span>
                    <span title="Tool hívások / lépések">
                      <Wrench className="mr-1 inline h-3 w-3" />
                      {r.tool_count} tool / {r.total_steps} lépés
                    </span>
                    {r.empty_tool_count > 0 && (
                      <span className="text-amber-600" title="Üres tool eredmény">
                        <AlertCircle className="mr-1 inline h-3 w-3" />
                        {r.empty_tool_count} üres
                      </span>
                    )}
                    <span>tokens: {r.prompt_tokens + r.completion_tokens}</span>
                  </div>
                  {r.tool_names.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {r.tool_names.slice(0, 8).map((n, i) => (
                        <Badge
                          key={i}
                          variant="outline"
                          className="font-mono text-[10px] font-normal"
                        >
                          {n}
                        </Badge>
                      ))}
                      {r.tool_names.length > 8 && (
                        <Badge variant="outline" className="text-[10px]">
                          +{r.tool_names.length - 8}
                        </Badge>
                      )}
                    </div>
                  )}
                  {r.error_message && (
                    <div className="mt-1 text-[11px] text-destructive">{r.error_message}</div>
                  )}
                </button>
              );
            })}
            {!runsQuery.isLoading && runs.length === 0 && (
              <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
                Ehhez az agenthez még nincs rögzített futás.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Lépések</CardTitle>
            <CardDescription>
              {selectedRun
                ? "Egy futás lépései időrendben. Az üres eredményű tool hívások narancssárgán."
                : "Válassz egy futást a bal oldalon."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!selectedRun ? (
              <div className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">
                Nincs kiválasztott futás.
              </div>
            ) : stepsQuery.isLoading ? (
              <div className="text-xs text-muted-foreground">Lépések betöltése…</div>
            ) : stepsQuery.error ? (
              <div className="text-xs text-destructive">
                Hiba: {(stepsQuery.error as Error).message}
              </div>
            ) : (
              <StepList steps={stepsQuery.data ?? []} />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    ok: "border-[color:var(--status-success)]/40 text-[color:var(--status-success)]",
    error: "border-destructive/40 text-destructive",
    running: "border-primary/40 text-primary",
    cancelled: "border-muted-foreground/40 text-muted-foreground",
  };
  return (
    <Badge variant="outline" className={`text-[10px] ${map[status] ?? ""}`}>
      {status}
    </Badge>
  );
}

function StepList({ steps }: { steps: AuditRunStep[] }) {
  if (steps.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
        Ehhez a futáshoz nincs rögzített lépés.
      </div>
    );
  }
  return (
    <ol className="space-y-2">
      {steps.map((s) => (
        <li
          key={s.id}
          className={`rounded-md border p-2 text-xs ${
            s.error
              ? "border-destructive/40 bg-destructive/5"
              : s.is_empty
                ? "border-amber-500/40 bg-amber-500/5"
                : ""
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] text-muted-foreground">#{s.step_no}</span>
            <Badge variant="outline" className="text-[10px]">
              {s.kind}
            </Badge>
            {s.tool_name && (
              <span className="font-mono text-[11px] font-medium">{s.tool_name}</span>
            )}
            {s.is_empty && (
              <Badge
                variant="outline"
                className="border-amber-500/40 text-[10px] text-amber-600"
              >
                üres eredmény
              </Badge>
            )}
            <span className="ml-auto text-[10px] text-muted-foreground">
              {fmtDuration(s.duration_ms)}
            </span>
          </div>
          {s.input_preview && (
            <div className="mt-1 font-mono text-[10.5px] text-muted-foreground">
              <span className="opacity-60">in: </span>
              {s.input_preview}
            </div>
          )}
          {s.output_preview && (
            <div className="mt-0.5 font-mono text-[10.5px] text-muted-foreground">
              <span className="opacity-60">out: </span>
              {s.output_preview}
            </div>
          )}
          {s.error && (
            <div className="mt-1 text-[11px] text-destructive">
              <AlertCircle className="mr-1 inline h-3 w-3" />
              {s.error}
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}