import { Link } from "@tanstack/react-router";
import { Sparkles, Mail, Radar, Plus, Bot, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { WelcomeHeader } from "@/components/welcome-header";
import { HeroStat, SectionLabel, ListCard, QuickActions } from "@/components/today/today-shell";
import { useCount, useList } from "@/lib/db-hooks";
import { fmtDateTime } from "@/components/resource/resource-page";
import { tStatus } from "@/lib/i18n";

const isoStartOfDay = () => { const d = new Date(); d.setHours(0,0,0,0); return d.toISOString(); };
const isoWeekAgo = () => { const d = new Date(); d.setDate(d.getDate()-7); return d.toISOString(); };
const isoMonthAgo = () => { const d = new Date(); d.setDate(d.getDate()-30); return d.toISOString(); };

export function MarketingHome() {
  const todayStart = isoStartOfDay();
  const weekAgo = isoWeekAgo();
  const monthAgo = isoMonthAgo();

  const todayLeads = useCount("leads", (q) => q.gte("created_at", todayStart), "today");
  const weekLeads  = useCount("leads", (q) => q.gte("created_at", weekAgo), "week");
  const monthLeads = useCount("leads", (q) => q.gte("created_at", monthAgo), "month");
  const recentEmails = useCount("email_threads", (q) => q.gte("last_message_at", weekAgo), "week-emails");

  const leadsList = useList<any>("leads", { order: "created_at", ascending: false });
  const recentLeads = (leadsList.data ?? []).slice(0, 10);

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
      <WelcomeHeader subtitle="Marketing áttekintés — új érdeklődők, források, kampányok." />

      <QuickActions>
        <Button size="sm" asChild><Link to="/leads" search={{ new: 1 } as any}><Plus className="mr-1 h-3.5 w-3.5" />Új érdeklődő</Link></Button>
        <Button size="sm" variant="secondary" asChild><Link to="/emails"><Mail className="mr-1 h-3.5 w-3.5" />Levelek</Link></Button>
        <Button size="sm" variant="outline" asChild><Link to="/sales/research"><Radar className="mr-1 h-3.5 w-3.5" />Scarlet research</Link></Button>
      </QuickActions>

      <div className="px-6 pt-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <HeroStat to="/leads" tone="primary" icon={Sparkles} label="Új érdeklődő ma"   value={todayLeads.data ?? 0} sub="0–24 óra" />
          <HeroStat to="/leads" tone="info"    icon={TrendingUp} label="Új érdeklődő (7 nap)" value={weekLeads.data ?? 0} sub="utolsó hét" />
          <HeroStat to="/leads" tone="info"    icon={TrendingUp} label="Új érdeklődő (30 nap)" value={monthLeads.data ?? 0} sub="utolsó hónap" />
          <HeroStat to="/emails" tone="primary" icon={Mail}      label="Email szálak (7 nap)" value={recentEmails.data ?? 0} sub="aktív kommunikáció" />
        </div>
      </div>

      <SectionLabel title="Lead-források · utolsó 30 nap" />
      <div className="px-6">
        <div className="rounded-lg border bg-card p-4">
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

      <SectionLabel title="Friss érdeklődők" />
      <div className="grid gap-4 px-6 pb-6 lg:grid-cols-2">
        <ListCard
          title="Új érdeklődők"
          description="utolsó 10"
          to="/leads"
          empty={{ icon: Sparkles, title: "Nincs érdeklődő" }}
          items={recentLeads.map((l: any) => (
            <li key={l.id} className="flex items-center justify-between gap-3">
              <Link to="/leads/$id" params={{ id: l.id }} className="truncate text-primary hover:underline">
                {l.title ?? l.name ?? "—"}
              </Link>
              <span className="flex items-center gap-2">
                <Badge variant="outline" className="font-normal">{l.source ?? "—"}</Badge>
                <span className="tabular-nums text-muted-foreground text-xs">{fmtDateTime(l.created_at)}</span>
                <Badge variant="outline" className="font-normal">{tStatus("lead", l.status)}</Badge>
              </span>
            </li>
          ))}
        />

        <div className="rounded-lg border bg-primary/[0.04] p-5">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Radar className="h-4 w-4 text-primary" /> Scarlet — Marketing Stratéga
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Versenytárs-kutatás, kampány-ötletek, célcsoport-elemzés egy chat-ben.
          </p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" asChild><Link to="/sales/research"><Radar className="mr-1 h-3.5 w-3.5" />Megnyitás</Link></Button>
            <Button size="sm" variant="outline" asChild><Link to="/ai-assistants"><Bot className="mr-1 h-3.5 w-3.5" />Összes AI</Link></Button>
          </div>
        </div>
      </div>
    </div>
  );
}