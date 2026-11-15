import { cn } from "@/lib/utils";

export type WsStatus = "auto" | "review" | "missing" | "approval" | "done" | "planned";

export const WS_STATUS_LABEL: Record<WsStatus, string> = {
  auto: "Automatikusan kész",
  review: "Ellenőrizendő",
  missing: "Hiányzó adat",
  approval: "Jóváhagyásra vár",
  done: "Befejezett",
  planned: "Tervezett",
};

const CLS: Record<WsStatus, string> = {
  auto: "bg-primary/10 text-primary",
  review: "bg-status-warning/15 text-foreground",
  missing: "bg-destructive/10 text-destructive",
  approval: "bg-accent text-accent-foreground",
  done: "bg-status-success/15 text-status-success",
  planned: "bg-muted text-muted-foreground",
};

export function StatusBadge({ status, label, className }: { status: WsStatus; label?: string; className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold", CLS[status], className)}>
      {label ?? WS_STATUS_LABEL[status]}
    </span>
  );
}
