import { Link, useRouterState } from "@tanstack/react-router";
import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

const NAV: { to: string; label: string; exact?: boolean }[] = [
  { to: "/sales", label: "Áttekintés", exact: true },
  { to: "/sales/leads", label: "Leadek" },
  { to: "/sales/todo", label: "Teendők" },
  { to: "/sales/quotes", label: "Ajánlatok" },
  { to: "/sales/handoff", label: "Átadás" },
];

export function SalesShell({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="flex flex-col">
      <header className="border-b bg-background/80 px-6 py-4 backdrop-blur">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
            {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
          </div>
          <div className="flex items-center gap-2">
            {actions}
            <Button asChild size="sm" variant="secondary">
              <Link to="/leads">
                <Plus className="mr-1 h-4 w-4" /> Új lead
              </Link>
            </Button>
          </div>
        </div>
        <nav className="-mb-px mt-3 flex gap-1">
          {NAV.map((n) => {
            const active = n.exact ? pathname === n.to : pathname === n.to || pathname.startsWith(n.to + "/");
            return (
              <Link
                key={n.to}
                to={n.to as "/sales"}
                className={cn(
                  "rounded-t-md border-b-2 px-3 py-1.5 text-sm transition",
                  active
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}