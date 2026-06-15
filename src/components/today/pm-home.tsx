import { Link } from "@tanstack/react-router";
import { Briefcase, ListChecks, AlertTriangle, Hammer, Plus, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { WelcomeHeader } from "@/components/welcome-header";
import { HeroStat, SectionLabel, ListCard, QuickActions } from "@/components/today/today-shell";
import { useCount, useList } from "@/lib/db-hooks";
import { fmtDateTime } from "@/components/resource/resource-page";
import { tStatus } from "@/lib/i18n";
import { PROJECT_STATUS_LABEL, ACTIVE_PROJECT_STATUSES } from "@/lib/viba-constants";
import { useAuth } from "@/hooks/use-auth";

const isoNow = () => new Date().toISOString();
const isoStartOfDay = () => { const d = new Date(); d.setHours(0,0,0,0); return d.toISOString(); };
const isoEndOfDay = () => { const d = new Date(); d.setHours(23,59,59,999); return d.toISOString(); };

export function PmHome() {
  const now = isoNow();
  const todayStart = isoStartOfDay();
  const todayEnd = isoEndOfDay();
  const { user } = useAuth();
  const uid = user?.id ?? null;

  // A PM dashboard kizárólag az aktuális user-hez rendelt aktív projekteket
  // számolja (handoff_payload->>'project_manager_user_id'). A status szűrés a
  // listával azonos forrásból megy (ACTIVE_PROJECT_STATUSES), így a count és a
  // lista nem térhet el (PM count #4 + #5 fix).
  const activeProjects = useCount(
    "projects",
    (q) => {
      let qq = q.in("status", ACTIVE_PROJECT_STATUSES as unknown as string[]);
      if (uid) qq = qq.eq("handoff_payload->>project_manager_user_id", uid);
      return qq;
    },
    `active-pm:${uid ?? "anon"}`,
  );
  const todayTasks = useCount("tasks", (q) => q.neq("status", "done").gte("due_date", todayStart).lte("due_date", todayEnd), "today");
  const overdueTasks = useCount("tasks", (q) => q.neq("status", "done").lt("due_date", now), "overdue");
  const overdueFu = useCount("followups", (q) => q.eq("completed", false).lt("due_date", now), "overdue-fu");

  const tasks = useList<any>("tasks", { order: "due_date", ascending: true });
  const projects = useList<any>("projects", { order: "updated_at", ascending: false });

  const taskList = (tasks.data ?? []).filter((t: any) => t.status !== "done" && t.due_date).slice(0, 8);
  const projectList = (projects.data ?? [])
    .filter((p: any) => ACTIVE_PROJECT_STATUSES.includes(p.status as any))
    .filter((p: any) => !uid || (p?.handoff_payload?.project_manager_user_id ?? null) === uid)
    .slice(0, 8);

  return (
    <div className="flex flex-col">
      <WelcomeHeader subtitle="Mai projekt-teendők és a kivitelezés állapota." />

      <QuickActions>
        <Button size="sm" asChild><Link to="/projects" search={{ new: 1 } as any}><Plus className="mr-1 h-3.5 w-3.5" />Új projekt</Link></Button>
        <Button size="sm" variant="secondary" asChild><Link to="/tasks" search={{ new: 1 } as any}><Plus className="mr-1 h-3.5 w-3.5" />Új feladat</Link></Button>
        <Button size="sm" variant="outline" asChild><Link to="/ai-assistant" search={{ agent: "pm" } as any}><Bot className="mr-1 h-3.5 w-3.5" />Boss</Link></Button>
      </QuickActions>

      <div className="px-6 pt-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <HeroStat to="/projects" tone="primary" icon={Briefcase}     label="Aktív projektek"   value={activeProjects.data ?? 0} sub="folyamatban" />
          <HeroStat to="/tasks"    tone="warning" icon={ListChecks}    label="Ma esedékes feladat" value={todayTasks.data ?? 0} sub="mai határidős" />
          <HeroStat to="/tasks"    tone="danger"  icon={AlertTriangle} label="Lejárt feladat"    value={overdueTasks.data ?? 0} sub="határidőn túl" />
          <HeroStat to="/followups"tone="danger"  icon={Hammer}        label="Lejárt utókövetés" value={overdueFu.data ?? 0} sub="haladéktalanul" />
        </div>
      </div>

      <SectionLabel title="Mai feladatok" />
      <div className="grid gap-4 px-6 pb-6 lg:grid-cols-2">
        <ListCard
          title="Nyitott feladatok"
          description="esedékesség szerint"
          to="/tasks"
          empty={{ icon: ListChecks, title: "Nincs nyitott feladat" }}
          items={taskList.map((t: any) => {
            const overdue = new Date(t.due_date) < new Date();
            return (
              <li key={t.id} className="flex items-center justify-between gap-3">
                <span className="truncate font-medium">{t.title}</span>
                <span className="flex items-center gap-2">
                  <Badge variant="outline" className="font-normal">{tStatus("priority", t.priority)}</Badge>
                  <span className={`tabular-nums ${overdue ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
                    {fmtDateTime(t.due_date)}
                  </span>
                </span>
              </li>
            );
          })}
        />

        <ListCard
          title="Aktív projektek"
          description="legutóbb frissítve"
          to="/projects"
          empty={{ icon: Briefcase, title: "Nincs aktív projekt" }}
          items={projectList.map((p: any) => (
            <li key={p.id} className="flex items-center justify-between gap-3">
              <Link to="/projects/$id" params={{ id: p.id }} className="truncate text-primary hover:underline">
                {p.title ?? p.name ?? "—"}
              </Link>
              <Badge variant="outline" className="font-normal">{PROJECT_STATUS_LABEL[p.status] ?? p.status ?? "—"}</Badge>
            </li>
          ))}
        />
      </div>
    </div>
  );
}