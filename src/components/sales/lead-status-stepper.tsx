import { LEAD_STATUSES, LEAD_STATUS_LABEL, type LeadStatus } from "@/lib/sales/constants";
import { cn } from "@/lib/utils";

// A "happy path" sorrend a state machine alapján (lost külön kezelt).
const PATH: LeadStatus[] = [
  "new",
  "contacted",
  "quote_prep",
  "quote_sent",
  "follow_up",
  "contract",
  "won",
];

export function LeadStatusStepper({ status }: { status: LeadStatus | string | null | undefined }) {
  const s = (status ?? "new") as LeadStatus;
  const isLost = s === "lost";
  const currentIdx = PATH.indexOf(s);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {PATH.map((step, i) => {
        const reached = !isLost && currentIdx >= i;
        const isCurrent = !isLost && currentIdx === i;
        return (
          <div key={step} className="flex items-center gap-1.5">
            <span
              className={cn(
                "rounded-full border px-2 py-0.5 text-[11px] font-medium",
                isCurrent
                  ? "border-primary bg-primary text-primary-foreground"
                  : reached
                    ? "border-[color:var(--status-success)]/40 bg-[color:var(--status-success)]/10 text-foreground"
                    : "border-border bg-muted text-muted-foreground",
              )}
            >
              {LEAD_STATUS_LABEL[step]}
            </span>
            {i < PATH.length - 1 && <span className="text-muted-foreground/40">›</span>}
          </div>
        );
      })}
      {isLost && (
        <span className="ml-2 rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
          {LEAD_STATUS_LABEL.lost}
        </span>
      )}
    </div>
  );
}