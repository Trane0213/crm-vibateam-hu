import { Link } from "@tanstack/react-router";
import { AlertOctagon, BellRing, FileText, Sparkles, Plus, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WelcomeHeader } from "@/components/welcome-header";
import { HeroStat, SectionLabel, QuickActions } from "@/components/today/today-shell";
import { useCount, useAggregateSum } from "@/lib/db-hooks";
import { formatHuf } from "@/lib/format";
import { LeadWorkspace } from "@/components/lead-workspace/lead-workspace";

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
      <WelcomeHeader subtitle="Mai értékesítési teendőid és nyitott ügyek." />

      <QuickActions>
        <Button size="sm" asChild><Link to="/leads" search={{ new: 1 } as any}><Plus className="mr-1 h-3.5 w-3.5" />Új érdeklődő</Link></Button>
        <Button size="sm" variant="secondary" asChild><Link to="/quotes" search={{ new: 1 } as any}><Plus className="mr-1 h-3.5 w-3.5" />Új ajánlat</Link></Button>
        <Button size="sm" variant="secondary" asChild><Link to="/followups" search={{ new: 1 } as any}><Plus className="mr-1 h-3.5 w-3.5" />Új utókövetés</Link></Button>
        <Button size="sm" variant="outline" asChild><Link to="/ai-assistant" search={{ agent: "sales" } as any}><Bot className="mr-1 h-3.5 w-3.5" />Timothy</Link></Button>
      </QuickActions>

      <div className="px-6 pt-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <HeroStat to="/followups" tone="danger"  icon={AlertOctagon} label="Lejárt utókövetés" value={overdueFu.data ?? 0} sub="haladéktalanul" />
          <HeroStat to="/followups" tone="warning" icon={BellRing}     label="Ma esedékes"       value={todayFu.data ?? 0}   sub="mai utókövetés" />
          <HeroStat to="/quotes"    tone="primary" icon={FileText}     label="Nyitott ajánlat"   value={openQuotes.data ?? 0} sub={openQuotesSum.data != null ? formatHuf(openQuotesSum.data) : "összérték"} />
          <HeroStat to="/leads"     tone="info"    icon={Sparkles}     label="Új érdeklődő (7 nap)" value={newLeadsWeek.data ?? 0} sub="utolsó hét" />
        </div>
      </div>

      <SectionLabel title="Lead Workspace" />
      <LeadWorkspace mode="sales" />
    </div>
  );
}