import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Briefcase, Building2, CalendarClock, CheckCircle2, FileText, Radar, Send, Users } from "lucide-react";
import { WorkspacePanel } from "./workspace-panel";
import { OwnerKpiStrip } from "./owner-kpi-strip";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useDailyWork } from "@/lib/sales/use-daily-work";
import { DailyLeadRows } from "@/components/today/sales-worklists";
import { useSalesProjectSnapshot } from "@/lib/owner-kpis";
import { allDailyRows } from "@/lib/sales/load-daily-work";
import { ACTIVE_PROJECT_STATUSES, PROJECT_STATUS_LABEL } from "@/lib/viba-constants";
import { LEAD_STATUS_LABEL } from "@/lib/sales/constants";
import { NewQuoteButton } from "@/components/quotes/new-quote-button";

type Period = "7" | "30" | "90";
/** Projekthez kötött feladat a projekt Feladatok fülére, egyébként a Feladatok listára. */
const taskTarget = (task: { project_id: string | null }) => task.project_id
  ? ({ to: "/projects/$id", params: { id: task.project_id }, search: { tab: "tasks" } } as const)
  : ({ to: "/tasks" } as const);
const dateLabel = (iso: string) => new Intl.DateTimeFormat("hu-HU", { timeZone: "Europe/Budapest", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
export function OwnerWorkspace({ period = "30", detail = false }: { period?: Period; detail?: boolean }) {
  const daily = useDailyWork();
  const snapshot = useSalesProjectSnapshot();
  const tasks = useQuery({ queryKey: ["tasks", "owner-workspace"], queryFn: () => allDailyRows<{ id: string; title: string; status: string; due_date: string | null; project_id: string | null }>((from, to) => supabase.from("tasks").select("id,title,status,due_date,project_id").order("id").range(from, to)) });
  const projects = useQuery({ queryKey: ["projects", "owner-workspace"], queryFn: () => allDailyRows<{ id: string; title: string; status: string; project_manager_user_id: string | null }>((from, to) => supabase.from("projects").select("id,title,status,project_manager_user_id").order("id").range(from, to)) });
  const customers = useQuery({ queryKey: ["dashboard", "customer-composition"], queryFn: () => allDailyRows<{ id: string; company_type: string | null }>((from, to) => supabase.from("companies").select("id,company_type").order("id").range(from, to)) });
  const campaigns = useQuery({ queryKey: ["email_campaigns", "owner-workspace"], queryFn: () => allDailyRows<{ id: string; name: string; status: string }>((from, to) => supabase.from("email_campaigns").select("id,name,status").order("id").range(from, to)) });
  const now = new Date();
  const due = (tasks.data ?? []).filter(task => task.status !== "done" && task.due_date).sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""));
  const overdue = due.filter(task => task.due_date && Date.parse(task.due_date) < now.getTime());
  const handoff = (projects.data ?? []).filter(project => project.status === "atadas" || !project.project_manager_user_id);
  const active = (projects.data ?? []).filter(project => ACTIVE_PROJECT_STATUSES.includes(project.status as typeof ACTIVE_PROJECT_STATUSES[number]));
  const recent = daily.data?.leads.filter(lead => lead.created_at && Date.parse(lead.created_at) >= now.getTime() - Number(period) * 86400000) ?? [];
  const people = customers.data?.filter(customer => customer.company_type === "maganszemely").length ?? 0;
  const businesses = customers.data ? customers.data.length - people : 0;
  const statusRows = Object.entries(LEAD_STATUS_LABEL).filter(([status]) => status !== "won" && status !== "lost").map(([status, label]) => ({ status, label, count: recent.filter(lead => lead.status === status).length }));
  const available = (query: { isError: boolean; isPending: boolean }) => query.isError ? "Nem elérhető" : query.isPending ? "Betöltés…" : null;
  return <div className="space-y-4">
    {!detail && <OwnerKpiStrip overview />}
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_260px]">
      <div className="min-w-0 space-y-4">
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.1fr)]">
          <WorkspacePanel title="Értékesítési áttekintés" subtitle={`Az utolsó ${period} napban felvett, jelenleg nyitott ügyek`} to="/sales/leads">
            <div className="space-y-3 p-4">{available(daily) ? <p role={daily.isError ? "alert" : undefined} className="text-sm text-muted-foreground">{available(daily)}</p> : !recent.length ? <p className="py-6 text-sm text-muted-foreground">Ebben az időszakban nincs nyitott új ügy.</p> : statusRows.map(row => <Link key={row.status} to="/sales/leads" className="block"><div className="mb-1.5 flex justify-between gap-2 text-xs"><span>{row.label}</span><strong>{row.count}</strong></div><Progress value={recent.length ? row.count / recent.length * 100 : 0} /></Link>)}</div>
          </WorkspacePanel>
          <WorkspacePanel title="Ügyfélkör megoszlása" to="/customers">
            <div className="p-4">{available(customers) ? <p className="text-sm text-muted-foreground">{available(customers)}</p> : <><div className="relative mx-auto my-3 h-32 w-32"><svg viewBox="0 0 120 120" role="img" aria-label={`${businesses} cég vagy más típus, ${people} magánszemély`} className="h-full w-full -rotate-90"><circle cx="60" cy="60" r="48" fill="none" strokeWidth="12" className="stroke-status-info/40" /><circle cx="60" cy="60" r="48" fill="none" strokeWidth="12" className="stroke-primary" strokeDasharray={`${customers.data?.length ? businesses / customers.data.length * 301.59 : 0} 301.59`} /></svg><div className="absolute inset-0 flex flex-col items-center justify-center"><strong className="font-display text-3xl">{customers.data?.length}</strong><span className="text-xs text-muted-foreground">ügyfél</span></div></div><div className="space-y-3"><Link to="/customers" className="flex items-center gap-2 text-xs"><Building2 className="h-4 w-4 text-primary" /><span className="flex-1">Cégek / más típus</span><strong>{businesses}</strong></Link><Link to="/customers" className="flex items-center gap-2 text-xs"><Users className="h-4 w-4 text-status-info" /><span className="flex-1">Magánszemélyek</span><strong>{people}</strong></Link></div></>}</div>
          </WorkspacePanel>
          <WorkspacePanel title="Döntést igénylő ügyek" subtitle="Mentett teendők és projektátadások">
            <div className="divide-y">{available(projects) || available(tasks) ? <p className="p-4 text-sm text-muted-foreground">Az ügylista {projects.isError || tasks.isError ? "nem elérhető." : "betöltődik…"}</p> : <>{handoff.slice(0, 3).map(project => <Link key={project.id} to="/projects/$id" params={{ id: project.id }} search={{ tab: project.status === "atadas" ? "handover" : "overview" }} className="flex gap-2 p-3 text-xs hover:bg-muted/40"><Briefcase className="h-4 w-4 shrink-0 text-status-warning" /><div className="min-w-0"><strong className="block truncate">{project.title}</strong><span className="text-muted-foreground">{!project.project_manager_user_id ? "Felelős kijelölése" : "Projektátadás"}</span></div></Link>)}{overdue.slice(0, 3).map(task => <Link key={task.id} {...taskTarget(task)} className="flex gap-2 p-3 text-xs hover:bg-muted/40"><AlertTriangle className="h-4 w-4 shrink-0 text-destructive" /><div className="min-w-0"><strong className="block truncate">{task.title}</strong><span className="text-muted-foreground">Lejárt · {task.due_date ? dateLabel(task.due_date) : "—"}</span></div></Link>)}{!handoff.length && !overdue.length && <p className="flex gap-2 p-4 text-sm text-muted-foreground"><CheckCircle2 className="h-4 w-4 text-status-success" />Nincs kiemelt döntési teendő.</p>}</>}</div>
          </WorkspacePanel>
        </div>
        <WorkspacePanel title="Legfontosabb folyamatok állapota" to="/dashboard">
          <div className="divide-y text-sm">
            {[{ label: "Értékesítés · Pipeline", to: "/sales/leads", value: snapshot.data ? `${snapshot.data.pipeline} nyitott · ${snapshot.data.salesPrep} előkészítés` : available(snapshot), icon: FileText }, { label: "Marketing · kampányok", to: "/campaign-list", value: campaigns.data ? `${campaigns.data.length} kampány · ${campaigns.data.filter(c => c.status === "draft").length} tervezet` : available(campaigns), icon: Send }, { label: "Projektek", to: "/projects", value: projects.data ? `${active.length} aktív · ${handoff.length} átadási / felelősi teendő` : available(projects), icon: Briefcase }].map(row => <Link key={row.label} to={row.to} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 sm:grid-cols-[minmax(140px,.7fr)_minmax(0,1fr)_auto] hover:bg-muted/40"><span className="flex items-center gap-2 font-medium"><row.icon className="h-4 w-4 shrink-0 text-primary" />{row.label}</span><span className="col-span-2 text-xs text-muted-foreground sm:col-span-1">{row.value}</span><span className="hidden text-primary sm:block">→</span></Link>)}
            <Link to="/data-quality" className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40"><span className="flex items-center gap-2 font-medium"><Radar className="h-4 w-4 text-status-warning" />Adatminőség</span><span className="text-xs text-primary">Ellenőrzési lista →</span></Link>
          </div>
        </WorkspacePanel>
        {!detail && <WorkspacePanel title="Csapat · napi prioritások" to="/sales/todo">{daily.data ? <DailyLeadRows leads={[...daily.data.buckets.overdue, ...daily.data.buckets.today].slice(0, 6)} /> : <p className="p-4 text-sm text-muted-foreground">{available(daily)}</p>}</WorkspacePanel>}
        {detail && <WorkspacePanel title="Aktív projektek" to="/projects"><div className="divide-y">{active.map(project => <Link key={project.id} to="/projects/$id" params={{ id: project.id }} className="flex items-center justify-between gap-3 p-3 text-sm hover:bg-muted/40"><span className="truncate">{project.title}</span><Badge variant="outline">{PROJECT_STATUS_LABEL[project.status as keyof typeof PROJECT_STATUS_LABEL] ?? project.status}</Badge></Link>)}{!active.length && <p className="p-4 text-sm text-muted-foreground">{available(projects) ?? "Nincs aktív projekt."}</p>}</div></WorkspacePanel>}
      </div>
      <aside className="space-y-4">
        <WorkspacePanel title="Gyors műveletek"><div className="grid grid-cols-2 gap-2 p-3"><div className="[&>button]:h-full [&>button]:w-full [&>button]:whitespace-normal"><NewQuoteButton variant="outline" /></div><Button asChild variant="outline" className="h-auto flex-col gap-2 py-4 text-xs"><Link to="/projects" search={{ new: 1 }}><Briefcase />Új projekt</Link></Button><Button asChild variant="outline" className="h-auto flex-col gap-2 py-4 text-xs"><Link to="/customers"><Users />Ügyfelek</Link></Button><Button asChild variant="outline" className="h-auto flex-col gap-2 py-4 text-xs"><Link to="/campaign-list"><Send />Kampányok</Link></Button></div></WorkspacePanel>
        <WorkspacePanel title="Közelgő határidők" to="/tasks"><div className="divide-y">{due.filter(task => task.due_date && Date.parse(task.due_date) >= now.getTime()).slice(0, 5).map(task => <Link key={task.id} {...taskTarget(task)} className="flex gap-2 p-3 text-xs hover:bg-muted/40"><CalendarClock className="h-4 w-4 shrink-0 text-primary" /><div className="min-w-0"><strong className="block truncate">{task.title}</strong><span className="mt-1 block text-muted-foreground">{task.due_date ? dateLabel(task.due_date) : "—"}</span></div></Link>)}</div>{!due.some(task => task.due_date && Date.parse(task.due_date) >= now.getTime()) && <p className="p-4 text-xs text-muted-foreground">{available(tasks) ?? "Nincs közelgő mentett határidő."}</p>}</WorkspacePanel>
      </aside>
    </div>
  </div>;
}