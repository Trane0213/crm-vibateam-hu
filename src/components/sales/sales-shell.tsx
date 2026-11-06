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
      <header className="border-b px-4 py-5 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="break-words text-2xl font-semibold tracking-normal">{title}</h1>
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
        <nav className="-mb-px mt-3 flex max-w-full gap-1 overflow-x-auto">
          {NAV.map((n) => {
            const active = n.exact ? pathname === n.to : pathname === n.to || pathname.startsWith(n.to + "/");
            return (
              <Link
                key={n.to}
                to={n.to as "/sales"}
                className={cn(
                  "shrink-0 rounded-t-md border-b-2 px-3 py-2 text-sm transition-colors",
                  active
                    ? "border-primary bg-primary/10 font-medium text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="min-w-0 flex-1 p-4 sm:p-6">{children}</main>
    </div>
  );
}