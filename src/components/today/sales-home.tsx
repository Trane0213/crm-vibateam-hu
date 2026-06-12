import { Link } from "@tanstack/react-router";
import { AlertOctagon, BellRing, FileText, Sparkles, TrendingUp, Plus, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { WelcomeHeader } from "@/components/welcome-header";
import { HeroStat, SectionLabel, ListCard, QuickActions } from "@/components/today/today-shell";
import { useCount, useAggregateSum, useList } from "@/lib/db-hooks";
import { formatHuf } from "@/lib/format";
import { fmtDateTime } from "@/components/resource/resource-page";
import { tStatus } from "@/lib/i18n";

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

  const followups = useList<any>("followups", { order: "due_date", ascending: true });
  const quotes = useList<any>("quotes", { order: "created_at", ascending: false });
  const leads = useList<any>("leads", { order: "created_at", ascending: false });

  const todayList = (followups.data ?? []).filter((f: any) => !f.completed && f.due_date).slice(0, 6);
  const openQuoteList = (quotes.data ?? []).filter((q: any) => !["won","lost"].includes(q.status)).slice(0, 6);
  const recentLeads = (leads.data ?? []).slice(0, 5);

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

      <SectionLabel title="Mai fókusz" />
      <div className="grid gap-4 px-6 pb-6 lg:grid-cols-2">
        <ListCard
          title="Mai utókövetések"
          description="esedékesség szerint"
          to="/followups"
          empty={{ icon: BellRing, title: "Nincs nyitott utókövetés" }}
          items={todayList.map((f: any) => {
            const overdue = new Date(f.due_date) < new Date();
            return (
              <li key={f.id} className="flex items-center justify-between gap-3">
                <span className="truncate text-muted-foreground">{f.followup_type ?? "—"}</span>
                <span className={`tabular-nums ${overdue ? "text-destructive font-semibold" : ""}`}>{fmtDateTime(f.due_date)}</span>
              </li>
            );
          })}
        />

        <ListCard
          title="Nyitott ajánlataim"
          description="legutóbb létrehozva"
          to="/quotes"
          empty={{ icon: FileText, title: "Nincs nyitott ajánlat" }}
          items={openQuoteList.map((q: any) => (
            <li key={q.id} className="flex items-center justify-between gap-3">
              <Link to="/quotes/$id" params={{ id: q.id }} className="truncate text-primary hover:underline">
                {q.title ?? q.quote_number ?? "—"}
              </Link>
              <span className="flex items-center gap-2">
                <Badge variant="outline" className="font-normal">{tStatus("quote", q.status)}</Badge>
                <span className="tabular-nums text-muted-foreground">{q.total_amount != null ? formatHuf(q.total_amount) : "—"}</span>
              </span>
            </li>
          ))}
        />

        <ListCard
          title="Friss érdeklődők"
          description="utolsó 5"
          to="/leads"
          empty={{ icon: Sparkles, title: "Nincs érdeklődő" }}
          items={recentLeads.map((l: any) => (
            <li key={l.id} className="flex items-center justify-between gap-3">
              <Link to="/leads/$id" params={{ id: l.id }} className="truncate text-primary hover:underline">
                {l.title ?? l.name ?? "—"}
              </Link>
              <Badge variant="outline" className="font-normal">{tStatus("lead", l.status)}</Badge>
            </li>
          ))}
        />

        <div className="rounded-lg border bg-primary/[0.04] p-5">
          <div className="flex items-center gap-2 text-sm font-medium">
            <TrendingUp className="h-4 w-4 text-primary" /> Timothy — Értékesítési Segítő
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Kérj javaslatot a következő lépésre, gyors ajánlat-vázlatra vagy utókövetés-szövegre.
          </p>
          <div className="mt-3">
            <Button size="sm" asChild>
              <Link to="/ai-assistant" search={{ agent: "sales" } as any}>
                <Bot className="mr-1 h-3.5 w-3.5" /> Megnyitás
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}