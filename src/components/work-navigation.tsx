import { Link, useRouterState } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/hooks/use-permissions";
import { isNavActive, moreGroups, primaryItems } from "@/lib/nav-config";
import { MoreHorizontal } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

/** Shared shortcuts reuse the same role-filtered destinations as the main menu. */
export function WorkNavigation() {
  const { role } = usePermissions();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (role !== "sales" && role !== "marketing") return null;
  return (
    <nav
      aria-label="Napi munkautak"
      className="crm-work-nav flex min-w-0 gap-1 overflow-x-auto border-b bg-card px-3 py-2 sm:px-6"
    >
      {primaryItems(role).map((item) => (
        <Button
          key={item.url}
          asChild
          size="sm"
          variant={isNavActive(pathname, item.url) ? "default" : "ghost"}
          className="shrink-0 gap-2 rounded-md"
        >
          <Link to={item.url} title={item.title} aria-current={isNavActive(pathname, item.url) ? "page" : undefined}>
            <item.icon className="h-4 w-4" />
            {item.url === "/today" ? "Mai teendők" : item.title}
          </Link>
        </Button>
      ))}
      {role === "marketing" && <DropdownMenu>
        <DropdownMenuTrigger asChild><Button size="sm" variant="outline" className="shrink-0" aria-label="További marketinges oldalak"><MoreHorizontal />Továbbiak</Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-h-96 overflow-y-auto">
          {moreGroups(role).map((group) => <div key={group.label}>
            <DropdownMenuLabel>{group.label}</DropdownMenuLabel>
            {group.items.map((item) => <DropdownMenuItem key={item.url} asChild><Link to={item.url}><item.icon className="h-4 w-4" />{item.title}</Link></DropdownMenuItem>)}
            <DropdownMenuSeparator />
          </div>)}
        </DropdownMenuContent>
      </DropdownMenu>}
    </nav>
  );
}
