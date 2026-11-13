import { Link } from "@tanstack/react-router";
import { CheckCircle2, Circle, AlertTriangle, ArrowRight, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Readiness } from "@/lib/sales/sales-flow";

/** Ellenőrzőlista: kötelező hiány piros, ajánlott hiány halvány. Csak megjelenítés. */
export function ReadinessList({ readiness, title, note }: { readiness: Readiness; title: string; note?: string }) {
  const { checks, ready, missingBlocking, done } = readiness;
  return (
    <section aria-label={title} className="rounded-lg border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 text-[11px] font-medium",
            ready
              ? "border-[color:var(--status-success)]/40 bg-[color:var(--status-success)]/10 text-[color:var(--status-success)]"
              : "border-destructive/40 bg-destructive/10 text-destructive",
          )}
        >
          {ready ? `Kész · ${done}/${checks.length}` : `${missingBlocking} kötelező hiányzik`}
        </span>
      </header>
      <ul className="divide-y text-sm">
        {checks.map((c) => (
          <li key={c.key} className="flex items-start gap-2 px-3 py-1.5">
            {c.ok ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--status-success)]" aria-label="rendben" />
            ) : c.blocking ? (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-label="kötelező, hiányzik" />
            ) : (
              <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-label="ajánlott, hiányzik" />
            )}
            <div className="min-w-0">
              <span className={cn(!c.ok && c.blocking && "font-medium")}>{c.label}</span>
              {!c.ok && c.hint && <span className="block text-xs text-muted-foreground">{c.hint}</span>}
            </div>
            {!c.ok && !c.blocking && <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">ajánlott</span>}
          </li>
        ))}
      </ul>
      {note && <p className="border-t px-3 py-2 text-xs text-muted-foreground">{note}</p>}
    </section>
  );
}

export type FlowStage = { key: string; label: string; count: number | string; to: string; search?: Record<string, string>; hint: string };

/** Sales Ma: a teljes munkafolyamat egy sorban, darabszámmal és közvetlen belépővel. */
export function SalesFlowMap({ stages }: { stages: FlowStage[] }) {
  return (
    <nav aria-label="Sales munkafolyamat" className="rounded-lg border bg-card p-2">
      <ol className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:flex lg:items-stretch">
        {stages.map((s, i) => (
          <li key={s.key} className="flex min-w-0 items-center gap-1 lg:flex-1">
            <Link
              to={s.to}
              {...(s.search ? { search: s.search as any } : {})}
              title={s.hint}
              className="group flex min-w-0 flex-1 items-center gap-2 rounded-md border bg-background px-2.5 py-2 transition hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold group-hover:text-primary">{s.label}</span>
                <span className="block truncate text-[11px] text-muted-foreground">{s.hint}</span>
              </span>
              <span className="shrink-0 text-base font-semibold tabular-nums">{s.count}</span>
            </Link>
            {i < stages.length - 1 && <ChevronRight className="hidden h-4 w-4 shrink-0 text-muted-foreground/50 lg:block" aria-hidden />}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Elsődleges teendő kártya: egy cím, egy magyarázat, egy fő gomb. */
export function PrimaryActionCard({
  eyebrow, title, detail, warnings, action,
}: {
  eyebrow: string;
  title: string;
  detail: string;
  warnings?: string[];
  action?: React.ReactNode;
}) {
  return (
    <section aria-label="Következő teendő" className="rounded-lg border border-primary/30 bg-primary/5 p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-primary">{eyebrow}</div>
      <div className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold"><ArrowRight className="h-4 w-4 text-primary" />{title}</div>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      {!!warnings?.length && (
        <ul className="mt-2 space-y-0.5 text-xs text-[color:var(--status-warning)]">
          {warnings.map((w) => <li key={w} className="flex items-start gap-1"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />{w}</li>)}
        </ul>
      )}
      {action && <div className="mt-3 flex flex-wrap gap-2">{action}</div>}
    </section>
  );
}
