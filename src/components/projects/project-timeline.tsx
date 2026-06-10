import { History, FileText, BellRing, ListChecks, Mail, Phone, Calendar, FolderOpen } from "lucide-react";
import { EmptyState } from "@/components/page-header";
import { formatDateTime } from "@/lib/format";

type Ev = {
  at: string;
  kind: "quote" | "quote_update" | "followup" | "followup_done" | "task" | "task_done" | "email" | "call" | "meeting" | "document";
  title: string;
  detail?: string;
};

const META: Record<Ev["kind"], { label: string; icon: any; tone: string }> = {
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
};

export function ProjectTimeline(props: {
  quotes?: any[]; followups?: any[]; tasks?: any[];
  emails?: any[]; calls?: any[]; meetings?: any[]; documents?: any[];
}) {
  const events: Ev[] = [];

  for (const r of props.quotes ?? []) {
    if (r.created_at) events.push({ at: r.created_at, kind: "quote", title: r.title ?? `Ajánlat #${String(r.id).slice(0, 8)}`, detail: r.status ?? undefined });
    if (r.updated_at && r.updated_at !== r.created_at) events.push({ at: r.updated_at, kind: "quote_update", title: r.title ?? `Ajánlat #${String(r.id).slice(0, 8)}`, detail: r.status ?? undefined });
  }
  for (const r of props.followups ?? []) {
    if (r.created_at) events.push({ at: r.created_at, kind: "followup", title: r.followup_type ?? "Follow-up", detail: r.result ?? undefined });
    if (r.completed && (r.completed_at ?? r.updated_at)) events.push({ at: r.completed_at ?? r.updated_at, kind: "followup_done", title: r.followup_type ?? "Follow-up", detail: r.result ?? undefined });
  }
  for (const r of props.tasks ?? []) {
    if (r.created_at) events.push({ at: r.created_at, kind: "task", title: r.title ?? r.description ?? "Feladat" });
    if ((r.completed ?? r.done) && (r.completed_at ?? r.updated_at)) events.push({ at: r.completed_at ?? r.updated_at, kind: "task_done", title: r.title ?? r.description ?? "Feladat" });
  }
  for (const r of props.emails ?? []) {
    if (r.created_at) events.push({ at: r.created_at, kind: "email", title: r.subject ?? "(tárgy nélkül)", detail: r.from_address ?? r.direction });
  }
  for (const r of props.calls ?? []) {
    if (r.created_at) events.push({ at: r.created_at, kind: "call", title: r.phone_number ?? "Hívás", detail: r.direction });
  }
  for (const r of props.meetings ?? []) {
    const at = r.start_at ?? r.created_at;
    if (at) events.push({ at, kind: "meeting", title: r.title ?? "Találkozó", detail: r.location ?? undefined });
  }
  for (const r of props.documents ?? []) {
    if (r.created_at) events.push({ at: r.created_at, kind: "document", title: r.name ?? "Dokumentum", detail: r.document_type ?? undefined });
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