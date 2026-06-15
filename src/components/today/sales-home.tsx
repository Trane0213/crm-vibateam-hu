import { Link } from "@tanstack/react-router";
import {
  AlertOctagon,
  BellRing,
  FileText,
  Sparkles,
  Bot,
  Target,
  Briefcase,
  ArrowRight,
  XCircle,
  LayoutDashboard,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { WelcomeHeader } from "@/components/welcome-header";
import { HeroStat, QuickActions } from "@/components/today/today-shell";
import { useCount } from "@/lib/db-hooks";
import {
  QuickCreateLeadButton,
  QuickCreateFollowupButton,
  QuickCreateQuoteButton,
} from "@/components/today/quick-create";
import { PIPELINE_COLUMNS } from "@/components/pipeline/pipeline-types";

export function SalesHome() {
  // FUNNEL — minden számláló pontosan a céloldal lekérdezésével egyezzen.
  // Workspace (/leads, sales mód): a kollektív sales-mode szűrő a
  // lead-list-column.tsx-ben → pipeline_entered_at IS NULL ÉS status NOT
  // IN (lost, won). Ugyanezt számoljuk itt.
  const workspaceCount = useCount(
    "leads",
    (q) => q.is("pipeline_entered_at", null).not("status", "in", "(lost,won)"),
    "workspace-sales",
  );
  // Pipeline (/sales/leads kanban): pipeline_entered_at IS NOT NULL ÉS
  // status IN PIPELINE_COLUMNS — pontosan a fetchPipelineLeads szűrője.
  const pipelineStatusList = `(${PIPELINE_COLUMNS.join(",")})`;
  const pipelineCount = useCount(
    "leads",
    (q) => q.not("pipeline_entered_at", "is", null).in("status", [...PIPELINE_COLUMNS]),
    "pipeline-active",
  );
  // Elveszett (/leads/lost): status='lost' — ugyanaz, mint a lista oldal.
  const lostCount = useCount("leads", (q) => q.eq("status", "lost"), "lost");
  // Projektek (/projects): ResourcePage all rows — szűrés nélkül.
  const projectsCount = useCount("projects", undefined, "all");

  // TEENDŐK — a /sales/todo a v_lead_due_buckets nézetből dolgozik,
  // ne legyen külön „Ma logika” a followups táblán.
  const overdueTodo = useCount(
    "v_lead_due_buckets",
    (q) => q.eq("bucket", "overdue"),
    "overdue",
  );
  const todayTodo = useCount(
    "v_lead_due_buckets",
    (q) => q.eq("bucket", "today"),
    "today",
  );
  // Ajánlatok — a /sales/quotes oldal `lead_id IS NOT NULL` quotes-okat
  // listáz (összes verzió). Ugyanezt számoljuk.
  const quotesCount = useCount(
    "quotes",
    (q) => q.not("lead_id", "is", null),
    "with-lead",
  );

  return (
    <div className="flex flex-col">
      <WelcomeHeader subtitle="Napi áttekintés — lejárt és mai teendők, pipeline pulzus, gyorsindítás." />

      <QuickActions>
        <QuickCreateLeadButton />
        <QuickCreateQuoteButton />
        <QuickCreateFollowupButton />
        <Button size="sm" variant="outline" asChild><Link to="/ai-assistant" search={{ agent: "sales" } as any}><Bot className="mr-1 h-3.5 w-3.5" />Timothy</Link></Button>
      </QuickActions>

      {/* FUNNEL — Workspace → Pipeline → Elveszett → Projekt számlálók.
          Minden szám pontosan a céloldalon látható listával egyezik. */}
      <div className="grid gap-3 px-6 pt-3 sm:grid-cols-2 lg:grid-cols-4">
        <HeroStat
          to="/leads"
          tone="info"
          icon={LayoutDashboard}
          label="Workspace"
          value={workspaceCount.data ?? 0}
          sub="előkészítés alatt"
        />
        <HeroStat
          to="/sales/leads"
          tone="primary"
          icon={Target}
          label="Pipeline"
          value={pipelineCount.data ?? 0}
          sub="aktív ügyek"
        />
        <HeroStat
          to="/leads/lost"
          tone="danger"
          icon={XCircle}
          label="Elveszett"
          value={lostCount.data ?? 0}
          sub="lezárt veszteség"
        />
        <HeroStat
          to="/projects"
          tone="success"
          icon={Briefcase}
          label="Projektek"
          value={projectsCount.data ?? 0}
          sub="megnyert ügyfelek"
        />
      </div>

      {/* TEENDŐK + AJÁNLATOK — a céloldalakkal megegyező lekérdezések. */}
      <div className="grid gap-3 px-6 pt-3 sm:grid-cols-2 lg:grid-cols-3">
        <HeroStat
          to="/sales/todo"
          search={{ bucket: "overdue" } as any}
          tone="danger"
          icon={AlertOctagon}
          label="Lejárt teendő"
          value={overdueTodo.data ?? 0}
          sub="haladéktalanul"
        />
        <HeroStat
          to="/sales/todo"
          search={{ bucket: "today" } as any}
          tone="warning"
          icon={BellRing}
          label="Ma esedékes"
          value={todayTodo.data ?? 0}
          sub="mai teendő"
        />
        <HeroStat
          to="/sales/quotes"
          tone="primary"
          icon={FileText}
          label="Ajánlatok"
          value={quotesCount.data ?? 0}
          sub="leadhez kötött verziók"
        />
      </div>

      {/* Folyamat gyorsbelépők + AI briefing */}
      <div className="grid gap-3 px-6 pt-3 lg:grid-cols-3">
        <FlowCard to="/leads" icon={Sparkles} title="Workspace" desc="Marketingtől átvett leadek előkészítése." />
        <FlowCard to="/sales/leads" icon={Target} title="Pipeline" desc="Ajánlat, tárgyalás, szerződés, megnyert/elveszett." />
        <FlowCard to="/projects" icon={Briefcase} title="Projektek" desc="Megnyert leadekből futó projektek." />
      </div>

      <div className="grid gap-3 px-6 pb-6 pt-3 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">AI briefing</CardTitle>
            <CardDescription>Timothy napi javaslatai — mire fókuszálj ma.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button size="sm" variant="outline" asChild>
              <Link to="/ai-assistant" search={{ agent: "sales" } as any}>
                <Bot className="mr-1.5 h-3.5 w-3.5" /> Megnyitás
              </Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Értesítések</CardTitle>
            <CardDescription>Pipeline-átadások, új leadek, lejáró határidők.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Az értesítések a fejlécben elérhetők — itt hamarosan összesítve is.
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function FlowCard({
  to, icon: Icon, title, desc,
}: {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
}) {
  return (
    <Link
      to={to}
      className="group flex items-center gap-4 rounded-lg border bg-card p-4 transition hover:border-primary/40 hover:bg-primary/5"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold">{title}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">{desc}</div>
      </div>
      <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
    </Link>
  );
}