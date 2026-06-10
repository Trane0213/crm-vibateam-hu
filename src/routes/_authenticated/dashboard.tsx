import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader, EmptyState } from "@/components/page-header";
import {
  FileText,
  BellRing,
  Sparkles,
  ListChecks,
  TrendingUp,
  Briefcase,
} from "lucide-react";
import { formatHuf } from "@/lib/format";
import { useCount, useAggregateSum, useList } from "@/lib/db-hooks";
import { fmtDateTime } from "@/components/resource/resource-page";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function isoNow() { return new Date().toISOString(); }
function isoStartOfDay() { const d = new Date(); d.setHours(0,0,0,0); return d.toISOString(); }
function isoEndOfDay() { const d = new Date(); d.setHours(23,59,59,999); return d.toISOString(); }
function isoWeekAgo() { const d = new Date(); d.setDate(d.getDate()-7); return d.toISOString(); }

function Dashboard() {
  const now = isoNow();
  const todayStart = isoStartOfDay();
  const todayEnd = isoEndOfDay();
  const weekAgo = isoWeekAgo();

  const openQuotesCount = useCount("quotes", (q) => q.not("status", "in", "(won,lost)"), "open");
  const openQuotesSum = useAggregateSum("quotes", "total_amount", (q) => q.not("status", "in", "(won,lost)"), "open");
  const overdueFollowups = useCount("followups", (q) => q.eq("completed", false).lt("due_date", now), "overdue");
  const todayTasks = useCount("tasks", (q) => q.neq("status", "done").gte("due_date", todayStart).lte("due_date", todayEnd), "today");
  const weeklyLeads = useCount("leads", (q) => q.gte("created_at", weekAgo), "week");
  const activeProjects = useCount("projects", (q) => q.not("status", "in", "(completed,lost)"), "active");

  const upcomingFollowups = useList<any>("followups", { order: "due_date", ascending: true });
  const upcomingTasks = useList<any>("tasks", { order: "due_date", ascending: true });
  const allLeads = useList<any>("leads");

  const fuList = (upcomingFollowups.data ?? [])
    .filter((f: any) => !f.completed && f.due_date)
    .slice(0, 6);
  const taskList = (upcomingTasks.data ?? [])
    .filter((t: any) => t.status !== "done" && t.due_date)
    .slice(0, 6);

  const leadStatusCounts: Record<string, number> = {};
  for (const l of allLeads.data ?? []) {
    const s = l.status ?? "—";
    leadStatusCounts[s] = (leadStatusCounts[s] ?? 0) + 1;
  }

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Irányítópult"
        description="Ajánlatkövetés, follow-upok és napi teendők — valós idejű adatok."
      />
      <div className="grid gap-4 p-6 lg:grid-cols-4">
        <Kpi
          icon={FileText}
          label="Nyitott ajánlatok"
          value={openQuotesCount.data ?? "—"}
          sub={openQuotesSum.data != null ? formatHuf(openQuotesSum.data) : "összérték"}
        />
        <Kpi
          icon={BellRing}
          label="Lejárt follow-up"
          value={overdueFollowups.data ?? "—"}
          sub="haladéktalanul"
          tone="danger"
        />
        <Kpi
          icon={ListChecks}
          label="Ma esedékes"
          value={todayTasks.data ?? "—"}
          sub="feladatok"
          tone="warning"
        />
        <Kpi
          icon={Sparkles}
          label="Új leadek (7 nap)"
          value={weeklyLeads.data ?? "—"}
          sub="ezen a héten"
          tone="info"
        />
      </div>
      <div className="grid gap-4 px-6 pb-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Aktív projektek</CardTitle>
              <CardDescription>
                {activeProjects.data ?? "—"} folyamatban lévő projekt
              </CardDescription>
            </div>
            <Link to="/projects" className="text-xs text-primary hover:underline">Összes projekt</Link>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Briefcase className="h-8 w-8" />
              </div>
              <div>
                <div className="text-3xl font-semibold tabular-nums">
                  {activeProjects.data ?? "—"}
                </div>
                <div className="text-sm text-muted-foreground">Nem lezárt projekt</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Lead státuszok</CardTitle>
            <CardDescription>jelenlegi megoszlás</CardDescription>
          </CardHeader>
          <CardContent>
            {Object.keys(leadStatusCounts).length === 0 ? (
              <EmptyState icon={Sparkles} title="Nincs lead" />
            ) : (
              <div className="space-y-1.5">
                {Object.entries(leadStatusCounts).map(([s, n]) => (
                  <div key={s} className="flex items-center justify-between text-sm">
                    <Badge variant="outline" className="font-normal">{s}</Badge>
                    <span className="tabular-nums font-medium">{n}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Közelgő follow-upok</CardTitle>
              <CardDescription>időrendben</CardDescription>
            </div>
            <Link to="/followups" className="text-xs text-primary hover:underline">Mind</Link>
          </CardHeader>
          <CardContent>
            {fuList.length === 0 ? (
              <EmptyState icon={BellRing} title="Nincs nyitott follow-up" />
            ) : (
              <ul className="space-y-2 text-sm">
                {fuList.map((f: any) => {
                  const overdue = new Date(f.due_date) < new Date();
                  return (
                    <li key={f.id} className="flex items-center justify-between gap-3">
                      <span className="truncate text-muted-foreground">{f.followup_type ?? "—"}</span>
                      <span className={`tabular-nums ${overdue ? "text-destructive font-semibold" : ""}`}>
                        {fmtDateTime(f.due_date)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Következő teendők</CardTitle>
              <CardDescription>nyitott feladatok</CardDescription>
            </div>
            <Link to="/tasks" className="text-xs text-primary hover:underline">Mind</Link>
          </CardHeader>
          <CardContent>
            {taskList.length === 0 ? (
              <EmptyState icon={ListChecks} title="Nincs nyitott feladat" />
            ) : (
              <ul className="space-y-2 text-sm">
                {taskList.map((t: any) => {
                  const overdue = new Date(t.due_date) < new Date();
                  return (
                    <li key={t.id} className="flex items-center justify-between gap-3">
                      <span className="truncate font-medium">{t.title}</span>
                      <span className="flex items-center gap-2">
                        <Badge variant="outline" className="font-normal">{t.priority ?? "—"}</Badge>
                        <span className={`tabular-nums ${overdue ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
                          {fmtDateTime(t.due_date)}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ajánlat-pipeline</CardTitle>
            <CardDescription>nyitott összérték</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                <TrendingUp className="h-5 w-5" />
              </div>
              <div>
                <div className="text-2xl font-semibold tabular-nums">
                  {openQuotesSum.data != null ? formatHuf(openQuotesSum.data) : "—"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {openQuotesCount.data ?? 0} nyitott ajánlat
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Kpi({
  icon: Icon, label, value, sub, tone = "primary",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; value: number | string; sub?: string;
  tone?: "primary" | "warning" | "danger" | "info";
}) {
  const toneClass: Record<string, string> = {
    primary: "text-primary bg-primary/10",
    warning: "text-[color:var(--status-warning)] bg-[color:var(--status-warning)]/15",
    danger: "text-destructive bg-destructive/10",
    info: "text-[color:var(--status-info)] bg-[color:var(--status-info)]/10",
  };
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`flex h-10 w-10 items-center justify-center rounded-md ${toneClass[tone]}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="text-2xl font-semibold tabular-nums leading-none">{value}</div>
          <div className="mt-1 text-xs text-muted-foreground">{label}</div>
          {sub && <div className="text-[11px] text-muted-foreground/70">{sub}</div>}
        </div>
      </CardContent>
    </Card>
  );
}