import { AlertOctagon, BellRing, Sparkles, FileText, CalendarClock, TrendingUp, Trophy, ArrowRight, ListChecks } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { WelcomeHeader } from "@/components/welcome-header";
import { HeroStat } from "@/components/today/today-shell";
import { SalesWorklists } from "@/components/today/sales-worklists";
import { useDailyWork } from "@/lib/sales/use-daily-work";
import { TimothyDaily } from "@/components/ai/timothy-daily";

/** Own sales overview and daily focus, using the existing shared query. */
export function SalesHome() {
  const query = useDailyWork();
  const d = query.data;
  const v = (n: number | undefined) => (query.isError ? "!" : n ?? "…");
  const sub = query.isError ? "lekérdezési hiba" : undefined;
  return (
    <div className="crm-today flex flex-col">
      <WelcomeHeader title="Mai feladataim" subtitle="Saját ügyek és teendők" />
      <div className="space-y-5 px-4 py-4 sm:px-6">
        <section aria-label="Értékesítési áttekintés" className="space-y-3">
        <h2 className="text-base font-semibold">Értékesítési áttekintés</h2>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4 [&>a>div:first-child]:hidden [&>a>div:first-child]:sm:flex">
          <HeroStat to="/leads" tone="info" icon={Sparkles} label="Sales-előkészítés" value={v(d?.overview?.prep)} sub={sub ?? "Pipeline előtt"} />
          <HeroStat to="/sales/leads" tone="primary" icon={TrendingUp} label="Aktív Pipeline" value={v(d?.overview?.pipeline)} sub={sub ?? "folyamatban lévő ügyek"} />
          <HeroStat to="/quotes" tone="warning" icon={FileText} label="Nyitott ajánlatok" value={v(d?.overview?.openQuotes)} sub={sub ?? "kiküldött, aktuális"} />
          <HeroStat to="/sales/leads" tone="success" icon={Trophy} label="Megnyert ügyek" value={v(d?.overview?.won)} sub={sub ?? "lezárt értékesítések"} />
        </div>
        </section>
        <section aria-label="Napi fókusz" className="space-y-3">
        <h2 className="text-base font-semibold">Napi fókusz</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <FocusStat to="/sales/todo" search={{ bucket: "overdue" }} tone="danger" icon={AlertOctagon} label="Lejárt teendők" value={v(d?.buckets.overdue.length)} />
          <FocusStat to="/sales/todo" search={{ bucket: "today" }} tone="warning" icon={BellRing} label="Ma esedékes" value={v(d?.buckets.today.length)} />
          <FocusStat to="/sales/todo" search={{ bucket: "tomorrow" }} tone="info" icon={CalendarClock} label="Holnap és később" value={v(d ? d.buckets.tomorrow.length + d.buckets.later.length : undefined)} />
          <FocusStat to="/leads" tone="primary" icon={Sparkles} label="Új érdeklődők" value={v(d?.newLeads.length)} />
        </div>
        </section>
        <TimothyDaily />
        <section className="space-y-3" aria-label="Napi munkalista">
          <h2 className="text-base font-semibold">Napi munkalista</h2>
          <SalesWorklists compact />
        </section>
        <nav aria-label="Sales gyorsbelépők" className="flex flex-wrap gap-2 border-t pt-4">
          <Button asChild variant="outline" size="sm"><Link to="/leads"><Sparkles />Sales-előkészítés<ArrowRight /></Link></Button>
          <Button asChild variant="outline" size="sm"><Link to="/sales/leads"><TrendingUp />Pipeline<ArrowRight /></Link></Button>
          <Button asChild variant="outline" size="sm"><Link to="/quotes"><FileText />Ajánlatok<ArrowRight /></Link></Button>
          <Button asChild variant="outline" size="sm"><Link to="/sales/todo" search={{ bucket: "today" }}><ListChecks />Következő teendők<ArrowRight /></Link></Button>
        </nav>
      </div>
    </div>
  );
}

function FocusStat({ to, search, tone, icon: Icon, label, value }: {
  to: string; search?: Record<string, string>; tone: "danger" | "warning" | "info" | "primary";
  icon: React.ComponentType<{ className?: string }>; label: string; value: string | number;
}) {
  const accent = { danger: "text-destructive", warning: "text-[color:var(--status-warning)]", info: "text-[color:var(--status-info)]", primary: "text-primary" }[tone];
  return <Link to={to} {...(search ? { search } : {})} className="flex min-w-0 items-center gap-3 rounded-lg border bg-card p-3 transition hover:bg-muted/50">
    <Icon className={`h-5 w-5 shrink-0 ${accent}`} />
    <span className="min-w-0 flex-1 text-sm font-medium">{label}</span>
    <span className={`shrink-0 text-2xl font-semibold tabular-nums ${accent}`}>{value}</span>
  </Link>;
}
