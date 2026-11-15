import { Link, useRouterState } from "@tanstack/react-router";
import { usePermissions } from "@/hooks/use-permissions";
import { WS_AREA_LABEL, wsAreasForRole, wsItemsForRole } from "@/lib/workspace-v2/nav";
import { StatusBadge } from "./status-badge";
import { cn } from "@/lib/utils";

/** Az új munkaterület saját menüje (asztalon bal sáv, mobilon vízszintes lista). */
export function WsNav() {
  const { role } = usePermissions();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const items = wsItemsForRole(role);
  const areas = wsAreasForRole(role);
  const isActive = (url: string) => url !== "/munka" && (pathname === url || pathname.startsWith(url + "/") || (url === "/munka/ugyfelek" && pathname.startsWith("/munka/ugyfel/")) || (url === "/munka/sales/ajanlatok" && pathname.startsWith("/munka/sales/ajanlat/")));
  return (
    <nav aria-label="Új munkaterület" className="flex gap-1 overflow-x-auto pb-1 lg:sticky lg:top-4 lg:w-52 lg:shrink-0 lg:flex-col lg:overflow-visible">
      {areas.map((a) => (
        <div key={a} className="contents lg:block lg:space-y-0.5 lg:pb-3">
          <div className="hidden px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground lg:block">{WS_AREA_LABEL[a]}</div>
          {items.filter((i) => i.area === a).map((i) => i.state === "planned" ? (
            <div key={i.key} className="hidden items-center justify-between gap-2 rounded-md px-3 py-1.5 text-sm text-muted-foreground lg:flex" title={i.note}>
              <span className="min-w-0 truncate">{i.title}</span><StatusBadge status="planned" />
            </div>
          ) : (
            <Link key={i.key} to={i.url}
              className={cn("shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition lg:block",
                isActive(i.url) ? "bg-primary text-primary-foreground" : "text-foreground/80 hover:bg-muted")}>
              {areas.length > 1 && <span className="mr-1 text-[10px] opacity-70 lg:hidden">{a === "sales" ? "S" : "M"}</span>}
              {i.title}{i.state === "legacy" && <span className="ml-1 text-[10px] opacity-70">(régi)</span>}
            </Link>
          ))}
        </div>
      ))}
      <Link to="/munka" className="hidden px-3 pt-2 text-xs text-muted-foreground hover:text-foreground lg:block">Munkaterület beállítása</Link>
    </nav>
  );
}
