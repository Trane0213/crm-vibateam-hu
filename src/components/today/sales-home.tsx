import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertOctagon, BellRing, FileText, Sparkles, Bot, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WelcomeHeader } from "@/components/welcome-header";
import { HeroStat, QuickActions } from "@/components/today/today-shell";
import { useCount, useAggregateSum } from "@/lib/db-hooks";
import { formatHuf } from "@/lib/format";
import { LeadWorkspace } from "@/components/lead-workspace/lead-workspace";
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
  const [overviewOpen, setOverviewOpen] = useState(false);
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
      <WelcomeHeader subtitle="Értékesítési munkafelület — lead, ajánlat, utánkövetés egy képernyőn." />

      <QuickActions>
        <QuickCreateLeadButton />
        <QuickCreateQuoteButton />
        <QuickCreateFollowupButton />
        <Button size="sm" variant="outline" asChild><Link to="/ai-assistant" search={{ agent: "sales" } as any}><Bot className="mr-1 h-3.5 w-3.5" />Timothy</Link></Button>
      </QuickActions>

      {/* HERO: Lead Workspace teljes magasságban */}
      <LeadWorkspace
        mode="sales"
        className="mx-6 mt-3 mb-4 grid h-[calc(100vh-220px)] min-h-[560px] grid-cols-1 overflow-hidden rounded-lg border bg-card lg:grid-cols-[280px_minmax(0,1fr)_320px]"
      />

      {/* Áttekintés (collapsible) */}
      <div className="px-6 pb-6">
        <button
          type="button"
          onClick={() => setOverviewOpen((v) => !v)}
          className="flex w-full items-center justify-between rounded-md border bg-card px-3 py-2 text-sm font-medium hover:bg-muted/40"
        >
          <span>Áttekintés · KPI-k és összegek</span>
          {overviewOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>

        {overviewOpen && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <HeroStat to="/followups" tone="danger"  icon={AlertOctagon} label="Lejárt utókövetés" value={overdueFu.data ?? 0} sub="haladéktalanul" />
            <HeroStat to="/followups" tone="warning" icon={BellRing}     label="Ma esedékes"       value={todayFu.data ?? 0}   sub="mai utókövetés" />
            <HeroStat to="/quotes"    tone="primary" icon={FileText}     label="Nyitott ajánlat"   value={openQuotes.data ?? 0} sub={openQuotesSum.data != null ? formatHuf(openQuotesSum.data) : "összérték"} />
            <HeroStat to="/leads"     tone="info"    icon={Sparkles}     label="Új érdeklődő (7 nap)" value={newLeadsWeek.data ?? 0} sub="utolsó hét" />
          </div>
        )}
      </div>
    </div>
  );
}