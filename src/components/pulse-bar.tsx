import { Link } from "@tanstack/react-router";
import { FileText, BellRing, ListChecks, Sparkles } from "lucide-react";
import { useCount } from "@/lib/db-hooks";

const toneClass = {
  primary: "bg-primary/10 text-primary border-primary/20 hover:bg-primary/15",
  warning:
    "bg-[color:var(--status-warning)]/15 text-[color:var(--status-warning)] border-[color:var(--status-warning)]/30 hover:bg-[color:var(--status-warning)]/20",
  danger: "bg-destructive/10 text-destructive border-destructive/20 hover:bg-destructive/15",
  info: "bg-[color:var(--status-info)]/10 text-[color:var(--status-info)] border-[color:var(--status-info)]/20 hover:bg-[color:var(--status-info)]/15",
} as const;

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
function endOfToday() {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}
function weekAgo() {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString();
}

export function PulseBar() {
  const nowIso = new Date().toISOString();
  const todayStart = startOfToday();
  const todayEnd = endOfToday();
  const weekStart = weekAgo();

  const openQuotes = useCount(
    "quotes",
    (q) => q.not("status", "in", "(won,lost)"),
    "open",
  );
  const overdueFu = useCount(
    "followups",
    (q) => q.eq("completed", false).lt("due_date", nowIso),
    "overdue",
  );
  const tasksToday = useCount(
    "tasks",
    (q) =>
      q.neq("status", "done").gte("due_date", todayStart).lte("due_date", todayEnd),
    "today",
  );
  const newLeads = useCount(
    "leads",
    (q) => q.gte("created_at", weekStart),
    "week",
  );

  const chips = [
    {
      icon: FileText,
      label: "nyitott ajánlat",
      value: openQuotes.data ?? "—",
      to: "/quotes" as const,
      tone: "primary" as const,
    },
    {
      icon: BellRing,
      label: "lejárt utókövetés",
      value: overdueFu.data ?? "—",
      to: "/followups" as const,
      tone: "danger" as const,
    },
    {
      icon: ListChecks,
      label: "ma esedékes",
      value: tasksToday.data ?? "—",
      to: "/tasks" as const,
      tone: "warning" as const,
    },
    {
      icon: Sparkles,
      label: "új lead (7 nap)",
      value: newLeads.data ?? "—",
      to: "/leads" as const,
      tone: "info" as const,
    },
  ];

  return (
    <div className="flex items-center gap-2 overflow-x-auto border-b bg-muted/30 px-4 py-2">
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground mr-2">
        Ajánlat-pulzus
      </span>
      {chips.map((c) => (
        <Link
          key={c.to}
          to={c.to}
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${toneClass[c.tone]}`}
        >
          <c.icon className="h-3.5 w-3.5" />
          <span className="tabular-nums font-semibold">{c.value}</span>
          <span className="opacity-80">{c.label}</span>
        </Link>
      ))}
    </div>
  );
}