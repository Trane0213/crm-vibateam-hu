import { Plus, Briefcase, FileText, ListChecks, Sparkles, BellRing, FolderOpen, Users, UserPlus } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePermissions } from "@/hooks/use-permissions";
import { canAccessRoute } from "@/lib/permissions";

/** Globális „+ Új" gomb a fejlécben. A célmodul listájára navigál, és a `?new=1`
 *  paramétert állítja, amit a ResourcePage felismer és azonnal megnyitja a
 *  létrehozó dialógust — így 1 kattintással lehet új projektet, ajánlatot,
 *  feladatot vagy leadet rögzíteni. */
export function QuickAddMenu() {
  const navigate = useNavigate();
  const { role } = usePermissions();

  const items = [
    { key: "customer", label: "Új ügyfél",   icon: Users,      to: "/customers", primary: true },
    { key: "contact", label: "Új kapcsolattartó", icon: UserPlus, to: "/contacts" },
    { key: "project", label: "Új projekt",   icon: Briefcase,  to: "/projects" },
    { key: "quote",   label: "Új ajánlat",   icon: FileText,   to: "/quotes" },
    { key: "followup",label: "Új utókövetés", icon: BellRing,   to: "/followups" },
    { key: "task",    label: "Új feladat",   icon: ListChecks, to: "/tasks" },
    { key: "lead",    label: "Új érdeklődő",      icon: Sparkles,   to: "/leads" },
    { key: "doc",     label: "Új dokumentum",icon: FolderOpen, to: "/documents" },
  ]
    .filter((i) => canAccessRoute(role, i.to))
    // Marketing szerepkörben CSAK „Új érdeklődő" jelenjen meg — a marketinges
    // feladata kizárólag lead-rögzítés, minden más (ügyfél, projekt, ajánlat,
    // feladat, utókövetés, dokumentum) értékesítői / PM hatáskör.
    .filter((i) => (role === "marketing" ? i.key === "lead" : true));

  if (items.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" className="gap-1">
          <Plus className="h-3.5 w-3.5" />
          Új…
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>Gyors hozzáadás</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.map((i) => (
          <DropdownMenuItem
            key={i.key}
            onSelect={() => navigate({ to: i.to, search: { new: 1 } as any })}
            className={`cursor-pointer ${(i as any).primary ? "font-medium" : ""}`}
          >
            <i.icon className="mr-2 h-4 w-4" />
            {i.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}