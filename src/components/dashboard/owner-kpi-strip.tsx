import { AlertOctagon, AlertTriangle, BellRing, FileText, Sparkles, Columns3, Trophy, XCircle, Briefcase, UserX } from "lucide-react";
import { HeroStat } from "@/components/today/today-shell";
import { useCount } from "@/lib/db-hooks";
import { formatHuf } from "@/lib/format";
import { budapestDayBounds, kpiDisplay, useOpenQuotesSummary, useSalesProjectSnapshot } from "@/lib/owner-kpis";

/**
 * Tulajdonosi KPI sáv — a „Ma" és az „Irányítópult" ugyanezt a komponenst
 * használja, így a két oldalon azonos definíció és azonos szám látszik.
 */
export function OwnerKpiStrip() {
  const now = new Date().toISOString();
  const today = budapestDayBounds();

  const overdueFollowups = useCount("followups", (q) => q.eq("completed", false).lt("due_date", now), "owner-overdue");
  const todayFollowups = useCount("followups", (q) => q.eq("completed", false).gte("due_date", today.start).lte("due_date", today.end), `owner-today-${today.start}`);
  const overdueTasks = useCount("tasks", (q) => q.neq("status", "done").lt("due_date", now), "owner-overdue-tasks");
  const quotes = useOpenQuotesSummary();
  const snap = useSalesProjectSnapshot();

  const q = quotes.data;
  const quoteSub = quotes.isLoading ? "betöltés…" : quotes.isError ? "lekérdezési hiba" : !q || q.count === 0 ? "nincs nyitott ajánlat"
    : `${q.net != null ? `nettó ${formatHuf(q.net)}` : "érték nincs rögzítve"}${q.withoutValue ? ` · ${q.withoutValue} db tétel nélkül` : ""}${q.testCount ? ` · ebből TESZT: ${q.testCount}` : ""}`;

  const s = snap.data;
  const sv = (k: keyof NonNullable<typeof s>) => kpiDisplay({ isLoading: snap.isLoading, isError: snap.isError, data: s ? (s[k] as number) : null });
  const testSub = (n?: number) => (n ? `ebből TESZT: ${n}` : "");

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <HeroStat to="/followups" tone="danger" icon={AlertOctagon} label="Lejárt utókövetés" value={kpiDisplay(overdueFollowups)} sub="nyitott, határidőn túl" />
        <HeroStat to="/followups" tone="warning" icon={BellRing} label="Ma esedékes" value={kpiDisplay(todayFollowups)} sub="nyitott utókövetés, budapesti nap" />
        <HeroStat to="/tasks" tone="danger" icon={AlertTriangle} label="Lejárt feladat" value={kpiDisplay(overdueTasks)} sub="nem kész, határidőn túl" />
        <HeroStat to="/quotes" tone="primary" icon={FileText} label="Nyitott ajánlat" value={kpiDisplay({ isLoading: quotes.isLoading, isError: quotes.isError, data: q?.count })} sub={quoteSub} />
      </div>
      <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        <MiniStat to="/leads" icon={Sparkles} label="Sales-előkészítés" value={sv("salesPrep")} sub="még nincs Pipeline-ban" />
        <MiniStat to="/sales/leads" icon={Columns3} label="Pipeline (nyitott)" value={sv("pipeline")} />
        <MiniStat to="/sales/leads" icon={Trophy} label="Megnyert lead" value={sv("won")} sub={testSub(s?.wonTest)} />
        <MiniStat to="/leads/lost" icon={XCircle} label="Elveszett lead" value={sv("lost")} sub={testSub(s?.lostTest)} />
        <MiniStat to="/projects" icon={Briefcase} label="Átadásra vár" value={sv("projectsHandoff")} sub={s ? `${s.projectsTotal} projektből${s.projectsTest ? ` · TESZT: ${s.projectsTest}` : ""}` : ""} />
        <MiniStat to="/projects" icon={UserX} label="Felelős nélküli projekt" value={sv("projectsNoPm")} sub={s && s.projectsNoPm > 0 ? "vezetői teendő" : "mind kiosztva"} warn={!!s && s.projectsNoPm > 0} />
      </div>
    </div>
  );
}

import { Link } from "@tanstack/react-router";
function MiniStat({ to, icon: Icon, label, value, sub, warn }: {
  to: string; icon: React.ComponentType<{ className?: string }>; label: string; value: number | string; sub?: string; warn?: boolean;
}) {
  return (
    <Link to={to} className={`rounded-md border bg-card px-3 py-2 transition hover:bg-muted/50 ${warn ? "border-destructive/50" : ""}`}>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className={`text-xl font-semibold tabular-nums ${warn ? "text-destructive" : ""}`}>{value}</div>
      {sub && <div className="truncate text-[10px] text-muted-foreground">{sub}</div>}
    </Link>
  );
}
