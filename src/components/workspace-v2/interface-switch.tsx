import { Link } from "@tanstack/react-router";
import { LayoutDashboard, Sparkles } from "lucide-react";
import { useWorkspaceV2 } from "@/hooks/use-workspace-v2";
import { usePermissions } from "@/hooks/use-permissions";
import { canAccessRoute } from "@/lib/permissions";
import { INTERFACE_OPTIONS, type InterfaceKey } from "@/lib/workspace-v2/interface-switch";
import { cn } from "@/lib/utils";

const ICON = { crm: LayoutDashboard, workspace: Sparkles } as const;

/**
 * Váltó a teljes (régi) CRM és az új munkafelület között. Csak a böngészőben tárolt
 * felületválasztást írja át — adatot, jogosultságot, folyamatot nem érint.
 */
export function InterfaceSwitch({ current, compact = false, iconOnly = false, className, wrapperClassName }: { current: InterfaceKey; compact?: boolean; iconOnly?: boolean; className?: string; /** Külső sáv, csak akkor jelenik meg, ha a váltó is. */ wrapperClassName?: string }) {
  const { role } = usePermissions();
  const { setEnabled } = useWorkspaceV2();
  if (!canAccessRoute(role, "/munka")) return null;
  if (iconOnly) {
    // Összecsukott oldalsáv: csak a másik felületre váltó ikon.
    const other = INTERFACE_OPTIONS.find((o) => o.key !== current)!;
    const Icon = ICON[other.key];
    return (
      <Link to={other.to} onClick={() => setEnabled(other.workspaceEnabled)} title={`${other.label} – ${other.hint}`} aria-label={other.label}
        className={cn("flex h-8 w-8 items-center justify-center rounded-md border border-sidebar-border/70 text-sidebar-foreground/80 hover:bg-sidebar-accent", className)}>
        <Icon className="h-4 w-4" />
      </Link>
    );
  }
  const group = (
    <div role="group" aria-label="Felület váltása" className={cn("grid grid-cols-2 gap-0.5 rounded-lg border border-sidebar-border/70 bg-sidebar-accent/40 p-0.5", className)}>
      {INTERFACE_OPTIONS.map((o) => {
        const Icon = ICON[o.key];
        const active = o.key === current;
        return (
          <Link key={o.key} to={o.to} aria-current={active ? "page" : undefined} title={o.hint}
            onClick={() => setEnabled(o.workspaceEnabled)}
            className={cn("flex items-center justify-center gap-1.5 rounded-md px-1.5 text-center font-medium leading-tight transition",
              compact ? "h-7 text-[11px]" : "min-h-8 py-1 text-xs",
              active ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm" : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-foreground")}>
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span className={compact ? "truncate" : undefined}>{o.label}</span>
          </Link>
        );
      })}
    </div>
  );
  return wrapperClassName ? <div className={wrapperClassName}>{group}</div> : group;
}
