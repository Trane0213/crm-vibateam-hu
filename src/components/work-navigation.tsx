import { Link, useRouterState } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/hooks/use-permissions";
import { isNavActive, primaryItems } from "@/lib/nav-config";

/** Shared shortcuts reuse the same role-filtered destinations as the main menu. */
export function WorkNavigation() {
  const { role } = usePermissions();
  const pathname = useRouterState({ select: s => s.location.pathname });
  if (role !== "sales" && role !== "marketing") return null;
  return <nav aria-label="Napi munkautak" className="flex min-w-0 gap-1 overflow-x-auto border-b bg-card px-3 py-2 sm:px-6">
    {primaryItems(role).map(item => <Button key={item.url} asChild size="sm" variant={isNavActive(pathname,item.url)?"secondary":"ghost"} className="shrink-0 gap-2 rounded-md">
      <Link to={item.url} aria-current={isNavActive(pathname,item.url)?"page":undefined}><item.icon className="h-4 w-4"/>{item.short ?? item.title}</Link>
    </Button>)}
  </nav>;
}