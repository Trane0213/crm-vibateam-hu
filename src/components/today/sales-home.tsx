import { Sparkles, FileText, CalendarClock, TrendingUp, Trophy, ArrowRight, ListChecks, CheckCircle2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { WelcomeHeader } from "@/components/welcome-header";
import { HeroStat } from "@/components/today/today-shell";
import { DailyLeadRows } from "@/components/today/sales-worklists";
import { useDailyWork } from "@/lib/sales/use-daily-work";
import { TimothyDaily } from "@/components/ai/timothy-daily";
import { WorkspacePanel } from "@/components/dashboard/workspace-panel";
import { salesWorkspaceView, salesLeadName } from "@/lib/sales/workspace-view";
import { NEXT_STEP_LABEL, type NextStepType } from "@/lib/sales/constants";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

export function SalesHome() {
  const query = useDailyWork();
  const d = query.data;
  const view = d ? salesWorkspaceView(d) : null;
  const v = (n: number | undefined) => query.isError ? "—" : n ?? "…";
  const sub = query.isError ? "nem elérhető" : undefined;
  return <div className="crm-today flex flex-col">
    <WelcomeHeader title="Mai feladataim" subtitle="Saját teendők, lehetőségek és következő lépések." />
    <div className="space-y-4 px-4 py-4 sm:px-6">
      <section aria-label="Értékesítési áttekintés" className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        <HeroStat to="/sales/todo" search={{ bucket: "today" }} tone="success" icon={ListChecks} label="Mai feladatok" value={v(d?.buckets.today.length)} sub={sub ?? "saját ügyek"} />
        <HeroStat to="/sales/leads" tone="info" icon={TrendingUp} label="Aktív Pipeline" value={v(d?.overview?.pipeline)} sub={sub ?? "folyamatban lévő ügyek"} />
        <HeroStat to="/quotes" tone="primary" icon={FileText} label="Nyitott ajánlatok" value={v(d?.overview?.openQuotes)} sub={sub ?? "kiküldött, aktuális"} />
        <HeroStat to="/sales/leads" tone="success" icon={Trophy} label="Zárás előtt" value={v(view?.closing)} sub={sub ?? "szerződés szakasz"} />
        <HeroStat to="/leads" tone="warning" icon={Sparkles} label="Sales-előkészítés" value={v(d?.overview?.prep)} sub={sub ?? "Pipeline előtt"} />
      </section>
      {query.isError && <p role="alert" className="text-sm text-destructive">A Sales-adatok betöltése sikertelen: {query.error.message}</p>}
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1.35fr)_minmax(230px,.8fr)]">
        <WorkspacePanel title={`Mai teendők${view ? ` (${view.focus.length})` : ""}`} subtitle="Lejárt, mai, új és ellenőrizendő ügyek" to="/sales/todo">
          {!view ? <p className="p-4 text-sm text-muted-foreground">{query.isError ? "A teendők nem érhetők el." : "Betöltés…"}</p> : !view.focus.length ? <div className="flex gap-3 p-5 text-sm"><CheckCircle2 className="h-5 w-5 shrink-0 text-status-success" /><div>Nincs mai teendőd.<p className="mt-1 text-xs text-muted-foreground">A következő egyeztetéseket külön láthatod.</p></div></div> : <DailyLeadRows leads={view.focus.slice(0, 8)} />}
          {!!view && view.focus.length > 8 && <Link to="/sales/todo" search={{ bucket: "today" }} className="block border-t p-3 text-xs text-primary">Összes teendő ({view.focus.length}) →</Link>}
        </WorkspacePanel>
        <WorkspacePanel title={`Értékesítési pipeline${d ? ` (${d.overview?.pipeline ?? 0})` : ""}`} subtitle="Meglévő szakaszok · saját ügyek" to="/sales/leads">
          <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-4">
            {(view?.stages ?? []).map(stage => <div key={stage.key} className="min-w-0">
              <div data-tone={stage.tone} className="crm-stat mb-2 rounded-md border px-2 py-2 text-xs font-semibold">{stage.title} ({stage.rows.length})</div>
              <ul className="space-y-2">{stage.rows.slice(0, 4).map(lead => <li key={lead.id}><Link to="/leads" search={{ lead: lead.id }} className="block rounded-md border bg-background p-2 text-xs transition hover:bg-muted"><span className="block break-words font-semibold">{salesLeadName(lead)}</span><span className="mt-1 block text-muted-foreground">{NEXT_STEP_LABEL[lead.next_step_type as NextStepType] ?? "Következő lépés hiányzik"}</span></Link></li>)}</ul>
              {!stage.rows.length && <p className="px-1 py-3 text-xs text-muted-foreground">Nincs ügy</p>}
              {stage.rows.length > 4 && <Link to="/sales/leads" className="mt-2 block text-xs text-primary">+{stage.rows.length - 4} ügy →</Link>}
            </div>)}
            {!view && <p className="col-span-full py-4 text-sm text-muted-foreground">{query.isError ? "A Pipeline nem érhető el." : "Betöltés…"}</p>}
          </div>
        </WorkspacePanel>
        <aside className="min-w-0 space-y-4">
          <WorkspacePanel title="Saját eredményem" subtitle="Aktuális állomány · nem havi bevétel">
            <div className="space-y-4 p-4">{[{ label: "Megnyert ügyek · összesen", value: d?.overview?.won, total: undefined }, { label: "Kiküldött nyitott ajánlatok", value: d?.overview?.openQuotes, total: d?.leads.length }, { label: "Aktív Pipeline", value: d?.overview?.pipeline, total: d?.leads.length }].map(item => <div key={item.label}><div className="mb-2 flex justify-between gap-2 text-xs"><span>{item.label}</span><strong>{v(item.value)}</strong></div>{item.total != null && item.total > 0 && <Progress value={Math.min(100, ((item.value ?? 0) / item.total) * 100)} />}</div>)}</div>
          </WorkspacePanel>
          <WorkspacePanel title="Következő egyeztetések" to="/sales/todo">
            <div className="divide-y">{view?.upcoming.slice(0, 4).map(lead => <Link key={lead.id} to="/leads" search={{ lead: lead.id }} className="flex items-start gap-2 p-3 text-xs hover:bg-muted/40"><CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><div className="min-w-0"><span className="block truncate font-semibold">{salesLeadName(lead)}</span><span className="mt-1 block text-muted-foreground">{lead.next_step_due_at ? new Intl.DateTimeFormat("hu-HU", { timeZone: "Europe/Budapest", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(lead.next_step_due_at)) : "—"}</span></div></Link>)}</div>
            {view && !view.upcoming.length && <p className="p-4 text-xs text-muted-foreground">Nincs mentett következő egyeztetés.</p>}
          </WorkspacePanel>
        </aside>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs"><Badge variant="outline">Lejárt: {v(d?.buckets.overdue.length)}</Badge><Badge variant="outline">Ma: {v(d?.buckets.today.length)}</Badge><Badge variant="outline">Későbbi: {v(d ? d.buckets.tomorrow.length + d.buckets.later.length : undefined)}</Badge><Badge variant="outline">Új: {v(d?.newLeads.length)}</Badge></div>
      <nav aria-label="Sales gyorsbelépők" className="flex flex-wrap gap-2 border-t pt-4">
        <Button asChild variant="outline" size="sm"><Link to="/leads"><Sparkles />Sales-előkészítés<ArrowRight /></Link></Button>
        <Button asChild variant="outline" size="sm"><Link to="/sales/leads"><TrendingUp />Pipeline<ArrowRight /></Link></Button>
        <Button asChild variant="outline" size="sm"><Link to="/quotes"><FileText />Ajánlatok<ArrowRight /></Link></Button>
        <Button asChild variant="outline" size="sm"><Link to="/sales/todo" search={{ bucket: "today" }}><ListChecks />Következő teendők<ArrowRight /></Link></Button>
      </nav>
      <details className="border-t pt-3"><summary className="cursor-pointer text-sm font-semibold">Timothy · napi fókusz és ügyjelzések</summary><div className="pt-3"><TimothyDaily /></div></details>
    </div>
  </div>;
}
