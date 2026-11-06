import { Link, useRouterState } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/hooks/use-permissions";
import { isNavActive, moreGroups, primaryItems } from "@/lib/nav-config";
import { MoreHorizontal, Route } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

/** Shared shortcuts reuse the same role-filtered destinations as the main menu. */
export function WorkNavigation() {
  const { role } = usePermissions();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="min-w-0 border-b bg-card">
    <nav
      aria-label="Napi munkautak"
      className="crm-work-nav flex min-w-0 gap-1 overflow-x-auto px-3 py-2 sm:px-6"
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
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button size="sm" variant="outline" className="shrink-0" aria-label="További oldalak"><MoreHorizontal />Továbbiak</Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-h-96 overflow-y-auto">
          {moreGroups(role).map((group) => <div key={group.label}>
            <DropdownMenuLabel>{group.label}</DropdownMenuLabel>
            {group.items.map((item) => <DropdownMenuItem key={item.url} asChild><Link to={item.url}><item.icon className="h-4 w-4" />{item.title}</Link></DropdownMenuItem>)}
            <DropdownMenuSeparator />
          </div>)}
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
    {(role === "marketing" || role === "sales") && <details className="border-t px-4 py-2 text-xs sm:px-6">
      <summary className="cursor-pointer font-medium text-muted-foreground"><Route className="mr-1.5 inline h-3.5 w-3.5" />{role === "marketing" ? "Folyamat · érdeklődéstől a Sales-átadásig" : "Folyamat · átvett ügytől az ajánlatig"}</summary>
      <ol className="grid gap-3 py-3 text-sm sm:grid-cols-3" aria-label="Marketing–Sales munkafolyamat">
        {role === "marketing" ? <>
          <li><strong className="text-foreground">1 · Ügyfél és kapcsolattartó</strong><p className="mt-1 text-muted-foreground">A meglévő ügyféladatlapot ellenőrizd; a cégek és magánszemélyek külön maradnak.</p><Button asChild variant="link" size="sm" className="px-0"><Link to="/customers">Ügyfelek megnyitása</Link></Button></li>
          <li><strong className="text-foreground">2 · Érdeklődés és előzmények</strong><p className="mt-1 text-muted-foreground">Rögzítsd az érkezési csatornát és a Salesnek szánt összefoglalót. A piszkozat nem igazolt megkeresés.</p><Button asChild variant="link" size="sm" className="px-0"><Link to="/emails">Levelezés megnyitása</Link></Button></li>
          <li><strong className="text-foreground">3 · Átadás a kijelölt értékesítőnek</strong><p className="mt-1 text-muted-foreground">Az ügyféladatlapon ellenőrizd a nyitott ügyeket, majd válassz felelőst. Az új ügy Sales-előkészítésbe kerül; nem indul email és nem kerül automatikusan Pipeline-ba.</p></li>
        </> : <>
          <li><strong className="text-foreground">1 · Saját átvett ügy</strong><p className="mt-1 text-muted-foreground">A hozzád rendelt ügyön ellenőrizd a marketinges összefoglalót, a kapcsolattartót és az előzményeket.</p><Button asChild variant="link" size="sm" className="px-0"><Link to="/leads">Sales-előkészítés megnyitása</Link></Button></li>
          <li><strong className="text-foreground">2 · Egyeztetés és következő lépés</strong><p className="mt-1 text-muted-foreground">Rögzíts megtörtént aktivitást és ments határidős következő lépést. A Pipeline-ba léptetés külön művelet.</p><Button asChild variant="link" size="sm" className="px-0"><Link to="/sales/leads">Pipeline megnyitása</Link></Button></li>
          <li><strong className="text-foreground">3 · Ajánlat és utánkövetés</strong><p className="mt-1 text-muted-foreground">Az ajánlat mentése nem küldés. A kiküldést és az utánkövetést a meglévő ajánlatmunkafolyamatban kezeld.</p><Button asChild variant="link" size="sm" className="px-0"><Link to="/quotes">Ajánlatok megnyitása</Link></Button></li>
        </>}
      </ol>
    </details>}
    </div>
  );
}
