import { Link } from "@tanstack/react-router";
import { FileText, BellRing, ListChecks, Sparkles } from "lucide-react";

type Chip = {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  to: string;
  tone: "primary" | "warning" | "danger" | "info";
};

const toneClass: Record<Chip["tone"], string> = {
  primary: "bg-primary/10 text-primary border-primary/20 hover:bg-primary/15",
  warning: "bg-[color:var(--status-warning)]/15 text-[color:var(--status-warning)] border-[color:var(--status-warning)]/30 hover:bg-[color:var(--status-warning)]/20",
  danger: "bg-destructive/10 text-destructive border-destructive/20 hover:bg-destructive/15",
  info: "bg-[color:var(--status-info)]/10 text-[color:var(--status-info)] border-[color:var(--status-info)]/20 hover:bg-[color:var(--status-info)]/15",
};

// TODO: backend — valós számok lekérése a /quotes, /followups, /tasks, /leads aggregátumokból
const chips: Chip[] = [
  { icon: FileText, label: "nyitott ajánlat", value: "—", to: "/quotes", tone: "primary" },
  { icon: BellRing, label: "lejárt follow-up", value: "—", to: "/followups", tone: "danger" },
  { icon: ListChecks, label: "ma esedékes", value: "—", to: "/tasks", tone: "warning" },
  { icon: Sparkles, label: "új lead", value: "—", to: "/leads", tone: "info" },
];

export function PulseBar() {
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