import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/page-header";
import {
  Briefcase, FileText, BellRing, Phone, Calendar, FolderOpen, UserPlus, StickyNote, History, Trash2, ListChecks, Mail,
  ArrowLeft, ClipboardCheck, Camera, CheckCircle2, AlertTriangle, Circle, Plus, Users, Zap, Loader2,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { formatHuf } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { useListWhere, humanizeSupabaseError, useUpsert } from "@/lib/db-hooks";
import { fmtDate, fmtDateTime, useLookup } from "@/components/resource/resource-page";
import { DocumentManager, type DocCategory } from "@/components/documents/document-manager";
import { ProjectTimeline } from "@/components/projects/project-timeline";
import { toast } from "sonner";
import { AiSummaryDialog } from "@/components/ai/ai-summary-dialog";
import { loadProjectSnapshotText } from "@/lib/ai-os/snapshots.functions";
import { ProjectStatusSelect } from "@/components/projects/project-status-select";
import { ProjectContactsPanel } from "@/components/projects/project-contacts-panel";
import { ProjectEmailAttach } from "@/components/projects/project-email-attach";
import { PROJECT_STATUS_LABEL, PROJECT_CONTACT_ROLE_LABEL, COMPANY_TYPE_LABEL } from "@/lib/viba-constants";
import { useAssigneeLookup } from "@/lib/sales/use-assignee-name";
import { usePermissions } from "@/hooks/use-permissions";
import { canAccessRoute } from "@/lib/permissions";
import { NEXT_STEP_LABEL } from "@/lib/sales/constants";
import { LEAD_SOURCE_LABEL } from "@/lib/marketing-status";
import { tStatus } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { PrimaryActionCard, ReadinessList } from "@/components/sales/sales-flow-ui";
import { listEntries, listProjects } from "@/lib/attendance/attendance.functions";
import { attendanceToday } from "@/lib/attendance/attendance-dates";
import {
  budapestYmd, classifyTask, handoverReadiness, pmNextAction, pmProjectSteps, pmTabFromSearch, projectDay,
  type PmAttendanceEntry, type PmAttendanceProject, type PmProjectDay, type PmTab, type PmTask, type StepState,
} from "@/lib/pm/pm-day-flow";
import { handoffNext, handoffSummary, HANDOFF_ROLE_LABEL, type HandoffItem, type HandoffSummary } from "@/lib/handoff/sales-pm-handoff";
import { HandoffChecklist, HandoffNotInCrm, HandoffPhaseBadge } from "@/components/handoff/handoff-checklist";
import { ProjectBasicsForm } from "@/components/handoff/project-basics-form";
import { handoffEditRights } from "@/lib/handoff/project-basics";

export const Route = createFileRoute("/_authenticated/projects/$id")({
  head: () => ({ meta: [
    { title: "Projekt adatlap – napi munka | VIBA CRM" },
    { name: "description", content: "Kivitelezési projekt napi munkája: feladatok, felelősök, napi lap, dokumentumok és átadás-előkészítés." },
    { property: "og:title", content: "Projekt adatlap – napi munka | VIBA CRM" },
    { property: "og:description", content: "Feladatok, napi lap, dokumentumok és átadás-előkészítés egy helyen." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  // `?tab=`: csak a megnyitott fület választja ki (pl. a Mai projektmunka „Következő teendő” gombjáról).
  validateSearch: (s: Record<string, unknown>): { tab?: PmTab } => {
    const tab = pmTabFromSearch(s.tab);
    return tab ? { tab } : {};
  },
  component: ProjectDetail,
});

function useProject(id: string) {
  return useQuery({
    queryKey: ["projects", "detail", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data as Record<string, any> | null;
    },
  });
}

const STEP_ICON: Record<StepState, typeof CheckCircle2> = { ok: CheckCircle2, warn: Circle, missing: AlertTriangle };
const STEP_TONE: Record<StepState, string> = {
  ok: "text-[color:var(--status-success)]",
  warn: "text-[color:var(--status-warning)]",
  missing: "text-destructive",
};

function ProjectDetail() {
  const { id } = Route.useParams();
  const search = Route.useSearch();
  const [tab, setTab] = useState<PmTab>(search.tab ?? "overview");
  // Másik projektre vagy más ?tab= értékre lépve a fül a linknek megfelelően áll be.
  useEffect(() => { setTab(search.tab ?? "overview"); setDocFilter("all"); }, [id, search.tab]);
  const [docFilter, setDocFilter] = useState<"all" | DocCategory>("all");
  const openDocs = (f: "all" | DocCategory) => { setDocFilter(f); setTab("docs"); };

  const { data: project, isLoading, error, refetch } = useProject(id);
  const companyLabel = useLookup("companies", "name");
  const assigneeName = useAssigneeLookup();
  const { role } = usePermissions();
  const canAttendance = role === "owner" || role === "project_manager";

  const quotes = useListWhere<any>("quotes", "project_id", id, { order: "created_at", ascending: false });
  const followups = useListWhere<any>("followups", "project_id", id, { order: "due_date", ascending: true });
  const calls = useListWhere<any>("phone_calls", "project_id", id, { order: "created_at", ascending: false });
  const meetings = useListWhere<any>("meetings", "project_id", id, { order: "meeting_date", ascending: true });
  const docs = useListWhere<any>("project_documents", "project_id", id, { order: "created_at", ascending: false });
  const notes = useListWhere<any>("project_notes", "project_id", id, { order: "created_at", ascending: false });
  const tasks = useListWhere<any>("tasks", "project_id", id, { order: "due_date", ascending: true });
  const emailThreads = useListWhere<any>("email_threads", "project_id", id, { order: "last_message_at", ascending: false });
  const projectContacts = useQuery({
    queryKey: ["project_contacts", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_contacts")
        .select("id, role, contact:contacts(id,name,email,phone,position)")
        .eq("project_id", id);
      if (error) throw error;
      return data ?? [];
    },
  });
  const company = useQuery({
    queryKey: ["company", project?.company_id],
    enabled: !!project?.company_id,
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("id,name,company_type").eq("id", project!.company_id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  // Jelenléti napló (külön projektlista) — csak tulajdonos/projektvezető olvashatja.
  const today = attendanceToday();
  const listAttProjects = useServerFn(listProjects);
  const listAttEntries = useServerFn(listEntries);
  const attProjects = useQuery({
    queryKey: ["att", "projects", "pm-day"],
    enabled: canAttendance,
    staleTime: 60_000,
    queryFn: async () => (await listAttProjects()).rows as PmAttendanceProject[],
  });
  const attEntries = useQuery({
    queryKey: ["att", "entries", "pm-day", today],
    enabled: canAttendance,
    queryFn: async () => (await listAttEntries({ data: { from: today, to: today } })).rows as unknown as PmAttendanceEntry[],
  });

  const totalQuoteValue = (quotes.data ?? []).reduce(
    (a, r) => a + (Number(r.total_amount) || 0),
    0,
  );
  const openFollowups = (followups.data ?? []).filter((r) => !r.completed);
  const nextFollowup = openFollowups[0]?.due_date as string | undefined;
  const lastComm = (() => {
    const dates: number[] = [];
    for (const e of calls.data ?? []) if (e.created_at) dates.push(new Date(e.created_at).getTime());
    for (const e of meetings.data ?? []) if (e.meeting_date) dates.push(new Date(e.meeting_date).getTime());
    if (!dates.length) return null;
    return new Date(Math.max(...dates)).toISOString();
  })();
  const primaryContact = (() => {
    const list = (projectContacts.data ?? []) as any[];
    const primary = list.find((c) => c.is_primary) ?? list[0];
    return primary?.contact ?? null;
  })();

  if (isLoading) {
    return <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Projekt betöltése…</div>;
  }
  if (error) {
    return (
      <div className="space-y-3 p-6">
        <EmptyState icon={Briefcase} title="A projekt nem tölthető be" description={humanizeSupabaseError(error)} />
        <div className="flex justify-center gap-2">
          <Button size="sm" variant="outline" onClick={() => refetch()}>Újrapróbálás</Button>
          <Button size="sm" variant="ghost" asChild><Link to="/projects">Vissza a projektekhez</Link></Button>
        </div>
      </div>
    );
  }
  if (!project) {
    return (
      <div className="space-y-3 p-6">
        <EmptyState icon={Briefcase} title="A projekt nem található" description="Nincs ilyen projekt, vagy a szerepköröddel nem látható. Ellenőrizd a linket." />
        <div className="flex justify-center"><Button size="sm" variant="outline" asChild><Link to="/projects">Vissza a projektekhez</Link></Button></div>
      </div>
    );
  }

  const coreReady = tasks.isSuccess && docs.isSuccess && notes.isSuccess;
  const day = projectDay(
    { ...project, id, title: project.title ?? null, status: project.status ?? null } as any,
    {
      tasks: (tasks.data ?? []) as PmTask[],
      docs: docs.data ?? [],
      notes: notes.data ?? [],
      attendanceProjects: attProjects.data ?? [],
      attendanceEntries: attEntries.data ?? [],
    },
  );
  const next = pmNextAction(day);
  const steps = pmProjectSteps(day);
  const readiness = handoverReadiness(day, { hasContact: (projectContacts.data ?? []).length > 0 });
  const openTasksCount = day.openTasks.length;
  const canEditTasks = role === "owner" || role === "project_manager" || role === "sales";
  // Sales → PM átadás: ugyanaz a szabály, mint George szervezeti jelzéseinél. Be nem töltött forrás = NINCS ADAT.
  const handoff = handoffSummary({
    project: { ...project, id } as any,
    quoteCount: quotes.isSuccess ? (quotes.data ?? []).length : null,
    acceptedCount: quotes.isSuccess ? (quotes.data ?? []).filter((q) => q.status === "accepted").length : null,
    contactCount: projectContacts.isSuccess ? (projectContacts.data ?? []).length : null,
    contractDocCount: docs.isSuccess ? (docs.data ?? []).filter((d) => d.document_type === "contract").length : null,
    taskCount: tasks.isSuccess ? (tasks.data ?? []).length : null,
  });
  const handoffReady = quotes.isSuccess && projectContacts.isSuccess && docs.isSuccess && tasks.isSuccess;
  const handoffStep = handoffNext(handoff, role);
  const rights = handoffEditRights(role);
  const canEditBasics = rights.basics;
  const canOpenLeads = canAccessRoute(role, "/leads");
  const backLink = role === "owner" ? "Mai vezetői munka" : role === "sales" ? "Ma" : "Mai projektmunka";
  const scrollTo = (elId: string) => requestAnimationFrame(() => document.getElementById(elId)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  const fixHandoff = (i: HandoffItem) => {
    if (i.fix.kind === "tab") { if (i.key === "contract_doc") openDocs("contract"); else setTab(i.fix.tab); return; }
    if (i.fix.kind === "basics") { setTab("handover"); scrollTo("projekt-alapadatok"); return; }
    if (i.fix.kind === "status") { scrollTo("projekt-allapot"); return; }
  };
  const fixLabel = (i: HandoffItem): string | null => {
    if (i.state === "ok" || i.state === "not_linked" || i.state === "unknown") return null;
    switch (i.key) {
      case "pm": return rights.assignPm ? "Projektvezető kijelölése" : null;
      case "address": case "deadline": return canEditBasics ? "Pótlás" : null;
      case "tasks": return "Feladatok";
      case "start": return "Állapot a fejlécben";
      case "quote": case "accepted": return "Ajánlatok";
      case "contact": return "Kapcsolatok";
      case "contract_doc": return "Szerződés feltöltése";
      case "summary": return "Projektjegyzet";
      default: return null;
    }
  };

  return (
    <div className="flex flex-col">
      {/* HEADER */}
      <div className="border-b bg-background px-4 py-4 sm:px-6">
        <Link to="/today" className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary">
          <ArrowLeft className="h-3.5 w-3.5" />{backLink}
        </Link>
        {project.lead_id && canOpenLeads && (
          <Link to="/leads/$id" params={{ id: project.lead_id }} className="mb-2 ml-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary">
            Megnyert Sales-ügy
          </Link>
        )}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Ügyfél</div>
            {project.company_id ? (
              <Link
                to="/customers/$id"
                params={{ id: project.company_id }}
                className="break-words text-lg font-semibold text-primary hover:underline"
              >
                {companyLabel(project.company_id)}
              </Link>
            ) : (
              <div className="text-lg font-semibold text-muted-foreground">— (nincs ügyfél)</div>
            )}
            <div className="mt-2 text-[11px] uppercase tracking-wider text-muted-foreground">Projekt</div>
            <h1 className="break-words text-xl font-semibold">{project.title ?? project.name ?? `#${id.slice(0, 8)}`}</h1>
            {project.address && (
              <div className="mt-1 text-sm text-muted-foreground">{project.address}</div>
            )}
            <div className="mt-1 text-xs text-muted-foreground">
              Projektvezető: <span className="font-medium text-foreground">{assigneeName(project.project_manager_user_id ?? (project.handoff_payload as any)?.project_manager_user_id ?? null)}</span>
              {project.deadline && <> · Határidő: <span className={cn("font-medium", day.deadline.passed ? "text-destructive" : "text-foreground")}>{fmtDate(project.deadline)}</span></>}
            </div>
          </div>
          <div id="projekt-allapot" className="flex flex-wrap items-center gap-2">
            <ProjectStatusSelect projectId={id} value={project.status} />
            <Badge variant="outline">{formatHuf(totalQuoteValue)}</Badge>
            <AiSummaryDialog
              title={`Projekt összefoglaló: ${project.title ?? project.name ?? ""}`}
              description="Az AI a projekt aktuális adataiból készít üzleti összefoglalót."
              triggerLabel="AI Összefoglaló"
              loadContext={async () => (await loadProjectSnapshotText({ data: { projectId: id } })).text}
              prompt={[
                "Készíts üzleti összefoglalót a megadott projektről.",
                "Térj ki az alábbiakra, csak ami adatból kiderül:",
                "1) Projekt állapot (státusz, határidő, cég).",
                "2) Ajánlatok (darab, összérték, legutóbbi státusz).",
                "3) Nyitott feladatok (mennyi, mi a legsürgősebb).",
                "4) Dokumentumok (van-e, mennyi).",
                "5) Utókövetésok (van-e lejárt, mikor a következő).",
                "Zárj 2–3 mondatos vezetői üzenettel: hol áll a projekt és mi a legfontosabb teendő.",
              ].join(" ")}
            />
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Mini label="Ajánlatok" value={`${quotes.data?.length ?? 0} db`} tone="primary" onClick={() => setTab("quotes")} />
          <Mini label="Köv. utókövetés" value={nextFollowup ? fmtDateTime(nextFollowup) : "—"} tone={nextFollowup && new Date(nextFollowup) < new Date() ? "danger" : "warning"} onClick={() => setTab("followups")} />
          <Mini label="Nyitott feladat / utókövetés" value={`${openTasksCount} / ${openFollowups.length}`} tone={day.overdue.length ? "danger" : "info"} onClick={() => setTab("tasks")} />
          <Mini label="Utolsó aktivitás" value={lastComm ? fmtDate(lastComm) : "—"} onClick={() => setTab("timeline")} />
        </div>
        {company.data && (
          <div className="mt-2 text-xs text-muted-foreground">
            Cégtípus: <span className="font-medium">{COMPANY_TYPE_LABEL[company.data.company_type as string] ?? company.data.company_type ?? "—"}</span>
            {project.project_type && (
              <> · Projekt típus: <span className="font-medium">{String(project.project_type)}</span></>
            )}
            {primaryContact && (
              <> · Fő kapcsolattartó: <Link to="/contacts/$id" params={{ id: primaryContact.id }} className="font-medium text-primary hover:underline">{primaryContact.name ?? "—"}</Link></>
            )}
          </div>
        )}
      </div>

      {/* KÖVETKEZŐ TEENDŐ + NAPI ÚT */}
      <div className="grid gap-3 px-4 pt-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        {coreReady && role === "sales" && project.lead_id && handoffReady ? (
          // Sales-nek a saját átadási teendője (nem a projektvezetői napi teendő).
          <PrimaryActionCard
            eyebrow={handoffStep.mine ? "Következő lépésed (Sales)" : "Átadás állapota"}
            title={handoffStep.title}
            detail={handoffStep.detail}
            action={<Button size="sm" onClick={() => setTab("handover")}>Átadás fül</Button>}
          />
        ) : coreReady ? (
          <PrimaryActionCard
            eyebrow="Következő teendő"
            title={next.title}
            detail={next.detail}
            warnings={next.warnings}
            action={<Button size="sm" onClick={() => setTab(next.tab)}>{next.button}</Button>}
          />
        ) : (
          <div className="flex items-center gap-2 rounded-lg border bg-card p-3 text-sm text-muted-foreground">
            {tasks.isError || docs.isError || notes.isError
              ? <>A következő teendő nem számolható: a feladatok, dokumentumok vagy jegyzetek nem töltődtek be.</>
              : <><Loader2 className="h-4 w-4 animate-spin" />Következő teendő számolása…</>}
          </div>
        )}
        <nav aria-label="Projekt napi útja" className="rounded-lg border bg-card p-2">
          <ol className="grid gap-1.5 sm:grid-cols-2">
            {steps.map((s, i) => {
              const Icon = STEP_ICON[s.state];
              return (
                <li key={s.key}>
                  <button
                    type="button"
                    onClick={() => setTab(s.tab)}
                    aria-current={tab === s.tab ? "step" : undefined}
                    className={cn(
                      "flex w-full min-w-0 items-center gap-2 rounded-md border bg-background px-2.5 py-2 text-left transition hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      tab === s.tab && "border-primary/50 bg-primary/5",
                    )}
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold">{s.label}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">{coreReady ? s.summary : "betöltés…"}</span>
                    </span>
                    {coreReady && <Icon className={cn("h-4 w-4 shrink-0", STEP_TONE[s.state])} aria-label={s.state === "ok" ? "rendben" : s.state === "warn" ? "figyelendő" : "hiányzik"} />}
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
      </div>

      {/* TABS */}
      <div className="p-4 sm:p-6">
        <Tabs value={tab} onValueChange={(v) => setTab(v as PmTab)} className="w-full">
          <TabsList className="flex h-auto max-w-full flex-wrap justify-start">
            <TabsTrigger value="overview"><Briefcase className="mr-1.5 h-3.5 w-3.5" />Áttekintés · napi lap</TabsTrigger>
            <TabsTrigger value="tasks"><ListChecks className="mr-1.5 h-3.5 w-3.5" />Feladatok ({openTasksCount} nyitott)</TabsTrigger>
            <TabsTrigger value="docs"><FolderOpen className="mr-1.5 h-3.5 w-3.5" />Dokumentumok ({docs.data?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="handover"><ClipboardCheck className="mr-1.5 h-3.5 w-3.5" />Átadás{handoffReady && handoff.missing > 0 ? ` (${handoff.missing} hiány)` : ""}</TabsTrigger>
            <TabsTrigger value="contacts"><UserPlus className="mr-1.5 h-3.5 w-3.5" />Kapcsolatok ({projectContacts.data?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="quotes"><FileText className="mr-1.5 h-3.5 w-3.5" />Ajánlatok ({quotes.data?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="followups"><BellRing className="mr-1.5 h-3.5 w-3.5" />Utókövetés ({openFollowups.length})</TabsTrigger>
            <TabsTrigger value="emails"><Mail className="mr-1.5 h-3.5 w-3.5" />Emailek ({emailThreads.data?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="calls"><Phone className="mr-1.5 h-3.5 w-3.5" />Hívások ({calls.data?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="meetings"><Calendar className="mr-1.5 h-3.5 w-3.5" />Találkozók ({meetings.data?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="notes"><StickyNote className="mr-1.5 h-3.5 w-3.5" />Jegyzetek ({notes.data?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="timeline"><History className="mr-1.5 h-3.5 w-3.5" />Napló</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4 grid gap-4 lg:grid-cols-2">
            <DailySheetCard
              projectId={id}
              day={day}
              notes={notes.data ?? []}
              canAttendance={canAttendance}
              attendanceLoading={attProjects.isLoading || attEntries.isLoading}
              attendanceError={attProjects.isError || attEntries.isError}
              onOpenTasks={() => setTab("tasks")}
              onOpenPhotos={() => openDocs("photo")}
            />
            <HandoffOverviewCard ready={handoffReady} summary={handoff} next={handoffStep} onOpen={() => setTab("handover")} />
            <Card>
              <CardHeader><CardTitle className="text-sm">Ajánlat-állapot</CardTitle></CardHeader>
              <CardContent className="text-sm">
                {(quotes.data ?? []).length === 0 ? <EmptyState icon={FileText} title="Nincs ajánlat" /> : (
                  <ul className="space-y-1.5">
                    {(quotes.data ?? []).slice(0, 5).map((q) => (
                      <li key={q.id} className="flex justify-between gap-2">
                        <span className="truncate">
                          <Badge variant="outline" className="mr-2">{tStatus("quote", q.status)}</Badge>
                          <Link to="/quotes/$id" params={{ id: q.id }} className="text-primary hover:underline">
                            {q.version != null ? `v${q.version}` : `#${String(q.id).slice(0, 8)}`}
                          </Link>
                        </span>
                        <span className="tabular-nums text-muted-foreground">{formatHuf(Number(q.total_amount ?? 0))}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Aktív utókövetés-ok</CardTitle></CardHeader>
              <CardContent>
                {openFollowups.length === 0 ? <EmptyState icon={BellRing} title="Nincs nyitott utókövetés" /> : (
                  <ul className="space-y-1.5 text-sm">
                    {openFollowups.slice(0, 5).map((f) => {
                      const overdue = f.due_date && new Date(f.due_date) < new Date();
                      return (
                        <li key={f.id} className="flex justify-between gap-2">
                          <span className="truncate">{f.followup_type ?? "—"} · {f.result ?? ""}</span>
                          <span className={`tabular-nums ${overdue ? "text-destructive font-semibold" : "text-muted-foreground"}`}>{fmtDateTime(f.due_date)}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Kapcsolattartók a cégtől</CardTitle></CardHeader>
              <CardContent>
                {(projectContacts.data ?? []).length === 0 ? <EmptyState icon={UserPlus} title="Nincs kapcsolattartó" /> : (
                  <ul className="space-y-1.5 text-sm">
                    {(projectContacts.data ?? []).slice(0, 5).map((c: any) => (
                      <li key={c.id} className="flex justify-between gap-2">
                        {c.contact ? (
                          <Link to="/contacts/$id" params={{ id: c.contact.id }} className="truncate text-primary hover:underline">
                            {c.contact.name ?? "—"}
                          </Link>
                        ) : <span>—</span>}
                        <span className="text-muted-foreground">{c.role ? PROJECT_CONTACT_ROLE_LABEL[c.role] ?? c.role : (c.contact?.email ?? "")}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Utolsó kommunikáció</CardTitle></CardHeader>
              <CardContent>
                {lastComm ? <div className="text-sm">Legutóbbi esemény: <span className="font-medium">{fmtDateTime(lastComm)}</span></div> : <EmptyState icon={History} title="Még nincs esemény" />}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tasks" className="mt-4">
            <ProjectTasksPanel
              projectId={id}
              tasks={(tasks.data ?? []) as PmTask[]}
              loading={tasks.isLoading}
              error={tasks.isError}
              onRetry={() => tasks.refetch()}
              canEdit={canEditTasks}
            />
          </TabsContent>
          <TabsContent value="quotes" className="mt-4">
            <RelationList rows={quotes.data} columns={[
              { label: "Verzió", get: (r) => r.version != null ? `v${r.version}` : `#${String(r.id).slice(0,8)}` },
              { label: "Státusz", get: (r) => tStatus("quote", r.status) },
              { label: "Összeg", get: (r) => formatHuf(Number(r.total_amount ?? 0)), className: "tabular-nums text-right" },
              { label: "Létrejött", get: (r) => fmtDate(r.created_at) },
            ]} link={(r) => ({ to: "/quotes/$id", params: { id: r.id } })} empty="Még nincs ajánlat ehhez a projekthez." />
          </TabsContent>
          <TabsContent value="followups" className="mt-4">
            <RelationList rows={followups.data} columns={[
              { label: "Esedékesség", get: (r) => fmtDateTime(r.due_date) },
              { label: "Típus", get: (r) => r.followup_type ?? "—" },
              { label: "Lezárva", get: (r) => (r.completed ? "✓" : "—") },
              { label: "Jegyzet", get: (r) => r.result ?? "—" },
            ]} empty="Nincs utókövetés." />
          </TabsContent>
          <TabsContent value="calls" className="mt-4">
            <RelationList rows={calls.data} columns={[
              { label: "Időpont", get: (r) => fmtDateTime(r.created_at) },
              { label: "Irány", get: (r) => r.direction === "inbound" ? "Bejövő" : r.direction === "outbound" ? "Kimenő" : (r.direction ?? "—") },
              { label: "Típus", get: (r) => r.call_type ?? "—" },
              { label: "Eredmény", get: (r) => r.outcome ?? "—" },
              { label: "Összefoglaló", get: (r) => r.summary ?? "—" },
            ]} empty="Nincs hívás." />
          </TabsContent>
          <TabsContent value="meetings" className="mt-4">
            <RelationList rows={meetings.data} columns={[
              { label: "Időpont", get: (r) => fmtDateTime(r.meeting_date) },
              { label: "Megnevezés", get: (r) => r.title ?? "—" },
              { label: "Helyszín", get: (r) => r.location ?? "—" },
              { label: "Jegyzet", get: (r) => r.summary ?? "—" },
            ]} empty="Nincs találkozó." />
          </TabsContent>
          <TabsContent value="emails" className="mt-4">
            <ProjectEmailAttach projectId={id} />
          </TabsContent>
          <TabsContent value="docs" className="mt-4 space-y-3">
            <DocSummaryBar day={day} active={docFilter} onPick={(f) => setDocFilter(f)} />
            <DocumentManager key={docFilter} projectId={id} initialFilter={docFilter} />
          </TabsContent>
          <TabsContent value="handover" className="mt-4 space-y-6">
            <section aria-labelledby="sales-pm-atvetel" className="space-y-3">
              <h2 id="sales-pm-atvetel" className="text-sm font-semibold">1. Sales → projektvezető átvétel</h2>
              {handoffReady ? (
                <PrimaryActionCard
                  eyebrow={handoffStep.mine && !handoffStep.waitingFor ? "Következő lépésed" : "Átadás állapota"}
                  title={handoffStep.title}
                  detail={handoffStep.detail}
                  warnings={handoffStep.waitingFor ? [`Felelős: ${HANDOFF_ROLE_LABEL[handoffStep.waitingFor]}`] : undefined}
                  action={handoffStep.item && fixLabel(handoffStep.item) ? <Button size="sm" onClick={() => fixHandoff(handoffStep.item!)}>{fixLabel(handoffStep.item)}</Button> : undefined}
                />
              ) : (quotes.isError || projectContacts.isError || docs.isError || tasks.isError) ? (
                <div role="alert" className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                  Egyes átadási források nem tölthetők be (NINCS ADAT), ezért az átadás nem minősíthető.
                  <Button size="sm" variant="outline" onClick={() => { quotes.refetch(); projectContacts.refetch(); docs.refetch(); tasks.refetch(); }}>Újrapróbálás</Button>
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-md border bg-card p-3 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Átadási források ellenőrzése…</div>
              )}
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
                <HandoffChecklist summary={handoff} onFix={fixHandoff} fixLabel={fixLabel} highlightRole={role} />
                <div className="space-y-4">
                  <div id="projekt-alapadatok">
                    <ProjectBasicsForm project={{ ...project, id } as any} canEdit={canEditBasics} canAssignPm={rights.assignPm} pmLabel={assigneeName(project.project_manager_user_id ?? (project.handoff_payload as any)?.project_manager_user_id ?? null)} />
                  </div>
                  <SalesHandoffCard project={project} assigneeName={assigneeName} />
                  <HandoffNotInCrm />
                </div>
              </div>
            </section>
            <section aria-labelledby="muszaki-atadas" className="space-y-3">
              <h2 id="muszaki-atadas" className="text-sm font-semibold">2. Műszaki átadás a megrendelőnek (TIG-előkészítés)</h2>
              <HandoverPanel readiness={readiness} status={project.status} onTab={(t) => setTab(t)} onPhotos={() => openDocs("photo")} />
            </section>
          </TabsContent>
          <TabsContent value="contacts" className="mt-4">
            <ProjectContactsPanel projectId={id} companyId={project.company_id} />
          </TabsContent>
          <TabsContent value="notes" className="mt-4">
            <ProjectNotes projectId={id} notes={notes.data ?? []} />
          </TabsContent>
          <TabsContent value="timeline" className="mt-4">
            <ProjectTimeline
              project={project}
              quotes={quotes.data ?? []}
              followups={followups.data ?? []}
              tasks={tasks.data ?? []}
              emails={(emailThreads.data ?? []).map((t: any) => ({
                id: t.id,
                created_at: t.last_message_at ?? t.updated_at ?? t.created_at,
                summary: t.subject ?? "(nincs tárgy)",
                from_email: (t.participants ?? [])[0] ?? null,
              }))}
              calls={calls.data ?? []}
              meetings={meetings.data ?? []}
              documents={docs.data ?? []}
              notes={notes.data ?? []}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

type Col = { label: string; get: (r: any) => any; className?: string };
function RelationList({ rows, columns, empty, link }: {
  rows: any[] | undefined;
  columns: Col[];
  empty: string;
  link?: (r: any) => { to: string; params: Record<string, string> };
}) {
  if (!rows || rows.length === 0) {
    return <EmptyState icon={History} title="Nincs adat" description={empty} />;
  }
  return (
    <div className="rounded-md border bg-card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
          <tr>{columns.map((c) => <th key={c.label} className={`px-3 py-2 text-left ${c.className ?? ""}`}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const lk = link?.(r);
            return (
              <tr key={r.id} className="border-t hover:bg-muted/30">
                {columns.map((c, i) => (
                  <td key={c.label} className={`px-3 py-2 ${c.className ?? ""}`}>
                    {i === 0 && lk ? <Link to={lk.to} params={lk.params} className="text-primary hover:underline">{String(c.get(r) ?? "—")}</Link> : String(c.get(r) ?? "—")}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ProjectNotes({ projectId, notes }: { projectId: string; notes: any[] }) {
  const qc = useQueryClient();
  const { role, profile } = usePermissions();
  const [text, setText] = useState("");
  const add = useMutation({
    mutationFn: async (note: string) => {
      const { data: u } = await supabase.auth.getUser();
      let author_id: string | null = null;
      if (u.user?.id) {
        const { data: prof } = await supabase
          .from("users_profile").select("id").eq("auth_user_id", u.user.id).maybeSingle();
        author_id = (prof as any)?.id ?? null;
      }
      const payload: any = { project_id: projectId, note };
      if (author_id) payload.author_id = author_id;
      const { error } = await supabase.from("project_notes").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      setText("");
      qc.invalidateQueries({ queryKey: ["project_notes"] });
      toast.success("Jegyzet hozzáadva");
    },
    onError: (e: any) => toast.error("Mentés sikertelen", { description: humanizeSupabaseError(e) }),
  });
  const del = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.from("project_notes").delete().eq("id", id).select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("Nincs jogosultságod ennek a jegyzetnek a törléséhez.");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project_notes"] });
      toast.success("Törölve");
    },
    onError: (e: any) => toast.error("Törlés sikertelen", { description: humanizeSupabaseError(e) }),
  });

  return (
    <div className="space-y-3">
      <div className="rounded-md border bg-card p-3">
        <Textarea
          rows={3}
          placeholder="Új jegyzet…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="mt-2 flex justify-end">
          <Button size="sm" disabled={!text.trim() || add.isPending} onClick={() => add.mutate(text.trim())}>
            {add.isPending ? "Mentés…" : "Hozzáadás"}
          </Button>
        </div>
      </div>
      {notes.length === 0 ? (
        <EmptyState icon={StickyNote} title="Még nincs jegyzet" description="Az új jegyzetek itt jelennek meg." />
      ) : (
        <ul className="space-y-2">
          {notes.map((n) => (
            <li key={n.id} className="rounded-md border bg-card p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="whitespace-pre-wrap text-sm">{n.note ?? "—"}</div>
                <AlertDialog>
                  {(role === "owner" || (!!profile?.id && n.author_id === profile.id)) && (
                    <AlertDialogTrigger asChild>
                      <Button size="icon" variant="ghost" className="text-destructive" title="Törlés">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                  )}
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Jegyzet törlése</AlertDialogTitle>
                      <AlertDialogDescription>
                        Biztosan törlöd ezt a jegyzetet? Ez a művelet nem visszavonható.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Mégse</AlertDialogCancel>
                      <AlertDialogAction onClick={() => del.mutate(n.id)}>Törlés</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">{fmtDateTime(n.created_at)}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Mini({ label, value, tone = "primary", onClick }: { label: string; value: string; tone?: "primary" | "warning" | "danger" | "info" | "muted"; onClick?: () => void }) {
  const toneClass: Record<string, string> = {
    primary: "border-primary/30 bg-primary/5 text-primary",
    warning: "border-[color:var(--status-warning)]/30 bg-[color:var(--status-warning)]/10 text-[color:var(--status-warning)]",
    danger: "border-destructive/30 bg-destructive/5 text-destructive",
    info: "border-[color:var(--status-info)]/30 bg-[color:var(--status-info)]/5 text-[color:var(--status-info)]",
    muted: "border-border bg-muted/30 text-muted-foreground",
  };
  return (
    <button type="button" onClick={onClick} disabled={!onClick} className={`rounded-md border px-3 py-2 text-left transition enabled:hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${toneClass[tone]}`}>
      <div className="text-[10px] uppercase tracking-wider opacity-70">{label}</div>
      <div className="mt-0.5 text-sm font-semibold tabular-nums">{value}</div>
    </button>
  );
}

// ---------------------------------------------------------------------
// Áttekintés: rövid Sales→PM átadási állapot; a részletek az Átadás fülön.
// ---------------------------------------------------------------------
function HandoffOverviewCard({ ready, summary, next, onOpen }: {
  ready: boolean; summary: HandoffSummary; next: ReturnType<typeof handoffNext>; onOpen: () => void;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-sm">Sales → projektvezető átadás</CardTitle>
        {ready && <HandoffPhaseBadge phase={summary.phase} />}
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {!ready ? (
          <p className="text-xs text-muted-foreground">Átadási források ellenőrzése…</p>
        ) : (
          <>
            <p className="text-xs"><span className="font-semibold">{next.title}.</span> <span className="text-muted-foreground">{next.detail}</span></p>
            <div className="flex flex-wrap gap-1.5 text-[11px]">
              {(["owner", "sales", "project_manager"] as const).map((r) => summary.byRole[r].missing > 0 && (
                <Badge key={r} variant="outline" className="border-destructive/40 text-destructive">{HANDOFF_ROLE_LABEL[r]}: {summary.byRole[r].missing} hiány</Badge>
              ))}
              {summary.pending > 0 && <Badge variant="outline" className="text-[color:var(--status-warning)]">{summary.pending} ellenőrizendő</Badge>}
            </div>
          </>
        )}
        <Button size="sm" variant="outline" onClick={onOpen}><ClipboardCheck className="h-4 w-4" />Átadás fül</Button>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------
// SalesHandoffCard — a Sales → Projekt átadás adatait jeleníti meg.
//
// Forrás: a `sales_mark_won_with_project` RPC a `projects.handoff_payload`
// jsonb mezőbe írja az alábbiakat:
//   - source                   (a lead forrása)
//   - summary                  (a lead összefoglalója)
//   - notes                    (a megnyeréskor megadott megjegyzés)
//   - project_manager_user_id  (a választott projektvezető)
//   - created_via              ('sales_mark_won_with_project' új útvonalon)
//
// Régebbi projektek payload nélkül is helyesen jelennek meg (üres állapot).
// ---------------------------------------------------------------------
function SalesHandoffCard({
  project,
  assigneeName,
}: {
  project: Record<string, any>;
  assigneeName: (id: string | null | undefined) => string;
}) {
  const { role } = usePermissions();
  const canOpenLead = canAccessRoute(role, "/leads");
  const payload = (project.handoff_payload ?? {}) as Record<string, any>;
  const pmId: string | null = payload.project_manager_user_id ?? null;
  const source: string | null = payload.source ?? null;
  const summary: string | null = payload.summary ?? null;
  const notes: string | null = payload.notes ?? null;
  const viaRpc = payload.created_via === "sales_mark_won_with_project";
  const hasAny = pmId || source || summary || notes;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-sm">Sales átadás</CardTitle>
        {viaRpc ? (
          <Badge variant="outline" className="text-[10px]">Atomi átadás</Badge>
        ) : project.lead_id ? (
          <Badge variant="outline" className="text-[10px] text-muted-foreground">Korábbi átadás</Badge>
        ) : (
          <Badge variant="outline" className="text-[10px] text-muted-foreground">Lead nélkül</Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1.5">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">Projektvezető</span>
          <span className={pmId ? "font-medium" : "text-muted-foreground"}>
            {pmId ? assigneeName(pmId) : "—"}
          </span>
          <span className="text-xs uppercase tracking-wider text-muted-foreground">Lead forrása</span>
          <span className={source ? "" : "text-muted-foreground"}>{source ? ((LEAD_SOURCE_LABEL as Record<string,string>)[source] ?? source) : "—"}</span>
          <span className="text-xs uppercase tracking-wider text-muted-foreground">Lead</span>
          <span>
            {project.lead_id && canOpenLead ? (
              <Link
                to="/leads/$id"
                params={{ id: project.lead_id }}
                className="text-primary hover:underline"
              >
                Lead megnyitása
              </Link>
            ) : project.lead_id ? (
              // A projektvezető nem látja a lead munkafelületet — az átadott
              // adatokat ez a kártya mutatja, ezért itt nincs halott link.
              <span className="text-muted-foreground">Csatolva (sales adatai lent)</span>
            ) : (
              <span className="text-muted-foreground">Nincs csatolva</span>
            )}
          </span>
        </div>
        {summary && (
          <div className="rounded-md border bg-muted/30 p-2">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Lead összefoglaló</div>
            <div className="mt-1 whitespace-pre-wrap text-sm">{summary}</div>
          </div>
        )}
        {notes && (
          <div className="rounded-md border bg-muted/30 p-2">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Megnyerési jegyzet</div>
            <div className="mt-1 whitespace-pre-wrap text-sm">{notes}</div>
          </div>
        )}
        {!hasAny && (
          <div className="text-xs text-muted-foreground">
            Ehhez a projekthez nincs Sales átadási adat
            {project.lead_id ? " (korábbi projekt)." : "."}
          </div>
        )}
        {project.lead_id && <SalesHistory leadId={project.lead_id} />}
      </CardContent>
    </Card>
  );
}

const LEAD_STATUS_HU: Record<string, string> = {
  new: "Új", contacted: "Kapcsolatban", quote_prep: "Ajánlat előkészítés", quote_sent: "Ajánlat kiadva",
  follow_up: "Utánkövetés", contract: "Szerződés", won: "Megnyert", lost: "Elveszett",
};

// A lead sales-előzményei (meglévő rekordok, másolat nélkül): utolsó
// következő lépés és a teljes státusztörténet.
function SalesHistory({ leadId }: { leadId: string }) {
  const lead = useQuery({
    queryKey: ["leads", "project-history", leadId],
    queryFn: async () => {
      const { data } = await supabase.from("leads")
        .select("id,source,project_type,next_step_type,next_step_note,next_step_due_at,pipeline_entered_at,won_at")
        .eq("id", leadId).maybeSingle();
      return data as any;
    },
  });
  const hist = useQuery({
    queryKey: ["leads", "status-history", leadId],
    queryFn: async () => {
      const { data } = await supabase.from("lead_status_history")
        .select("id,from_status,to_status,changed_at").eq("lead_id", leadId).order("changed_at");
      return (data ?? []) as any[];
    },
  });
  const l = lead.data;
  return (
    <div className="space-y-2 rounded-md border bg-muted/30 p-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Sales előzmények</div>
      {l?.next_step_note && (
        <div className="text-sm">
          <span className="text-muted-foreground">Utolsó sales lépés ({(NEXT_STEP_LABEL as Record<string,string>)[l.next_step_type] ?? l.next_step_type ?? "—"}): </span>
          {l.next_step_note}
        </div>
      )}
      <ol className="space-y-0.5 text-xs">
        {(hist.data ?? []).map((h) => (
          <li key={h.id} className="flex justify-between gap-2">
            <span>{h.from_status ? `${LEAD_STATUS_HU[h.from_status] ?? h.from_status} → ` : ""}{LEAD_STATUS_HU[h.to_status] ?? h.to_status}</span>
            <span className="text-muted-foreground">{fmtDateTime(h.changed_at)}</span>
          </li>
        ))}
        {hist.data && hist.data.length === 0 && <li className="text-muted-foreground">Nincs rögzített státuszváltás.</li>}
      </ol>
    </div>
  );
}

// ---------------------------------------------------------------------
// Napi lap — a projekt mai helyzete egy kártyán: mai/lejárt/akadályozott
// feladatok felelőssel, mai napi jegyzetek + új jegyzet, és a jelenléti
// napló mai létszáma (csak azonos nevű jelenléti projekt esetén; nincs
// mentett kapcsolat). Új adatmezőt nem használ; a jegyzet a meglévő
// `project_notes` beszúrás.
// ---------------------------------------------------------------------
function DailySheetCard({
  projectId, day, notes, canAttendance, attendanceLoading, attendanceError, onOpenTasks, onOpenPhotos,
}: {
  projectId: string;
  day: PmProjectDay;
  notes: any[];
  canAttendance: boolean;
  attendanceLoading: boolean;
  attendanceError: boolean;
  onOpenTasks: () => void;
  onOpenPhotos: () => void;
}) {
  const qc = useQueryClient();
  const userLabel = useLookup("users_profile_lookup", "full_name");
  const [note, setNote] = useState("");
  const addNote = useMutation({
    mutationFn: async (text: string) => {
      const { data: u } = await supabase.auth.getUser();
      let author_id: string | null = null;
      if (u.user?.id) {
        const { data: prof } = await supabase
          .from("users_profile").select("id").eq("auth_user_id", u.user.id).maybeSingle();
        author_id = (prof as any)?.id ?? null;
      }
      const payload: any = { project_id: projectId, note: text };
      if (author_id) payload.author_id = author_id;
      const { error } = await supabase.from("project_notes").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      setNote("");
      qc.invalidateQueries({ queryKey: ["project_notes"] });
      toast.success("Napi jegyzet hozzáadva");
    },
    onError: (e: any) => toast.error("Mentés sikertelen — a szöveg megmaradt", { description: humanizeSupabaseError(e) }),
  });

  const todayYmd = budapestYmd();
  const todayNotes = notes.filter((n) => n.created_at && budapestYmd(n.created_at) === todayYmd);
  const urgent = [...day.overdue, ...day.blocked.filter((t) => !day.overdue.includes(t)), ...day.today];
  const now = new Date();
  const matched = day.attendance.matched;

  return (
    <Card className="border-primary/30 bg-primary/5 lg:col-span-2">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-sm">Napi lap · {fmtDate(new Date().toISOString())}</CardTitle>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="outline" className="text-[10px]">{urgent.length} sürgős feladat</Badge>
          <Badge variant="outline" className={cn("text-[10px]", day.noteToday ? "text-[color:var(--status-success)]" : "text-[color:var(--status-warning)]")}>
            {day.noteToday ? "Mai jegyzet rögzítve" : "Ma még nincs jegyzet"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm md:grid-cols-3">
        {/* Feladatok és felelősök */}
        <section aria-label="Mai feladatok és felelősök" className="md:col-span-2">
          <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
            <span>Mai / lejárt / akadályozott feladat ({urgent.length})</span>
            <button type="button" onClick={onOpenTasks} className="normal-case tracking-normal text-primary hover:underline">Összes feladat</button>
          </div>
          {urgent.length === 0 ? (
            <div className="rounded-md border bg-background p-2 text-xs text-muted-foreground">
              Nincs mára esedékes, lejárt vagy akadályozott feladat.
            </div>
          ) : (
            <ul className="divide-y rounded-md border bg-background">
              {urgent.slice(0, 6).map((t) => {
                const f = classifyTask(t, now);
                return (
                  <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-2 py-1.5">
                    <span className="min-w-0 flex-1 break-words">
                      {t.title ?? "—"}
                      {f.blocked && <Badge variant="outline" className="ml-1.5 border-destructive/40 text-[10px] text-destructive">Akadályozott</Badge>}
                    </span>
                    <span className="text-xs text-muted-foreground">{t.assigned_user ? userLabel(t.assigned_user) : <span className="text-[color:var(--status-warning)]">nincs felelős</span>}</span>
                    <span className={cn("tabular-nums text-xs", f.overdue ? "font-semibold text-destructive" : "text-muted-foreground")}>{t.due_date ? fmtDateTime(t.due_date) : "nincs határidő"}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Helyszín: jelenlét + fotó */}
        <section aria-label="Helyszín ma" className="space-y-2">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Helyszín ma</div>
          <div className="rounded-md border bg-background p-2">
            <div className="flex items-center gap-1.5 text-xs font-medium"><Users className="h-3.5 w-3.5" />Jelenlét</div>
            {!canAttendance ? (
              <p className="mt-1 text-xs text-muted-foreground">A jelenléti naplót csak projektvezető és tulajdonos látja.</p>
            ) : attendanceLoading ? (
              <p className="mt-1 text-xs text-muted-foreground">Betöltés…</p>
            ) : attendanceError ? (
              <p className="mt-1 text-xs text-destructive">A jelenléti napló nem olvasható.</p>
            ) : matched ? (
              <p className="mt-1 text-xs"><span className="text-base font-semibold tabular-nums">{day.attendance.workersToday}</span> fő rögzítve ma <span className="text-muted-foreground">(„{matched.name}” — név szerinti egyezés)</span></p>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">A jelenléti naplóban nincs pontosan ilyen nevű projekt, ezért a létszám itt nem látszik.</p>
            )}
            {canAttendance && (
              <Button size="sm" variant="outline" className="mt-2 h-7 text-xs" asChild>
                <Link to="/attendance/quick" search={(matched ? { project: matched.id } : {}) as any}><Zap className="h-3.5 w-3.5" />Jelenlét rögzítése</Link>
              </Button>
            )}
          </div>
          <div className="rounded-md border bg-background p-2">
            <div className="flex items-center gap-1.5 text-xs font-medium"><Camera className="h-3.5 w-3.5" />Fotók</div>
            <p className="mt-1 text-xs text-muted-foreground">{day.docs.photo} fénykép a projektnél.</p>
            <Button size="sm" variant="outline" className="mt-2 h-7 text-xs" onClick={onOpenPhotos}>Fotók / feltöltés</Button>
          </div>
        </section>

        {/* Napi jegyzet */}
        <section aria-label="Napi jegyzet" className="rounded-md border bg-background p-2 md:col-span-3">
          <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            Napi jegyzet — mi készült el, mi akadályoz, mi kell holnapra?
          </div>
          {todayNotes.length > 0 && (
            <ul className="mb-2 space-y-1">
              {todayNotes.slice(0, 3).map((n) => (
                <li key={n.id} className="rounded bg-muted/40 px-2 py-1 text-xs">
                  <span className="text-muted-foreground">{fmtDateTime(n.created_at)} · </span>
                  <span className="whitespace-pre-wrap">{n.note}</span>
                </li>
              ))}
            </ul>
          )}
          <Textarea
            rows={2}
            placeholder="Mi történt ma ezzel a projekttel?"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="mt-2 flex justify-end">
            <Button
              size="sm"
              disabled={!note.trim() || addNote.isPending}
              onClick={() => addNote.mutate(note.trim())}
            >
              {addNote.isPending ? "Mentés…" : "Jegyzet mentése"}
            </Button>
          </div>
        </section>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------
// Projekt feladatai — magyar állapot/prioritás, felelős, lejárt/akadály
// kiemelés, „Kész” a meglévő Feladat mentési úton, új feladat projekttel
// előtöltve a Feladatok oldal űrlapján.
// ---------------------------------------------------------------------
function ProjectTasksPanel({ projectId, tasks, loading, error, onRetry, canEdit }: {
  projectId: string; tasks: PmTask[]; loading: boolean; error: boolean; onRetry: () => void; canEdit: boolean;
}) {
  const userLabel = useLookup("users_profile_lookup", "full_name");
  const upsert = useUpsert("tasks");
  const [showDone, setShowDone] = useState(false);
  const now = new Date();
  if (loading) return <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Feladatok betöltése…</div>;
  if (error) return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      A feladatok nem tölthetők be. <Button size="sm" variant="outline" onClick={onRetry}>Újrapróbálás</Button>
    </div>
  );
  const open = tasks.filter((t) => !["done", "completed", "cancelled"].includes(t.status ?? ""));
  const closed = tasks.filter((t) => ["done", "completed", "cancelled"].includes(t.status ?? ""));
  const rank = (t: PmTask) => { const f = classifyTask(t, now); return f.overdue ? 0 : f.blocked ? 1 : f.today ? 2 : f.upcoming7 ? 3 : 4; };
  const list = [...open].sort((a, b) => rank(a) - rank(b));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Sorrend: lejárt → akadályozott → mai → 7 napon belüli. Anyagigényt és műszaki akadályt is feladatként rögzíts („Akadályozott” állapot).
        </p>
        {canEdit && (
          <Button size="sm" asChild>
            <Link to="/tasks" search={{ new: 1, project_id: projectId } as any}><Plus className="h-4 w-4" />Új feladat ehhez a projekthez</Link>
          </Button>
        )}
      </div>
      {list.length === 0 ? (
        <EmptyState icon={ListChecks} title="Nincs nyitott feladat" description="Az új feladat gombbal vehetsz fel teendőt felelőssel és határidővel." />
      ) : (
        <ul className="divide-y rounded-md border bg-card">
          {list.map((t) => {
            const f = classifyTask(t, now);
            return (
              <li key={t.id} className={cn("flex flex-col gap-1.5 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between", (f.overdue || f.blocked) && "bg-destructive/5")}>
                <div className="min-w-0 flex-1">
                  <div className="break-words font-medium">{t.title ?? "Névtelen feladat"}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <Badge variant="outline" className={cn("text-[10px]", f.blocked && "border-destructive/40 text-destructive")}>{tStatus("task", t.status)}</Badge>
                    {t.priority && <span>Prioritás: {tStatus("priority", t.priority)}</span>}
                    <span>Felelős: {t.assigned_user ? userLabel(t.assigned_user) : <span className="text-[color:var(--status-warning)]">nincs kijelölve</span>}</span>
                    <span className={cn(f.overdue && "font-semibold text-destructive", f.today && "font-semibold text-[color:var(--status-warning)]")}>
                      {t.due_date ? `${f.overdue ? "Lejárt: " : f.today ? "Ma: " : ""}${fmtDateTime(t.due_date)}` : "Nincs határidő"}
                    </span>
                  </div>
                </div>
                {canEdit && (
                  <Button
                    size="sm" variant="outline" className="h-8 shrink-0 self-start sm:self-center"
                    disabled={upsert.isPending}
                    title="Késznek jelöli a feladatot (a Feladatok oldalon visszaállítható)"
                    onClick={() => upsert.mutate({ id: t.id, status: "done" })}
                  >
                    <CheckCircle2 className="h-4 w-4" />Kész
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {closed.length > 0 && (
        <div>
          <button type="button" className="text-xs text-primary hover:underline" onClick={() => setShowDone((v) => !v)}>
            {showDone ? "Lezárt feladatok elrejtése" : `Lezárt feladatok (${closed.length})`}
          </button>
          {showDone && (
            <ul className="mt-2 divide-y rounded-md border bg-muted/20 text-xs">
              {closed.map((t) => (
                <li key={t.id} className="flex justify-between gap-2 px-3 py-1.5">
                  <span className="min-w-0 break-words">{t.title ?? "—"}</span>
                  <span className="text-muted-foreground">{tStatus("task", t.status)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">Feladat szerkesztése (felelős, határidő, állapot visszaállítása): Feladatok oldal → sor ⋯ → Szerkesztés.</p>
    </div>
  );
}

const DOC_PICKS: { key: "all" | DocCategory; label: string; get: (d: PmProjectDay["docs"]) => number }[] = [
  { key: "all", label: "Összes", get: (d) => d.total },
  { key: "photo", label: "Fénykép", get: (d) => d.photo },
  { key: "plan", label: "Tervrajz", get: (d) => d.plan },
  { key: "technical", label: "Műszaki", get: (d) => d.technical },
  { key: "contract", label: "Szerződés", get: (d) => d.contract },
];
function DocSummaryBar({ day, active, onPick }: { day: PmProjectDay; active: "all" | DocCategory; onPick: (f: "all" | DocCategory) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5" aria-label="Dokumentumok kategóriánként">
      {DOC_PICKS.map((p) => (
        <button
          key={p.key}
          type="button"
          onClick={() => onPick(p.key)}
          aria-pressed={active === p.key}
          className={cn("rounded-md border bg-card px-3 py-2 text-left transition hover:border-primary/50", active === p.key && "border-primary/60 bg-primary/5")}
        >
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{p.label}</div>
          <div className={cn("text-lg font-semibold tabular-nums", p.key !== "all" && p.get(day.docs) === 0 && "text-muted-foreground")}>{p.get(day.docs)}</div>
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------
// Átadás-előkészítés — csak a meglévő adatok tájékoztató ellenőrzése.
// A CRM nem állít ki és nem írat alá teljesítésigazolást (TIG).
// ---------------------------------------------------------------------
function HandoverPanel({ readiness, status, onTab, onPhotos }: {
  readiness: ReturnType<typeof handoverReadiness>; status: string | null; onTab: (t: PmTab) => void; onPhotos: () => void;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <ReadinessList
        readiness={readiness}
        title="Átadás / teljesítésigazolás előkészítése"
        note="Tájékoztató lista a meglévő feladatokból, dokumentumokból és jegyzetekből. Nem ment, nem vált állapotot, és nem jelenti az ügyfél elfogadását."
      />
      <Card>
        <CardHeader><CardTitle className="text-sm">Mi történik az átadásnál?</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>Jelenlegi állapot: <strong>{PROJECT_STATUS_LABEL[status ?? ""] ?? (status || "—")}</strong>. Az állapotot a fejléc állapotválasztójában módosíthatod.</p>
          <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
            <li>Teljesítésigazolás (TIG) a CRM-ben <strong>nem készül és nem írható alá</strong>. Az aláírt TIG-et vagy átadási jegyzőkönyvet töltsd fel a Dokumentumokhoz (Szerződés vagy Egyéb kategória).</li>
            <li>Elvégzett munka áttekintéséhez: lezárt feladatok a Feladatok fülön, napi jegyzetek a Jegyzetek fülön, időrend a Naplóban.</li>
            <li>Anyagigény és számlázás nincs a CRM-ben.</li>
          </ul>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" variant="outline" onClick={() => onTab("tasks")}><ListChecks className="h-4 w-4" />Feladatok</Button>
            <Button size="sm" variant="outline" onClick={onPhotos}><Camera className="h-4 w-4" />Fotók</Button>
            <Button size="sm" variant="outline" onClick={() => onTab("docs")}><FolderOpen className="h-4 w-4" />Dokumentumok</Button>
            <Button size="sm" variant="outline" onClick={() => onTab("notes")}><StickyNote className="h-4 w-4" />Jegyzetek</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

