import { NextStepCell } from "@/components/sales/next-step-cell";
import { Sparkles, Building2, User, Coins } from "lucide-react";
import { formatHuf } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PipelineLead } from "./pipeline-types";

export function PipelineCard({
  lead,
  onOpen,
  active,
}: {
  lead: PipelineLead;
  onOpen: (id: string) => void;
  active?: boolean;
}) {
  const now = new Date();
  const due = lead.next_step_due_at ? new Date(lead.next_step_due_at) : null;
  const overdue = due && due < now;
  return (
    <button
      type="button"
      onClick={() => onOpen(lead.id)}
      className={cn(
        "group w-full rounded-md border bg-card p-3 text-left text-sm shadow-sm transition",
        "hover:border-primary/40 hover:shadow",
        active ? "border-primary ring-1 ring-primary/30" : "border-border",
        overdue && "border-l-2 border-l-destructive",
      )}
    >
      <div className="flex items-start gap-2">
        <Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold leading-tight">
            {lead.company_name || lead.summary || "Névtelen lead"}
          </div>
          {lead.summary && lead.company_name && (
            <div className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
              {lead.summary}
            </div>
          )}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        {lead.source && (
          <span className="inline-flex items-center gap-1">
            <Sparkles className="h-3 w-3" /> {lead.source}
          </span>
        )}
        {lead.assignee_name && (
          <span className="inline-flex items-center gap-1">
            <User className="h-3 w-3" /> {lead.assignee_name}
          </span>
        )}
        {typeof lead.quote_total === "number" && (
          <span className="inline-flex items-center gap-1">
            <Coins className="h-3 w-3" /> {formatHuf(lead.quote_total)}
          </span>
        )}
      </div>

      <div className="mt-2 border-t pt-2">
        <NextStepCell type={lead.next_step_type} dueAt={lead.next_step_due_at} />
      </div>
    </button>
  );
}