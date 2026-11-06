import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { usePermissions } from "@/hooks/use-permissions";
import { useVisibleAgents } from "@/hooks/use-visible-agents";
import { aiItems, isNavActive, moreGroups, primaryItems, type NavItem } from "@/lib/nav-config";

/** Mobil alsó menü: 4 fő munkafelület + „Továbbiak” lap (csempés rács). */
export function MobileBottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const searchStr = useRouterState({ select: (s) => s.location.searchStr });
  const { role } = usePermissions();
  const { visibleAgentIds } = useVisibleAgents();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname, searchStr]);

  const primary = primaryItems(role);
  const tabs = primary.slice(0, 4);
  const overflow = primary.slice(4);
  const groups = [
    ...(overflow.length ? [{ label: "Munkafelület", items: overflow }] : []),
    { label: "AI asszisztensek", items: aiItems(role, visibleAgentIds) },
    ...moreGroups(role),
  ].filter((g) => g.items.length > 0);
  const active = (item: NavItem) => item.search?.agent
    ? pathname === "/ai-assistant" && new URLSearchParams(searchStr).get("agent") === item.search.agent
    : isNavActive(pathname, item.url);
  const moreActive = groups.some(g => g.items.some(active)) && !tabs.some(active);

  const tab = (i: NavItem) => {
    const a = active(i);
    return (
      <Link
        key={i.url}
        to={i.url}
        aria-current={a ? "page" : undefined}
        className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors ${a ? "text-primary" : "text-muted-foreground"}`}
      >
        <span className={`flex h-7 w-12 items-center justify-center rounded-full transition-colors ${a ? "bg-primary/12" : ""}`}>
          <i.icon className="h-5 w-5" />
        </span>
        <span className="max-w-full truncate">{i.short ?? i.title}</span>
      </Link>
    );
  };

  return (
    <>
      <nav
        aria-label="Fő menü"
        className="fixed inset-x-0 bottom-0 z-40 flex border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        {tabs.map(tab)}
        <Button variant="ghost"
          type="button"
          onClick={() => setOpen(true)}
          className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${moreActive || open ? "text-primary" : "text-muted-foreground"}`}
        >
          <span className={`flex h-7 w-12 items-center justify-center rounded-full ${moreActive ? "bg-primary/12" : ""}`}>
            <MoreHorizontal className="h-5 w-5" />
          </span>
          Továbbiak
        </Button>
      </nav>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-xl pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
          <SheetHeader className="text-left">
            <SheetTitle className="font-display">Továbbiak</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-5">
            {groups.map((g) => (
              <section key={g.label}>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{g.label}</h3>
                <div className="grid gap-1 sm:grid-cols-2">
                  {g.items.map((i) => {
                    const a = active(i);
                    return (
                      <Link
                        key={i.url + (i.search?.agent ?? "")}
                        to={i.url}
                        {...(i.search ? { search: i.search as never } : {})}
                        aria-current={a ? "page" : undefined}
                        className={`flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm leading-snug transition-colors ${a ? "bg-primary/10 text-primary" : "bg-card hover:bg-accent"}`}
                      >
                        <i.icon className="h-5 w-5 shrink-0" />
                        <span className="min-w-0 break-words">{i.title}</span>
                      </Link>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
