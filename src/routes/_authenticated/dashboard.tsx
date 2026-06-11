import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/page-header";
import {
  FileText,
  BellRing,
  Sparkles,
  ListChecks,
  TrendingUp,
  Briefcase,
  AlertOctagon,
  AlertTriangle,
  CalendarClock,
} from "lucide-react";
import { formatHuf } from "@/lib/format";
import { useCount, useAggregateSum, useList } from "@/lib/db-hooks";
import { summarizeFollowups, BUCKET_LABEL, BUCKET_TONE, type FollowupBucket } from "@/lib/followup-alerts";
import { fmtDateTime } from "@/components/resource/resource-page";
import { AiSummaryDialog } from "@/components/ai/ai-summary-dialog";
import { loadCrmSnapshot, serializeSnapshot } from "@/lib/ai/crm-context";
import { WelcomeHeader } from "@/components/welcome-header";
import { DailyBriefing } from "@/components/ai/daily-briefing";
import { PROJECT_STATUS, PROJECT_STATUS_LABEL, PROJECT_STATUS_TONE, ACTIVE_PROJECT_STATUSES } from "@/lib/viba-constants";

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
  const tomorrowStart = (() => { const d = new Date(); d.setDate(d.getDate()+1); d.setHours(0,0,0,0); return d.toISOString(); })();
  const tomorrowEnd = (() => { const d = new Date(); d.setDate(d.getDate()+1); d.setHours(23,59,59,999); return d.toISOString(); })();

  const openQuotesCount = useCount("quotes", (q) => q.not("status", "in", "(won,lost)"), "open");
  const openQuotesSum = useAggregateSum("quotes", "total_amount", (q) => q.not("status", "in", "(won,lost)"), "open");
  const overdueFollowups = useCount("followups", (q) => q.eq("completed", false).lt("due_date", now), "overdue");
  const todayFollowups   = useCount("followups", (q) => q.eq("completed", false).gte("due_date", todayStart).lte("due_date", todayEnd), "today-fu");
  const tomorrowFollowups= useCount("followups", (q) => q.eq("completed", false).gte("due_date", tomorrowStart).lte("due_date", tomorrowEnd), "tomorrow-fu");
  const overdueTasks     = useCount("tasks", (q) => q.neq("status", "done").lt("due_date", now), "overdue-tasks");
  const todayTasks = useCount("tasks", (q) => q.neq("status", "done").gte("due_date", todayStart).lte("due_date", todayEnd), "today");
  const weeklyLeads = useCount("leads", (q) => q.gte("created_at", weekAgo), "week");
  const monthlyLeads = useCount("leads", (q) => q.gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString()), "month");
  const activeProjects = useCount("projects", (q) => q.not("status", "in", "(completed,lost)"), "active");
  const wonQuotes = useCount("quotes", (q) => q.eq("status", "won"), "won");
  const lostQuotes = useCount("quotes", (q) => q.eq("status", "lost"), "lost");

  const upcomingFollowups = useList<any>("followups", { order: "due_date", ascending: true });
  const upcomingTasks = useList<any>("tasks", { order: "due_date", ascending: true });
  const allLeads = useList<any>("leads");
  const allProjects = useList<any>("projects");

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

  const projectStatusCounts: Record<string, number> = {};
  for (const p of allProjects.data ?? []) {
    const s = (p.status as string) ?? "uj_megkereses";
    projectStatusCounts[s] = (projectStatusCounts[s] ?? 0) + 1;
  }
  const activeProjectsTotal = ACTIVE_PROJECT_STATUSES.reduce((a, s) => a + (projectStatusCounts[s] ?? 0), 0);

  const fuBuckets = summarizeFollowups((upcomingFollowups.data ?? []) as any[]);
  const wonTotal = (wonQuotes.data ?? 0) + (lostQuotes.data ?? 0);
  const conversionPct = wonTotal > 0 ? Math.round(((wonQuotes.data ?? 0) / wonTotal) * 100) : null;

  // Veszélyes projektek = ahol van lejárt feladat vagy lejárt follow-up.
  const riskyProjectIds = new Set<string>();
  for (const t of upcomingTasks.data ?? []) {
    if (t.status !== "done" && t.due_date && new Date(t.due_date) < new Date() && t.project_id) riskyProjectIds.add(t.project_id);
  }
  for (const f of upcomingFollowups.data ?? []) {
    if (!f.completed && f.due_date && new Date(f.due_date) < new Date() && f.project_id) riskyProjectIds.add(f.project_id);
  }
  const riskyCount = riskyProjectIds.size;

  return (
    <div className="flex flex-col">
      <WelcomeHeader subtitle="Itt vannak a mai legfontosabb teendőid és nyitott ügyek." />

      {/* HERO — FOLLOW-UP FÓKUSZ */}
      <div className="px-6 pt-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Mai teendők · amit ma muszáj megcsinálni</div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <HeroStat
            to="/followups"
            tone="danger"
            icon={AlertOctagon}
            label="Lejárt follow-up"
            value={overdueFollowups.data ?? 0}
            sub="haladéktalanul intézendő"
          />
          <HeroStat
            to="/followups"
            tone="warning"
            icon={BellRing}
            label="Ma esedékes"
            value={todayFollowups.data ?? 0}
            sub="follow-up — ma kell"
          />
          <HeroStat
            to="/tasks"
            tone="danger"
            icon={AlertTriangle}
            label="Lejárt feladat"
            value={overdueTasks.data ?? 0}
            sub="határidőn túl"
          />
          <HeroStat
            to="/tasks"
            tone="info"
            icon={ListChecks}
            label="Ma esedékes feladat"
            value={todayTasks.data ?? 0}
            sub="mai határidős"
          />
        </div>
      </div>

      {/* AI BRIEFING */}
      <div className="px-6 pt-4">
        <DailyBriefing />
      </div>

      <div className="flex items-center justify-between border-b px-6 py-3 mt-2">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">Mai fókusz</div>
        <AiSummaryDialog
            title="AI napi összefoglaló"
            description="Az AI a CRM aktuális ajánlatai, follow-upjai, projektjei és feladatai alapján készít napi vezetői összefoglalót."
            triggerLabel="AI napi összefoglaló"
            loadContext={async () => serializeSnapshot(await loadCrmSnapshot())}
            prompt={[
              "Készíts napi vezetői összefoglalót az alábbi szerkezetben:",
              "1) AJÁNLATOK: nyitott ajánlatok száma, összérték, kiemelt (legnagyobb 2-3) ajánlat státusza.",
              "2) FOLLOW-UPOK: hány lejárt, hány ma esedékes, sorold fel a legsürgősebb 3-at.",
              "3) PROJEKTEK: hány aktív, és mely projekteken kell ma haladni.",
              "4) FELADATOK: ma esedékes és lejárt feladatok rövid listája.",
              "A végén 2 mondatos vezetői fókusz: mire koncentráljon ma a csapat.",
            ].join(" ")}
        />
      </div>

      {/* KRITIKUS */}
      <SectionLabel tone="danger" title="Kritikus · azonnal kezelendő" />
      <div className="grid gap-3 px-6 lg:grid-cols-3">
        <Kpi icon={AlertOctagon} tone="danger" label="Lejárt follow-up" value={overdueFollowups.data ?? "—"} sub="haladéktalanul" />
        <Kpi icon={AlertTriangle} tone="danger" label="Lejárt feladat" value={overdueTasks.data ?? "—"} sub="határidőn túl" />
        <Kpi icon={Briefcase} tone="danger" label="Veszélyes projektek" value={riskyCount} sub="lejárt teendővel" />
      </div>

      {/* BEVÉTEL */}
      <SectionLabel tone="primary" title="Bevétel · pipeline" />
      <div className="grid gap-3 px-6 lg:grid-cols-3">
        <Kpi
          icon={FileText}
          label="Nyitott ajánlatok"
          value={openQuotesCount.data ?? "—"}
          sub={openQuotesSum.data != null ? formatHuf(openQuotesSum.data) : "összérték"}
        />
        <Kpi
          icon={TrendingUp}
          label="Ajánlat-konverzió"
          value={conversionPct != null ? `${conversionPct}%` : "—"}
          sub={wonTotal > 0 ? `${wonQuotes.data}/${wonTotal} megnyert` : "nincs lezárt ajánlat"}
        />
        <Kpi icon={Sparkles} tone="info" label="Új leadek (7 nap)" value={weeklyLeads.data ?? "—"} sub={`30 napban: ${monthlyLeads.data ?? "—"}`} />
      </div>

      {/* PROJEKT */}
      <SectionLabel tone="primary" title="Projekt · kivitelezés" />
      <div className="grid gap-3 px-6 lg:grid-cols-3">
        <Kpi icon={Briefcase} label="Aktív projektek" value={activeProjectsTotal} sub={`${PROJECT_STATUS_LABEL["kivitelezes"]}: ${projectStatusCounts["kivitelezes"] ?? 0}`} />
        <Kpi icon={ListChecks} tone="warning" label="Ma esedékes feladat" value={todayTasks.data ?? "—"} sub="mai határidős" />
        <Kpi icon={BellRing} tone="warning" label="Közelgő follow-up (7 nap)" value={fuBuckets["due-3d"] + fuBuckets["due-7d"]} sub="ezen a héten" />
      </div>

      {/* PROJEKT STÁTUSZ BONTÁS */}
      <div className="px-6 pt-4">
        <SectionLabel title="Projektek státusz szerint" />
        <Card>
          <CardContent className="pt-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {PROJECT_STATUS.map((s) => (
                <Link
                  key={s.value}
                  to="/projects"
                  className={`rounded-md border px-3 py-2 transition hover:opacity-80 ${PROJECT_STATUS_TONE[s.value] ?? ""}`}
                >
                  <div className="text-[10px] uppercase tracking-wider opacity-80">{s.label}</div>
                  <div className="text-2xl font-semibold tabular-nums">{projectStatusCounts[s.value] ?? 0}</div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="px-6 pb-4">
        <SectionLabel title="Follow-up esedékesség" />
        <Card>
          <CardContent className="pt-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {(["overdue", "due-3d", "due-7d", "due-14d", "due-30d"] as FollowupBucket[]).map((b) => (
                <Link
                  key={b}
                  to="/followups"
                  className={`rounded-md border px-3 py-2 transition hover:opacity-80 ${BUCKET_TONE[b]}`}
                >
                  <div className="text-[10px] uppercase tracking-wider opacity-80">{BUCKET_LABEL[b]}</div>
                  <div className="text-2xl font-semibold tabular-nums">{fuBuckets[b]}</div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-4 px-6 pb-6 lg:grid-cols-3">
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
      </div>
    </div>
  );
}

function HeroStat({ to, tone, icon: Icon, label, value, sub }: {
  to: string; tone: "danger" | "warning" | "info"; icon: any; label: string; value: number | string; sub: string;
}) {
  const toneClass = {
    danger: "border-destructive/40 bg-destructive/5 hover:bg-destructive/10 text-destructive",
    warning: "border-[color:var(--status-warning)]/40 bg-[color:var(--status-warning)]/5 hover:bg-[color:var(--status-warning)]/10 text-[color:var(--status-warning)]",
    info: "border-[color:var(--status-info)]/40 bg-[color:var(--status-info)]/5 hover:bg-[color:var(--status-info)]/10 text-[color:var(--status-info)]",
  }[tone];
  return (
    <Link to={to} className={`flex items-center gap-4 rounded-lg border p-5 transition ${toneClass}`}>
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-background/60">
        <Icon className="h-6 w-6" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-medium uppercase tracking-wider opacity-80">{label}</div>
        <div className="mt-1 text-4xl font-bold tabular-nums leading-none">{value}</div>
        <div className="mt-1 text-xs opacity-70">{sub}</div>
      </div>
    </Link>
  );
}

function SectionLabel({ title, tone = "muted" }: { title: string; tone?: "muted" | "danger" | "primary" }) {
  const dot = {
    muted: "bg-muted-foreground/40",
    danger: "bg-destructive",
    primary: "bg-primary",
  }[tone];
  return (
    <div className="flex items-center gap-2 px-6 pt-5 pb-2 text-xs uppercase tracking-wider text-muted-foreground">
      <span className={`inline-block h-2 w-2 rounded-full ${dot}`} />
      {title}
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