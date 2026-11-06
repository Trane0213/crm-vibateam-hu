import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
export function WorkspacePanel({ title, subtitle, to, children, className = "" }: { title: string; subtitle?: string; to?: string; children: ReactNode; className?: string }) {
  return <section className={`min-w-0 overflow-hidden rounded-lg border bg-card shadow-card ${className}`}><header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b px-4 py-3"><div className="min-w-0"><h2 className="font-display text-base font-semibold">{title}</h2>{subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}</div>{to && <Link to={to} className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary">Részletek<ArrowUpRight className="h-3.5 w-3.5" /></Link>}</header>{children}</section>;
}