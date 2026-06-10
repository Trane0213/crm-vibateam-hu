import { History, FileText, BellRing, ListChecks, Mail, Phone, Calendar, FolderOpen, Briefcase, StickyNote, Pencil, Trash2 } from "lucide-react";
import { EmptyState } from "@/components/page-header";
import { formatDateTime } from "@/lib/format";
import { useQuery } from "@tanstack/react-query";
import { fetchProjectActivity, type ActivityEntry } from "@/lib/activity-log";

type Ev = {
  at: string;
  kind:
    | "project_created" | "project_closed"
    | "quote" | "quote_update"
    | "followup" | "followup_done"
    | "task" | "task_done"
    | "email" | "call" | "meeting"
    | "document" | "document_deleted"
    | "note"
    | "audit_create" | "audit_update" | "audit_delete";
  title: string;
  detail?: string;
};

const META: Record<Ev["kind"], { label: string; icon: any; tone: string }> = {
  project_created:{ label: "Projekt létrehozva",   icon: Briefcase,  tone: "text-primary" },
  project_closed: { label: "Projekt lezárva",      icon: Briefcase,  tone: "text-emerald-500" },
  quote:          { label: "Ajánlat létrehozva",   icon: FileText,   tone: "text-primary" },
  quote_update:   { label: "Ajánlat módosítva",    icon: FileText,   tone: "text-primary" },
  followup:       { label: "Follow-up létrehozva", icon: BellRing,   tone: "text-amber-500" },
  followup_done:  { label: "Follow-up lezárva",    icon: BellRing,   tone: "text-emerald-500" },
  task:           { label: "Feladat létrehozva",   icon: ListChecks, tone: "text-blue-500" },
  task_done:      { label: "Feladat lezárva",      icon: ListChecks, tone: "text-emerald-500" },
  email:          { label: "Email",                icon: Mail,       tone: "text-indigo-500" },
  call:           { label: "Hívás",                icon: Phone,      tone: "text-cyan-500" },
  meeting:        { label: "Találkozó",            icon: Calendar,   tone: "text-violet-500" },
  document:       { label: "Dokumentum feltöltve", icon: FolderOpen, tone: "text-slate-500" },
  document_deleted:{label: "Dokumentum törölve",   icon: FolderOpen, tone: "text-destructive" },
  note:           { label: "Jegyzet",              icon: StickyNote, tone: "text-slate-500" },
  audit_create:   { label: "Létrehozás",           icon: Briefcase,  tone: "text-emerald-500" },
  audit_update:   { label: "Módosítás",            icon: Pencil,     tone: "text-amber-500" },
  audit_delete:   { label: "Törlés",               icon: Trash2,     tone: "text-destructive" },
};

export function ProjectTimeline(props: {
  project?: any | null;
  projectId?: string;
  quotes?: any[]; followups?: any[]; tasks?: any[];
  emails?: any[]; calls?: any[]; meetings?: any[]; documents?: any[]; notes?: any[];
}) {
  const projectId = props.projectId ?? props.project?.id;
  const audit = useQuery({
    queryKey: ["activity_log", "project", projectId],
    enabled: !!projectId,
    queryFn: () => fetchProjectActivity(projectId as string),
  });

  const events: Ev[] = [];

  if (props.project) {
    const p = props.project;
    if (p.created_at) events.push({ at: p.created_at, kind: "project_created", title: p.title ?? "Projekt", detail: p.status ?? undefined });
    if ((p.status === "completed" || p.status === "lost") && (p.closed_at ?? p.updated_at)) {
      events.push({ at: p.closed_at ?? p.updated_at, kind: "project_closed", title: p.title ?? "Projekt", detail: p.status });
    }
  }

  for (const r of props.quotes ?? []) {
    if (r.created_at) events.push({ at: r.created_at, kind: "quote", title: r.title ?? `Ajánlat #${String(r.id).slice(0, 8)}`, detail: r.status ?? undefined });
    if (r.updated_at && r.updated_at !== r.created_at) events.push({ at: r.updated_at, kind: "quote_update", title: r.title ?? `Ajánlat #${String(r.id).slice(0, 8)}`, detail: r.status ?? undefined });
  }
  for (const r of props.followups ?? []) {
    if (r.created_at) events.push({ at: r.created_at, kind: "followup", title: r.followup_type ?? "Follow-up", detail: r.result ?? undefined });
    if (r.completed && r.due_date) events.push({ at: r.due_date, kind: "followup_done", title: r.followup_type ?? "Follow-up", detail: r.result ?? undefined });
  }
  for (const r of props.tasks ?? []) {
    if (r.created_at) events.push({ at: r.created_at, kind: "task", title: r.title ?? r.description ?? "Feladat" });
    if (r.status === "done" && r.due_date) events.push({ at: r.due_date, kind: "task_done", title: r.title ?? r.description ?? "Feladat" });
  }
  for (const r of props.emails ?? []) {
    if (r.created_at) events.push({ at: r.created_at, kind: "email", title: r.summary ?? "(összefoglaló nélkül)", detail: r.from_email ?? undefined });
  }
  for (const r of props.calls ?? []) {
    if (r.created_at) events.push({ at: r.created_at, kind: "call", title: r.summary ?? r.call_type ?? "Hívás", detail: [r.direction, r.outcome].filter(Boolean).join(" · ") || undefined });
  }
  for (const r of props.meetings ?? []) {
    const at = r.meeting_date ?? r.created_at;
    if (at) events.push({ at, kind: "meeting", title: r.title ?? "Találkozó", detail: r.location ?? r.summary ?? undefined });
  }
  for (const r of props.documents ?? []) {
    if (r.created_at) events.push({ at: r.created_at, kind: "document", title: r.name ?? "Dokumentum", detail: r.document_type ?? undefined });
  }
  for (const r of props.notes ?? []) {
    if (r.created_at) events.push({ at: r.created_at, kind: "note", title: (r.note ?? "").slice(0, 80) || "Jegyzet" });
  }

  // activity_log alapú audit események — ha a tábla létezik és van bejegyzés.
  for (const a of audit.data ?? []) {
    events.push(mapAudit(a));
  }

  events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  if (events.length === 0) {
    return <EmptyState icon={History} title="Még nincs esemény" description="Az új ajánlatok, follow-up-ok, feladatok és kommunikáció itt jelennek meg." />;
  }

  return (
    <ol className="relative ml-2 border-l border-border">
      {events.map((e, i) => {
        const M = META[e.kind];
        return (
          <li key={i} className="mb-4 ml-4">
            <span className="absolute -left-[9px] flex h-4 w-4 items-center justify-center rounded-full border bg-background">
              <M.icon className={`h-3 w-3 ${M.tone}`} />
            </span>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">{M.label}</span>
              <time className="text-xs text-muted-foreground tabular-nums">{formatDateTime(e.at)}</time>
            </div>
            <div className="mt-0.5 text-sm font-medium">{e.title}</div>
            {e.detail && <div className="text-xs text-muted-foreground">{e.detail}</div>}
          </li>
        );
      })}
    </ol>
  );
}