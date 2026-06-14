import { Phone, Mail, Calendar, MapPin, FileText, Send, RefreshCw, CircleDashed } from "lucide-react";
import { NEXT_STEP_LABEL, type NextStepType } from "@/lib/sales/constants";
import { cn } from "@/lib/utils";

const ICONS: Record<NextStepType, React.ComponentType<{ className?: string }>> = {
  phone: Phone,
  email: Mail,
  meeting: Calendar,
  site_visit: MapPin,
  doc_request: FileText,
  quote_send: Send,
  follow_up: RefreshCw,
  other: CircleDashed,
};

export function NextStepCell({
  type,
  dueAt,
  className,
}: {
  type: string | null | undefined;
  dueAt: string | null | undefined;
  className?: string;
}) {
  if (!type && !dueAt) {
    return <span className={cn("text-xs text-muted-foreground italic", className)}>nincs megadva</span>;
  }
  const Icon = (type && ICONS[type as NextStepType]) || CircleDashed;
  const label = (type && NEXT_STEP_LABEL[type as NextStepType]) || type || "—";
  const due = dueAt ? new Date(dueAt) : null;
  const now = new Date();
  const overdue = due && due < now;
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs", className)}>
      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      <span>{label}</span>
      {due && (
        <span className={cn("rounded px-1.5 py-0.5 text-[10px]", overdue ? "bg-rose-100 text-rose-800" : "bg-muted text-muted-foreground")}>
          {due.toLocaleDateString("hu-HU", { month: "short", day: "numeric" })}
        </span>
      )}
    </span>
  );
}