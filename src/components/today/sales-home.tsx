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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { WelcomeHeader } from "@/components/welcome-header";
import { HeroStat, QuickActions } from "@/components/today/today-shell";
import { useCount, useAggregateSum } from "@/lib/db-hooks";
import { formatHuf } from "@/lib/format";
import {
  QuickCreateLeadButton,
  QuickCreateFollowupButton,
  QuickCreateQuoteButton,
} from "@/components/today/quick-create";

const isoNow = () => new Date().toISOString();
const isoStartOfDay = () => { const d = new Date(); d.setHours(0,0,0,0); return d.toISOString(); };
const isoEndOfDay = () => { const d = new Date(); d.setHours(23,59,59,999); return d.toISOString(); };
const isoWeekAgo = () => { const d = new Date(); d.setDate(d.getDate()-7); return d.toISOString(); };

export function SalesHome() {
  const now = isoNow();
  const todayStart = isoStartOfDay();
  const todayEnd = isoEndOfDay();
  const weekAgo = isoWeekAgo();

  const overdueFu = useCount("followups", (q) => q.eq("completed", false).lt("due_date", now), "overdue");
  const todayFu   = useCount("followups", (q) => q.eq("completed", false).gte("due_date", todayStart).lte("due_date", todayEnd), "today");
  const openQuotes = useCount("quotes", (q) => q.not("status", "in", "(won,lost)"), "open");
  const openQuotesSum = useAggregateSum("quotes", "total_amount", (q) => q.not("status", "in", "(won,lost)"), "open");
  const newLeadsWeek = useCount("leads", (q) => q.gte("created_at", weekAgo), "week");

  return (
    <div className="flex flex-col">
      <WelcomeHeader subtitle="Napi áttekintés — lejárt és mai teendők, pipeline pulzus, gyorsindítás." />

      <QuickActions>
        <QuickCreateLeadButton />
        <QuickCreateQuoteButton />
        <QuickCreateFollowupButton />
        <Button size="sm" variant="outline" asChild><Link to="/ai-assistant" search={{ agent: "sales" } as any}><Bot className="mr-1 h-3.5 w-3.5" />Timothy</Link></Button>
      </QuickActions>

      {/* KPI sor */}
      <div className="grid gap-3 px-6 pt-3 sm:grid-cols-2 lg:grid-cols-4">
        <HeroStat to="/sales/todo" search={{ bucket: "overdue" } as any} tone="danger" icon={AlertOctagon} label="Lejárt teendő" value={overdueFu.data ?? 0} sub="haladéktalanul" />
        <HeroStat to="/sales/todo" search={{ bucket: "today" } as any}   tone="warning" icon={BellRing}    label="Ma esedékes"  value={todayFu.data ?? 0}   sub="mai teendő" />
        <HeroStat to="/sales/quotes" tone="primary" icon={FileText} label="Nyitott ajánlat" value={openQuotes.data ?? 0} sub={openQuotesSum.data != null ? formatHuf(openQuotesSum.data) : "összérték"} />
        <HeroStat to="/leads"        tone="info"    icon={Sparkles} label="Új érdeklődő (7 nap)" value={newLeadsWeek.data ?? 0} sub="utolsó hét" />
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