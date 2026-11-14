/**
 * Projektvezető „Mai projektmunka” — napindító és irányító felület.
 *
 * Folyamat: projekt kiválasztása → mai feladatok és felelősök → helyszín
 * (jelenlét, napi jegyzet) → dokumentumok/fotók → átadás-előkészítés →
 * következő teendő. Minden szám meglévő, RLS-sel olvasott sorokból jön
 * (`pm-day-flow.ts`); a nézet csak megnyit, az egyetlen írás a meglévő
 * Feladat mentési út („Kész” → useUpsert("tasks")).
 */
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle, Bot, Briefcase, CalendarDays, Camera, CheckCircle2, ClipboardList, FolderOpen,
  Hammer, ListChecks, Loader2, MapPin, Plus, StickyNote, Users, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { WelcomeHeader } from "@/components/welcome-header";
import { WorkspacePanel } from "@/components/dashboard/workspace-panel";
import { EmptyState } from "@/components/page-header";
import { PrimaryActionCard, SalesFlowMap } from "@/components/sales/sales-flow-ui";
import { fmtDate, fmtDateTime, useLookup } from "@/components/resource/resource-page";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { usePermissions } from "@/hooks/use-permissions";
import { useVisibleAgents } from "@/hooks/use-visible-agents";
import { useUpsert } from "@/lib/db-hooks";
import { tStatus } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { ACTIVE_PROJECT_STATUSES, PROJECT_STATUS_LABEL, PROJECT_STATUS_TONE } from "@/lib/viba-constants";
import { listEntries, listProjects } from "@/lib/attendance/attendance.functions";
import { attendanceToday } from "@/lib/attendance/attendance-dates";
import {
  classifyTask, isActiveProject, pmDayStages, pmFocus, pmProjectRows, projectManagerOf,
  type PmAttendanceEntry, type PmAttendanceProject, type PmDoc, type PmNote, type PmProject, type PmRow, type PmTask,
} from "@/lib/pm/pm-day-flow";

const PROJECT_COLS = "id,title,status,company_id,address,deadline,start_date,project_manager_user_id,handoff_payload";

export function PmHome() {
  const { user } = useAuth();
  const { profile } = usePermissions();
  const uid = user?.id ?? null;
  const profileId: string | null = profile?.id ?? null;
  const { visibleAgentIds } = useVisibleAgents();
  const bossVisible = visibleAgentIds.has("pm");
  const companyLabel = useLookup("companies", "name");
  const [onlyMine, setOnlyMine] = useState(true);
  const today = attendanceToday();

  // ── Meglévő adatok, a hívó jogosultságával ─────────────────────────────
  const projectsQ = useQuery({
    queryKey: ["projects", "pm-day", "active"],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select(PROJECT_COLS)
        .in("status", ACTIVE_PROJECT_STATUSES as unknown as string[]).order("title");
      if (error) throw error;
      return (data ?? []) as PmProject[];
    },
  });
  const activeIds = useMemo(() => (projectsQ.data ?? []).map((p) => p.id), [projectsQ.data]);
  const idsKey = activeIds.join(",");

  const tasksQ = useQuery({
    queryKey: ["tasks", "pm-day", "open"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tasks")
        .select("id,title,status,priority,due_date,project_id,assigned_user")
        .or("status.is.null,status.not.in.(done,completed,cancelled)")
        .order("due_date", { ascending: true, nullsFirst: false }).limit(1000);
      if (error) throw error;
      return (data ?? []) as PmTask[];
    },
  });
  const docsQ = useQuery({
    queryKey: ["project_documents", "pm-day", idsKey],
    enabled: projectsQ.isSuccess,
    queryFn: async () => {
      if (!activeIds.length) return [] as PmDoc[];
      const { data, error } = await supabase.from("project_documents")
        .select("id,project_id,document_type").in("project_id", activeIds).limit(5000);
      if (error) throw error;
      return (data ?? []) as PmDoc[];
    },
  });
  const notesQ = useQuery({
    queryKey: ["project_notes", "pm-day", idsKey],
    enabled: projectsQ.isSuccess,
    queryFn: async () => {
      if (!activeIds.length) return [] as PmNote[];
      const { data, error } = await supabase.from("project_notes")
        .select("id,project_id,created_at").in("project_id", activeIds)
        .order("created_at", { ascending: false }).limit(2000);
      if (error) throw error;
      return (data ?? []) as PmNote[];
    },
  });
  const listAttProjects = useServerFn(listProjects);
  const listAttEntries = useServerFn(listEntries);
  const attProjectsQ = useQuery({
    queryKey: ["att", "projects", "pm-day"],
    queryFn: async () => (await listAttProjects()).rows as PmAttendanceProject[],
    staleTime: 60_000,
  });
  const attEntriesQ = useQuery({
    queryKey: ["att", "entries", "pm-day", today],
    queryFn: async () => (await listAttEntries({ data: { from: today, to: today } })).rows as unknown as (PmAttendanceEntry & { attendance_projects?: { name?: string } | null })[],
  });

  const coreReady = projectsQ.isSuccess && tasksQ.isSuccess && docsQ.isSuccess && notesQ.isSuccess;
  const coreError = projectsQ.isError || tasksQ.isError || docsQ.isError || notesQ.isError;
  const ctx = {
    tasks: tasksQ.data ?? [], docs: docsQ.data ?? [], notes: notesQ.data ?? [],
    attendanceProjects: attProjectsQ.data ?? [], attendanceEntries: attEntriesQ.data ?? [],
  };
  const mineCount = (projectsQ.data ?? []).filter((p) => isActiveProject(p) && !!uid && projectManagerOf(p) === uid).length;
  const effectiveOnlyMine = onlyMine && mineCount > 0;
  const rows = coreReady ? pmProjectRows(projectsQ.data ?? [], ctx, { uid, onlyMine: effectiveOnlyMine }) : [];
  const focus = pmFocus(rows, { ready: coreReady, error: coreError });
  const workersToday = attEntriesQ.isSuccess ? new Set((attEntriesQ.data ?? []).map((e) => e.worker_id)).size : null;
  const stages = pmDayStages(rows, workersToday, coreReady);
  const retryCore = () => { projectsQ.refetch(); tasksQ.refetch(); docsQ.refetch(); notesQ.refetch(); };

  // Mai feladatok: a kiválasztott projektek + a nekem kiosztott, projekt nélküli feladatok.
  const rowIds = new Set(rows.map((r) => r.project.id));
  const now = new Date();
  const dayTasks = (tasksQ.data ?? [])
    .filter((t) => (t.project_id ? rowIds.has(t.project_id) : !!profileId && t.assigned_user === profileId))
    .map((t) => ({ t, f: classifyTask(t, now) }))
    .filter(({ f }) => f.overdue || f.today || f.blocked)
    .slice(0, 12);

  return (
    <div className="crm-today flex flex-col">
      <WelcomeHeader
        title="Mai projektmunka"
        subtitle="Projekt → mai feladatok → helyszín és napi lap → dokumentumok → átadás. Budapest idő szerint."
      />

      <div className="flex flex-col gap-4 px-4 pt-3 pb-6 sm:px-6">
        {coreError && (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            A projektadatok egy része nem tölthető be. A meglévő adatok nem vesztek el.
            <Button size="sm" variant="outline" onClick={retryCore}>Újrapróbálás</Button>
          </div>
        )}

        {/* 1. Most ezzel kezdj + Boss */}
        <div className={cn("grid gap-3", bossVisible && "lg:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)]")}>
          <FocusCard focus={focus} companyLabel={companyLabel} onRetry={retryCore} />
          {bossVisible && <BossCard />}
        </div>

        {/* 2. A teljes napi út egy sorban */}
        <SalesFlowMap stages={stages} label="Projektvezetői napi munkafolyamat" />

        <div className="flex flex-wrap gap-2" aria-label="Gyors műveletek">
          <Button size="sm" asChild><Link to="/attendance/quick"><Zap />Jelenlét rögzítése</Link></Button>
          <Button size="sm" variant="secondary" asChild><Link to="/tasks" search={{ new: 1 } as any}><Plus />Új feladat</Link></Button>
          <Button size="sm" variant="secondary" asChild><Link to="/documents"><FolderOpen />Dokumentumok</Link></Button>
          <Button size="sm" variant="secondary" asChild><Link to="/meetings"><CalendarDays />Találkozók</Link></Button>
          <Button size="sm" variant="outline" asChild><Link to="/projects"><Briefcase />Összes projekt</Link></Button>
        </div>

        <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(280px,1fr)]">
          {/* 3. Projektválasztó */}
          <WorkspacePanel
            title="Projektjeim ma"
            subtitle="Sürgősség szerint: lejárt → akadály → mai feladat → határidő → átadás → napi jegyzet → dokumentum"
          >
            <div className="flex flex-wrap items-center gap-3 border-b px-4 py-2 text-sm">
              <label className="flex min-h-9 cursor-pointer items-center gap-2">
                <Checkbox checked={onlyMine} onCheckedChange={(v) => setOnlyMine(v === true)} disabled={!uid} />
                Csak ahol én vagyok a projektvezető
              </label>
              {onlyMine && coreReady && mineCount === 0 && (projectsQ.data ?? []).length > 0 && (
                <span className="text-xs text-[color:var(--status-warning)]">
                  Nincs hozzád rendelt aktív projekt — az összes látható aktív projekt szerepel.
                </span>
              )}
            </div>
            {!coreReady && !coreError ? (
              <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Projektek betöltése…</div>
            ) : coreError ? (
              <p className="p-4 text-sm text-muted-foreground">A projektlista nem elérhető; a fenti Újrapróbálással töltheted be.</p>
            ) : rows.length === 0 ? (
              <EmptyState icon={Briefcase} title="Nincs aktív projekt" description="Megnyert Sales-ügyből vagy a Projektek oldalon jön létre projekt." />
            ) : (
              <ul className="grid gap-3 p-3 lg:grid-cols-2">
                {rows.map((r) => <ProjectDayCard key={r.project.id} row={r} companyLabel={companyLabel} attendanceReady={attProjectsQ.isSuccess && attEntriesQ.isSuccess} />)}
              </ul>
            )}
          </WorkspacePanel>

          <div className="flex min-w-0 flex-col gap-4">
            {/* 4. Mai feladatok és felelősök */}
            <DayTasksPanel items={dayTasks} loading={!tasksQ.isSuccess && !tasksQ.isError} error={tasksQ.isError} onRetry={() => tasksQ.refetch()} />
            {/* 5. Jelenlét ma */}
            <AttendanceTodayPanel
              loading={attEntriesQ.isLoading}
              error={attEntriesQ.isError}
              onRetry={() => attEntriesQ.refetch()}
              entries={attEntriesQ.data ?? []}
            />
            <NotInCrmNotice />
          </div>
        </div>
      </div>
    </div>
  );
}

function FocusCard({ focus, companyLabel, onRetry }: { focus: ReturnType<typeof pmFocus>; companyLabel: (id: string | null | undefined) => string; onRetry: () => void }) {
  if (focus.state === "loading")
    return <div className="flex items-center gap-2 rounded-lg border bg-card p-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />A mai teendő összeállítása…</div>;
  if (focus.state === "error")
    return (
      <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        A mai teendő nem számolható, mert nem minden projektadat töltődött be.
        <Button size="sm" variant="outline" className="ml-2" onClick={onRetry}>Újrapróbálás</Button>
      </div>
    );
  if (focus.state === "empty")
    return <PrimaryActionCard eyebrow="Most ezzel kezdj" title="Nincs aktív projekted" detail="Amint egy megnyert ügyből projekt lesz, itt jelenik meg az első teendő." action={<Button size="sm" variant="outline" asChild><Link to="/projects">Projektek</Link></Button>} />;
  const { row } = focus;
  const name = row.project.title ?? "Projekt";
  return (
    <PrimaryActionCard
      eyebrow={focus.state === "calm" ? "Ma minden rendben" : "Most ezzel kezdj"}
      title={`${name}: ${row.next.title}`}
      detail={[row.project.company_id ? companyLabel(row.project.company_id) : null, row.next.detail].filter(Boolean).join(" · ")}
      warnings={row.next.warnings}
      action={
        <Button size="sm" asChild>
          <Link to="/projects/$id" params={{ id: row.project.id }} search={{ tab: row.next.tab } as any}>{row.next.button}</Link>
        </Button>
      }
    />
  );
}

function BossCard() {
  return (
    <section aria-label="Boss segítség" className="rounded-lg border bg-card p-3">
      <div className="flex items-center gap-1.5 text-sm font-semibold"><Hammer className="h-4 w-4 text-primary" />Boss segít</div>
      <p className="mt-1 text-xs text-muted-foreground">
        A kérdés előre beíródik, te küldöd el. Boss a projekteket, feladatokat, utánkövetéseket és találkozókat olvassa — dokumentumot, fotót és jelenlétet nem lát, és semmit nem módosít.
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {([
          ["daily-pm", "Mai áttekintés"],
          ["blocked", "Akadályok"],
          ["deadlines", "Határidők"],
        ] as const).map(([quick, label]) => (
          <Button key={quick} asChild size="sm" variant="outline">
            <Link to="/ai-assistant" search={{ agent: "pm", quick } as any}><Bot />{label}</Link>
          </Button>
        ))}
      </div>
    </section>
  );
}

function Chip({ tone, children, title }: { tone: "danger" | "warning" | "ok" | "muted" | "info"; children: React.ReactNode; title?: string }) {
  const cls = {
    danger: "border-destructive/40 bg-destructive/10 text-destructive",
    warning: "border-[color:var(--status-warning)]/40 bg-[color:var(--status-warning)]/10 text-[color:var(--status-warning)]",
    ok: "border-[color:var(--status-success)]/40 bg-[color:var(--status-success)]/10 text-[color:var(--status-success)]",
    info: "border-[color:var(--status-info)]/40 bg-[color:var(--status-info)]/10 text-[color:var(--status-info)]",
    muted: "border-border bg-muted/40 text-muted-foreground",
  }[tone];
  return <span title={title} className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium", cls)}>{children}</span>;
}

function ProjectDayCard({ row, companyLabel, attendanceReady }: { row: PmRow; companyLabel: (id: string | null | undefined) => string; attendanceReady: boolean }) {
  const p = row.project;
  const status = p.status ?? "";
  const construction = status === "kivitelezes";
  return (
    <li className="flex min-w-0 flex-col gap-2 rounded-lg border bg-background p-3">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <Link to="/projects/$id" params={{ id: p.id }} className="block truncate font-semibold text-primary hover:underline">{p.title ?? "Névtelen projekt"}</Link>
          <div className="truncate text-xs text-muted-foreground">
            {p.company_id ? companyLabel(p.company_id) : "Nincs ügyfél"}
            {p.address ? <> · <MapPin className="inline h-3 w-3" /> {p.address}</> : null}
          </div>
        </div>
        <Badge variant="outline" className={cn("shrink-0", PROJECT_STATUS_TONE[status] ?? "")}>{PROJECT_STATUS_LABEL[status] ?? (status || "—")}</Badge>
      </div>
      <div className="flex flex-wrap gap-1.5" aria-label="Projekt napi állapota">
        {row.overdue.length > 0 && <Chip tone="danger"><AlertTriangle className="h-3 w-3" />{row.overdue.length} lejárt</Chip>}
        {row.blocked.length > 0 && <Chip tone="danger">{row.blocked.length} akadály</Chip>}
        {row.today.length > 0 && <Chip tone="warning">{row.today.length} mai feladat</Chip>}
        {row.openTasks.length === 0 && <Chip tone="muted">Nincs nyitott feladat</Chip>}
        {construction && (row.noteToday ? <Chip tone="ok"><StickyNote className="h-3 w-3" />Mai jegyzet kész</Chip> : <Chip tone="warning"><StickyNote className="h-3 w-3" />Ma nincs jegyzet</Chip>)}
        <Chip tone={row.docs.total ? "muted" : "warning"}><FolderOpen className="h-3 w-3" />{row.docs.total} fájl</Chip>
        <Chip tone={row.docs.photo ? "muted" : construction ? "warning" : "muted"}><Camera className="h-3 w-3" />{row.docs.photo} fotó</Chip>
        {attendanceReady && (row.attendance.matched
          ? <Chip tone={row.attendance.workersToday ? "info" : "muted"} title="Név szerinti egyezés a jelenléti naplóval (nem mentett kapcsolat)"><Users className="h-3 w-3" />{row.attendance.workersToday} fő ma</Chip>
          : construction ? <Chip tone="muted" title="A jelenléti naplóban nincs azonos nevű projekt">Jelenlét: nincs összekötve</Chip> : null)}
        {p.deadline && <Chip tone={row.deadline.passed ? "danger" : row.deadline.daysLeft != null && row.deadline.daysLeft <= 7 ? "warning" : "muted"}><CalendarDays className="h-3 w-3" />Határidő {fmtDate(p.deadline)}</Chip>}
      </div>
      <div className="mt-auto flex flex-col gap-2 border-t pt-2">
        <span className="text-xs"><span className="text-muted-foreground">Következő: </span><span className="font-medium">{row.next.title}</span></span>
        <div className="flex flex-wrap justify-end gap-1.5">
          {construction && (
            <Button size="sm" variant="outline" asChild>
              <Link to="/attendance/quick" search={(row.attendance.matched ? { project: row.attendance.matched.id } : {}) as any}><Zap />Jelenlét</Link>
            </Button>
          )}
          <Button size="sm" asChild>
            <Link to="/projects/$id" params={{ id: p.id }} search={{ tab: row.next.tab } as any}>{row.next.button}</Link>
          </Button>
        </div>
      </div>
    </li>
  );
}

function DayTasksPanel({ items, loading, error, onRetry }: { items: { t: PmTask; f: ReturnType<typeof classifyTask> }[]; loading: boolean; error: boolean; onRetry: () => void }) {
  const userLabel = useLookup("users_profile_lookup", "full_name");
  const projectLabel = useLookup("projects", "title");
  const upsert = useUpsert("tasks");
  return (
    <WorkspacePanel title="Mai feladatok és felelősök" subtitle="Lejárt, ma esedékes és akadályozott" to="/tasks">
      {loading ? (
        <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Feladatok betöltése…</div>
      ) : error ? (
        <div className="p-4 text-sm text-muted-foreground">A feladatok nem tölthetők be. <Button size="sm" variant="outline" onClick={onRetry}>Újrapróbálás</Button></div>
      ) : items.length === 0 ? (
        <EmptyState icon={ListChecks} title="Mára nincs sürgős feladat" description="Új teendőt az Új feladat gombbal vehetsz fel, projekthez és felelőshöz kötve." />
      ) : (
        <ul className="divide-y text-sm">
          {items.map(({ t, f }) => (
            <li key={t.id} className="flex min-w-0 flex-col gap-1 px-4 py-2.5">
              <div className="flex min-w-0 items-start justify-between gap-2">
                <span className="min-w-0 break-words font-medium">{t.title ?? "Névtelen feladat"}</span>
                <Button
                  size="sm" variant="outline" className="h-7 shrink-0 px-2 text-xs"
                  disabled={upsert.isPending}
                  title="Késznek jelöli a feladatot (a Feladatok oldalon visszaállítható)"
                  onClick={() => upsert.mutate({ id: t.id, status: "done" })}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />Kész
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                {t.project_id
                  ? <Link to="/projects/$id" params={{ id: t.project_id }} search={{ tab: "tasks" } as any} className="text-primary hover:underline">{projectLabel(t.project_id)}</Link>
                  : <span>Projekt nélkül</span>}
                <span>· Felelős: {t.assigned_user ? userLabel(t.assigned_user) : <span className="text-[color:var(--status-warning)]">nincs kijelölve</span>}</span>
                <span className={cn(f.overdue && "font-semibold text-destructive")}>· {t.due_date ? fmtDateTime(t.due_date) : "nincs határidő"}</span>
                {f.blocked && <Badge variant="outline" className="border-destructive/40 text-destructive">{tStatus("task", t.status)}</Badge>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </WorkspacePanel>
  );
}

function AttendanceTodayPanel({ loading, error, onRetry, entries }: {
  loading: boolean; error: boolean; onRetry: () => void;
  entries: (PmAttendanceEntry & { attendance_projects?: { name?: string } | null })[];
}) {
  const byProject = new Map<string, { name: string; workers: Set<string> }>();
  for (const e of entries) {
    const cur = byProject.get(e.project_id) ?? { name: e.attendance_projects?.name ?? "Projekt", workers: new Set<string>() };
    cur.workers.add(e.worker_id);
    byProject.set(e.project_id, cur);
  }
  const list = [...byProject.entries()].sort((a, b) => b[1].workers.size - a[1].workers.size);
  return (
    <WorkspacePanel title="Jelenlét ma" subtitle="A jelenléti napló mai rögzítései" to="/attendance">
      {loading ? (
        <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Jelenlét betöltése…</div>
      ) : error ? (
        <div className="p-4 text-sm text-muted-foreground">A jelenléti napló nem olvasható (jogosultság vagy kapcsolat). <Button size="sm" variant="outline" onClick={onRetry}>Újrapróbálás</Button></div>
      ) : list.length === 0 ? (
        <div className="space-y-2 p-4 text-sm">
          <p className="text-muted-foreground">Ma még nincs rögzített jelenlét.</p>
          <Button size="sm" asChild><Link to="/attendance/quick"><Zap />Gyors rögzítés</Link></Button>
        </div>
      ) : (
        <ul className="divide-y text-sm">
          {list.map(([id, v]) => (
            <li key={id} className="flex items-center justify-between gap-2 px-4 py-2">
              <span className="min-w-0 truncate">{v.name}</span>
              <span className="flex items-center gap-2">
                <span className="whitespace-nowrap tabular-nums font-semibold">{v.workers.size} fő</span>
                <Link to="/attendance/quick" search={{ project: id } as any} className="whitespace-nowrap text-xs text-primary hover:underline">+ rögzítés</Link>
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="border-t px-4 py-2 text-[11px] text-muted-foreground">
        A jelenléti napló saját projektlistát használ. A CRM-projekt kártyáján csak azonos név esetén látszik a létszám — ez nem mentett kapcsolat.
      </p>
    </WorkspacePanel>
  );
}

function NotInCrmNotice() {
  return (
    <details className="rounded-lg border bg-card p-3 text-sm">
      <summary className="cursor-pointer font-semibold"><ClipboardList className="mr-1 inline h-4 w-4" />Mit nem kezel még a CRM?</summary>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
        <li><strong>Anyagigény:</strong> nincs külön nyilvántartás. Addig vegyél fel feladatot a projekthez (pl. „Anyag: …”), felelőssel és határidővel.</li>
        <li><strong>Műszaki akadály:</strong> a feladat „Akadályozott” állapotával jelöld; a napi nézet ezt mutatja.</li>
        <li><strong>Teljesítésigazolás (TIG):</strong> a CRM nem állít ki és nem írat alá TIG-et. A projekt Átadás fülén csak a meglévő adatok ellenőrzőlistája látszik; az aláírt példányt a Dokumentumokhoz töltsd fel.</li>
        <li><strong>Napi lap:</strong> a projekt napi jegyzete és a jelenléti napló együtt adja; külön napi lap űrlap nincs.</li>
      </ul>
    </details>
  );
}
