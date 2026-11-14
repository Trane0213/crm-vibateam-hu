/**
 * Sales → projektvezető átadási ellenőrzőlista megjelenítése.
 * Minden tétel a `sales-pm-handoff.ts` modellből jön: állapot, forrás,
 * felelős szerepkör és a pótlás helye. Nem ír adatot.
 */
import { AlertTriangle, Ban, CheckCircle2, CircleDashed, CircleHelp, Link2Off } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  HANDOFF_NOT_IN_CRM, HANDOFF_PHASE_LABEL, HANDOFF_ROLE_LABEL, HANDOFF_STATE_LABEL,
  type HandoffItem, type HandoffPhase, type HandoffState, type HandoffSummary,
} from "@/lib/handoff/sales-pm-handoff";

const ICON: Record<HandoffState, typeof CheckCircle2> = {
  ok: CheckCircle2, missing: AlertTriangle, pending: CircleDashed, not_linked: Link2Off, unknown: CircleHelp,
};
const TONE: Record<HandoffState, string> = {
  ok: "text-[color:var(--status-success)]",
  missing: "text-destructive",
  pending: "text-[color:var(--status-warning)]",
  not_linked: "text-muted-foreground",
  unknown: "text-muted-foreground",
};
const PHASE_TONE: Record<HandoffPhase, string> = {
  ok: "border-[color:var(--status-success)]/40 bg-[color:var(--status-success)]/10 text-[color:var(--status-success)]",
  check: "border-[color:var(--status-warning)]/40 bg-[color:var(--status-warning)]/10 text-[color:var(--status-warning)]",
  pm_start: "border-[color:var(--status-info)]/40 bg-[color:var(--status-info)]/10 text-[color:var(--status-info)]",
  pm_gap: "border-destructive/40 bg-destructive/10 text-destructive",
  sales_gap: "border-destructive/40 bg-destructive/10 text-destructive",
  owner_gap: "border-destructive/40 bg-destructive/10 text-destructive",
  unknown: "border-border bg-muted text-muted-foreground",
};

export function HandoffPhaseBadge({ phase, className }: { phase: HandoffPhase; className?: string }) {
  return <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium", PHASE_TONE[phase], className)}>{HANDOFF_PHASE_LABEL[phase]}</span>;
}

/** Hogy a néző a pótlás helyére léphet-e (navigáció mindig mehet, írni csak a meglévő jogosultsággal). */
export type FixLabel = (item: HandoffItem) => string | null;

export function HandoffChecklist({
  summary, title = "Sales → projektvezető átadás", onFix, fixLabel, highlightRole,
}: {
  summary: HandoffSummary;
  title?: string;
  onFix?: (item: HandoffItem) => void;
  fixLabel?: FixLabel;
  /** A néző szerepköre — a saját tételei kiemelve. */
  highlightRole?: string | null;
}) {
  const done = summary.items.filter((i) => i.state === "ok").length;
  const counted = summary.items.filter((i) => i.state !== "not_linked").length;
  return (
    <section aria-label={title} className="rounded-lg border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground tabular-nums">{done}/{counted} rendben</span>
          <HandoffPhaseBadge phase={summary.phase} />
        </div>
      </header>
      <ul className="divide-y text-sm">
        {summary.items.map((i) => {
          const Icon = ICON[i.state];
          const label = onFix ? fixLabel?.(i) ?? null : null;
          const mine = highlightRole === i.role && (i.state === "missing" || i.state === "pending");
          return (
            <li key={i.key} data-handoff-item={i.key} data-state={i.state} className={cn("flex flex-col gap-1.5 px-3 py-2 sm:flex-row sm:items-start", mine && "bg-primary/5")}>
              <Icon className={cn("mt-0.5 hidden h-4 w-4 shrink-0 sm:block", TONE[i.state])} aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Icon className={cn("h-4 w-4 shrink-0 sm:hidden", TONE[i.state])} aria-hidden />
                  <span className="font-medium">{i.label}</span>
                  <Badge variant="outline" className={cn("text-[10px]", TONE[i.state])}>{HANDOFF_STATE_LABEL[i.state]}</Badge>
                  <Badge variant="outline" className="text-[10px] text-muted-foreground">Felelős: {HANDOFF_ROLE_LABEL[i.role]}</Badge>
                </div>
                <p className="mt-0.5 break-words text-xs text-muted-foreground">{i.detail}</p>
                <p className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground/80">Forrás: {i.source.label}</p>
              </div>
              {label && (
                <Button size="sm" variant={i.state === "missing" ? "default" : "outline"} className="h-8 shrink-0 self-start" onClick={() => onFix!(i)}>{label}</Button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Ami az átadáshoz tartozna, de a CRM-ben nincs adatmodellje — nem szimuláljuk. */
export function HandoffNotInCrm() {
  return (
    <section aria-label="Nincs a CRM-ben" className="rounded-lg border border-dashed bg-muted/20 p-3">
      <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"><Ban className="h-3.5 w-3.5" />Nincs a CRM-ben (NINCS ÖSSZEKÖTVE)</h3>
      <ul className="mt-2 space-y-1.5 text-xs">
        {HANDOFF_NOT_IN_CRM.map((n) => (
          <li key={n.key}><span className="font-medium">{n.label}:</span> <span className="text-muted-foreground">{n.detail}</span></li>
        ))}
      </ul>
    </section>
  );
}
