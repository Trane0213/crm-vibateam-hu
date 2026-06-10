import { createFileRoute } from "@tanstack/react-router";
import { ListChecks } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  ResourcePage,
  fmtDateTime,
  useLookup,
} from "@/components/resource/resource-page";

const TASK_STATUS = [
  { value: "open", label: "Nyitott" },
  { value: "in_progress", label: "Folyamatban" },
  { value: "blocked", label: "Akadályozott" },
  { value: "done", label: "Kész" },
];
const TASK_PRIORITY = [
  { value: "low", label: "Alacsony" },
  { value: "normal", label: "Normál" },
  { value: "high", label: "Magas" },
  { value: "urgent", label: "Sürgős" },
];
const STATUS_TONE: Record<string, string> = {
  open: "bg-[color:var(--status-info)]/15 text-[color:var(--status-info)] border-[color:var(--status-info)]/30",
  in_progress: "bg-primary/10 text-primary border-primary/30",
  blocked: "bg-destructive/10 text-destructive border-destructive/30",
  done: "bg-[color:var(--status-success)]/15 text-[color:var(--status-success)] border-[color:var(--status-success)]/30",
};
const PRIO_TONE: Record<string, string> = {
  low: "bg-muted text-muted-foreground border-border",
  normal: "bg-muted text-foreground border-border",
  high: "bg-[color:var(--status-warning)]/15 text-[color:var(--status-warning)] border-[color:var(--status-warning)]/30",
  urgent: "bg-destructive/10 text-destructive border-destructive/30",
};

function TasksPage() {
  const userLabel = useLookup("users_profile", "full_name");
  return (
    <ResourcePage
      title="Feladatok"
      description="Napi teendők és felelősök."
      icon={ListChecks}
      table="tasks"
      order="due_date"
      ascending={true}
      fields={[
        { name: "title", label: "Megnevezés", type: "text", required: true },
        { name: "description", label: "Leírás", type: "textarea" },
        {
          name: "assigned_user",
          label: "Felelős",
          type: "ref",
          ref: { table: "users_profile", labelColumn: "full_name" },
        },
        { name: "status", label: "Státusz", type: "select", options: TASK_STATUS, required: true },
        { name: "priority", label: "Prioritás", type: "select", options: TASK_PRIORITY, required: true },
        { name: "due_date", label: "Határidő", type: "datetime" },
      ]}
      columns={[
        { key: "title", label: "Megnevezés", className: "font-medium" },
        {
          key: "status",
          label: "Státusz",
          render: (r) => (
            <Badge variant="outline" className={STATUS_TONE[r.status] ?? ""}>
              {TASK_STATUS.find((o) => o.value === r.status)?.label ?? r.status ?? "—"}
            </Badge>
          ),
        },
        {
          key: "priority",
          label: "Prioritás",
          render: (r) => (
            <Badge variant="outline" className={PRIO_TONE[r.priority] ?? ""}>
              {TASK_PRIORITY.find((o) => o.value === r.priority)?.label ?? r.priority ?? "—"}
            </Badge>
          ),
        },
        { key: "assigned", label: "Felelős", render: (r) => userLabel(r.assigned_user) },
        {
          key: "due_date",
          label: "Határidő",
          className: "tabular-nums",
          render: (r) => {
            const overdue =
              r.due_date && r.status !== "done" && new Date(r.due_date) < new Date();
            return (
              <span className={overdue ? "text-destructive font-semibold" : ""}>
                {fmtDateTime(r.due_date)}
              </span>
            );
          },
        },
      ]}
    />
  );
}

export const Route = createFileRoute("/_authenticated/tasks")({
  component: TasksPage,
});