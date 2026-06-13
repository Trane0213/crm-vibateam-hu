import { Check, Circle } from "lucide-react";
import type { ChecklistItem, StepActionKind } from "@/lib/marketing-workflow";

export function WorkflowChecklist({
  items,
  onAction,
}: {
  items: ChecklistItem[];
  onAction: (action: StepActionKind, targetTab?: string) => void;
}) {
  const done = items.filter((i) => i.done).length;
  const total = items.length;
  const pct = Math.round((done / total) * 100);

  return (
    <div className="rounded-lg border bg-card p-3 sm:p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
          Hol tart a folyamat
        </div>
        <div className="text-xs font-medium tabular-nums text-muted-foreground">
          {done}/{total}
        </div>
      </div>

      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-[color:var(--status-success)] transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>

      <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
        {items.map((it) => (
          <li key={it.id} className="flex items-center gap-2 text-sm">
            {it.done ? (
              <Check className="h-4 w-4 shrink-0 text-[color:var(--status-success)]" />
            ) : (
              <Circle className="h-4 w-4 shrink-0 text-muted-foreground/60" />
            )}
            <span className={it.done ? "text-foreground" : "text-muted-foreground"}>
              {it.label}
              {it.hint && <span className="ml-1 text-xs text-muted-foreground">· {it.hint}</span>}
            </span>
            {!it.done && it.action && (
              <button
                type="button"
                className="ml-auto text-xs text-primary hover:underline"
                onClick={() => onAction(it.action!.action, it.action!.targetTab)}
              >
                {it.action.label}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}