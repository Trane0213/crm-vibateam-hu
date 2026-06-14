import { LEAD_STATUS_LABEL, LEAD_STATUS_TONE, type LeadStatus } from "@/lib/sales/constants";
import { cn } from "@/lib/utils";

export function StatusChip({ status, className }: { status: LeadStatus | string | null | undefined; className?: string }) {
  const s = (status ?? "new") as LeadStatus;
  const tone = LEAD_STATUS_TONE[s] ?? "bg-muted text-muted-foreground border-border";
  const label = LEAD_STATUS_LABEL[s] ?? s;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
        tone,
        className,
      )}
    >
      {label}
    </span>
  );
}