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
  return (
    <Link
      to={to}
      {...(search ? { search: search as any } : {})}
      data-tone={tone}
      className="crm-stat flex min-w-0 items-center gap-3 rounded-lg border p-3 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-4"
    >
      <div className="crm-stat-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-full">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="break-words text-xs font-medium">{label}</div>
        <div className="crm-stat-value mt-1 font-display text-3xl font-semibold tabular-nums leading-none">{value}</div>
        {sub && <div className="mt-1 break-words text-xs text-muted-foreground">{sub}</div>}
      </div>
    </Link>
  );
}

export function SectionLabel({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-5 pb-3 sm:px-6">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
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
        <div className="min-w-0">
          <CardTitle className="text-base">{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        {to && <Link to={to} className="text-xs text-primary hover:underline">Mind</Link>}
      </CardHeader>
      <CardContent>
        {!hasItems && empty
          ? <EmptyState icon={empty.icon} title={empty.title} />
          : <ul className="divide-y text-sm [&>li]:min-w-0 [&>li]:py-2.5">{items}</ul>}
      </CardContent>
    </Card>
  );
}

export function QuickActions({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 px-4 pt-4 pb-2 sm:px-6">
      {children}
    </div>
  );
}