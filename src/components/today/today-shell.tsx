import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/page-header";

/** Egységes hero KPI kártya a Today oldalakhoz. */
export function HeroStat({
  to, tone = "info", icon: Icon, label, value, sub, search,
}: {
  to: string;
  tone?: "danger" | "warning" | "info" | "success" | "primary";
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  sub?: string;
  search?: Record<string, string>;
}) {
  const toneClass = {
    danger:  "border-destructive/40 bg-destructive/5 hover:bg-destructive/10 text-destructive",
    warning: "border-[color:var(--status-warning)]/40 bg-[color:var(--status-warning)]/5 hover:bg-[color:var(--status-warning)]/10 text-[color:var(--status-warning)]",
    info:    "border-[color:var(--status-info)]/40 bg-[color:var(--status-info)]/5 hover:bg-[color:var(--status-info)]/10 text-[color:var(--status-info)]",
    success: "border-[color:var(--status-success)]/40 bg-[color:var(--status-success)]/5 hover:bg-[color:var(--status-success)]/10 text-[color:var(--status-success)]",
    primary: "border-primary/40 bg-primary/5 hover:bg-primary/10 text-primary",
  }[tone];
  return (
    <Link
      to={to}
      {...(search ? { search: search as any } : {})}
      className={`flex items-center gap-4 rounded-lg border p-5 transition ${toneClass}`}
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-background/60">
        <Icon className="h-6 w-6" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-medium uppercase tracking-wider opacity-80">{label}</div>
        <div className="mt-1 text-4xl font-bold tabular-nums leading-none">{value}</div>
        {sub && <div className="mt-1 text-xs opacity-70">{sub}</div>}
      </div>
    </Link>
  );
}

export function SectionLabel({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-6 pt-5 pb-2">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        <span className="inline-block h-2 w-2 rounded-full bg-primary/60" />
        {title}
      </div>
      {action}
    </div>
  );
}

export function ListCard({
  title, description, to, items, empty,
}: {
  title: string;
  description?: string;
  to?: string;
  items: ReactNode;
  empty?: { icon: React.ComponentType<{ className?: string }>; title: string };
}) {
  const hasItems = Array.isArray(items) ? items.length > 0 : !!items;
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        {to && <Link to={to} className="text-xs text-primary hover:underline">Mind</Link>}
      </CardHeader>
      <CardContent>
        {!hasItems && empty
          ? <EmptyState icon={empty.icon} title={empty.title} />
          : <ul className="space-y-2 text-sm">{items}</ul>}
      </CardContent>
    </Card>
  );
}

export function QuickActions({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 px-6 pb-2">
      {children}
    </div>
  );
}