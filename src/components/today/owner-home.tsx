import { Link } from "@tanstack/react-router";
import { AlertOctagon, AlertTriangle, BellRing, FileText, TrendingUp, Sparkles } from "lucide-react";
import { WelcomeHeader } from "@/components/welcome-header";
import { DailyBriefing } from "@/components/ai/daily-briefing";
import { CustomerKpiWidgets } from "@/components/dashboard/customer-kpi-widgets";
import { ExecutiveWidgets } from "@/components/dashboard/exec-widgets";
import { HeroStat, SectionLabel } from "@/components/today/today-shell";
import { useCount, useAggregateSum } from "@/lib/db-hooks";
import { formatHuf } from "@/lib/format";

const isoNow = () => new Date().toISOString();
const isoStartOfDay = () => { const d = new Date(); d.setHours(0,0,0,0); return d.toISOString(); };
const isoEndOfDay = () => { const d = new Date(); d.setHours(23,59,59,999); return d.toISOString(); };

export function OwnerHome() {
  const now = isoNow();
  const todayStart = isoStartOfDay();
  const todayEnd = isoEndOfDay();

  const overdueFollowups = useCount("followups", (q) => q.eq("completed", false).lt("due_date", now), "overdue");
  const todayFollowups   = useCount("followups", (q) => q.eq("completed", false).gte("due_date", todayStart).lte("due_date", todayEnd), "today");
  const overdueTasks     = useCount("tasks", (q) => q.neq("status", "done").lt("due_date", now), "overdue");
  const openQuotesCount  = useCount("quotes", (q) => q.not("status", "in", "(won,lost)"), "open");
  const openQuotesSum    = useAggregateSum("quotes", "total_amount", (q) => q.not("status", "in", "(won,lost)"), "open");

  return (
    <div className="flex flex-col">
      <WelcomeHeader subtitle="Vezetői napi áttekintés — a teljes csapat mai fókusza." />

      <div className="px-6 pt-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <HeroStat to="/followups" tone="danger"  icon={AlertOctagon} label="Lejárt utókövetés" value={overdueFollowups.data ?? 0} sub="haladéktalanul" />
          <HeroStat to="/followups" tone="warning" icon={BellRing}     label="Ma esedékes"       value={todayFollowups.data ?? 0}   sub="utókövetés ma" />
          <HeroStat to="/tasks"     tone="danger"  icon={AlertTriangle}label="Lejárt feladat"    value={overdueTasks.data ?? 0}     sub="határidőn túl" />
          <HeroStat to="/quotes"    tone="primary" icon={FileText}     label="Nyitott ajánlat"   value={openQuotesCount.data ?? 0}  sub={openQuotesSum.data != null ? formatHuf(openQuotesSum.data) : "összérték"} />
        </div>
      </div>

      <div className="px-6 pt-4">
        <DailyBriefing />
      </div>

      <SectionLabel
        title="Vezetői áttekintés"
        action={<Link to="/dashboard" className="text-xs text-primary hover:underline">Részletes irányítópult →</Link>}
      />
      <ExecutiveWidgets />

      <SectionLabel title="Ügyfelek · egységes nézet" />
      <CustomerKpiWidgets />

      <div className="px-6 pb-6">
        <Link to="/ai-assistants" className="inline-flex items-center gap-2 text-xs text-primary hover:underline">
          <Sparkles className="h-3.5 w-3.5" /> AI Asszisztensek
        </Link>
        <Link to="/dashboard" className="ml-4 inline-flex items-center gap-2 text-xs text-primary hover:underline">
          <TrendingUp className="h-3.5 w-3.5" /> Bővebb metrikák
        </Link>
      </div>
    </div>
  );
}