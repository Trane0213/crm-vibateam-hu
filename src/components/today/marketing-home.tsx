import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Sparkles, Mail, Radar, TrendingUp, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WelcomeHeader } from "@/components/welcome-header";
import { HeroStat, QuickActions } from "@/components/today/today-shell";
import { useCount, useList } from "@/lib/db-hooks";
import { LeadWorkspace } from "@/components/lead-workspace/lead-workspace";
import { QuickCreateLeadButton } from "@/components/today/quick-create";

const isoStartOfDay = () => { const d = new Date(); d.setHours(0,0,0,0); return d.toISOString(); };
const isoWeekAgo = () => { const d = new Date(); d.setDate(d.getDate()-7); return d.toISOString(); };
const isoMonthAgo = () => { const d = new Date(); d.setDate(d.getDate()-30); return d.toISOString(); };

export function MarketingHome() {
  const [overviewOpen, setOverviewOpen] = useState(false);
  const todayStart = isoStartOfDay();
  const weekAgo = isoWeekAgo();
  const monthAgo = isoMonthAgo();

  const todayLeads = useCount("leads", (q) => q.gte("created_at", todayStart), "today");
  const weekLeads  = useCount("leads", (q) => q.gte("created_at", weekAgo), "week");
  const monthLeads = useCount("leads", (q) => q.gte("created_at", monthAgo), "month");
  const recentEmails = useCount("email_threads", (q) => q.gte("last_message_at", weekAgo), "week-emails");

  const leadsList = useList<any>("leads", { order: "created_at", ascending: false });

  // Lead-forrás bontás (utolsó 30 nap)
  const monthLeadsList = (leadsList.data ?? []).filter((l: any) => l.created_at >= monthAgo);
  const sourceCounts: Record<string, number> = {};
  for (const l of monthLeadsList) {
    const s = l.source ?? "ismeretlen";
    sourceCounts[s] = (sourceCounts[s] ?? 0) + 1;
  }
  const sourceEntries = Object.entries(sourceCounts).sort((a, b) => b[1] - a[1]);
  const maxSource = Math.max(1, ...sourceEntries.map(([, n]) => n));

  return (
    <div className="flex flex-col">
      <WelcomeHeader subtitle="Marketing munkafelület — lead, email, utánkövetés, AI egy képernyőn." />

      <QuickActions>
        <QuickCreateLeadButton />
        <Button size="sm" variant="secondary" asChild><Link to="/emails"><Mail className="mr-1 h-3.5 w-3.5" />Levelek</Link></Button>
        <Button size="sm" variant="outline" asChild><Link to="/sales/research"><Radar className="mr-1 h-3.5 w-3.5" />Scarlet research</Link></Button>
      </QuickActions>

      {/* HERO: Lead Workspace teljes magasságban */}
      <LeadWorkspace
        mode="marketing"
        className="mx-6 mt-3 mb-4 grid h-[calc(100vh-220px)] min-h-[560px] grid-cols-1 overflow-hidden rounded-lg border bg-card lg:grid-cols-[280px_minmax(0,1fr)_320px]"
      />

      {/* Áttekintés (collapsible) */}
      <div className="px-6 pb-6">
        <button
          type="button"
          onClick={() => setOverviewOpen((v) => !v)}
          className="flex w-full items-center justify-between rounded-md border bg-card px-3 py-2 text-sm font-medium hover:bg-muted/40"
        >
          <span>Áttekintés · KPI-k és lead-források</span>
          {overviewOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>

        {overviewOpen && (
          <div className="mt-3 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <HeroStat to="/leads" tone="primary" icon={Sparkles} label="Új érdeklődő ma"   value={todayLeads.data ?? 0} sub="0–24 óra" />
              <HeroStat to="/leads" tone="info"    icon={TrendingUp} label="Új érdeklődő (7 nap)" value={weekLeads.data ?? 0} sub="utolsó hét" />
              <HeroStat to="/leads" tone="info"    icon={TrendingUp} label="Új érdeklődő (30 nap)" value={monthLeads.data ?? 0} sub="utolsó hónap" />
              <HeroStat to="/emails" tone="primary" icon={Mail}      label="Email szálak (7 nap)" value={recentEmails.data ?? 0} sub="aktív kommunikáció" />
            </div>
            <div className="rounded-lg border bg-card p-4">
              <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Lead-források · utolsó 30 nap</div>
              {sourceEntries.length === 0 ? (
                <div className="text-sm text-muted-foreground">Nincs lead az elmúlt 30 napban.</div>
              ) : (
                <ul className="space-y-2">
                  {sourceEntries.map(([src, n]) => (
                    <li key={src} className="flex items-center gap-3 text-sm">
                      <div className="w-32 truncate text-muted-foreground">{src}</div>
                      <div className="flex-1 h-5 rounded bg-muted/30 overflow-hidden">
                        <div className="h-full bg-primary/70" style={{ width: `${Math.round((n / maxSource) * 100)}%` }} />
                      </div>
                      <div className="w-10 text-right tabular-nums font-medium">{n}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}