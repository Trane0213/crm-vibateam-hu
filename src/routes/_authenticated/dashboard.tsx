import { createFileRoute, Link } from "@tanstack/react-router";
import { OwnerWorkspace } from "@/components/dashboard/owner-workspace";
import { CustomerKpiWidgets } from "@/components/dashboard/customer-kpi-widgets";
import { ExecutiveWidgets } from "@/components/dashboard/exec-widgets";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { ArrowLeft, CalendarDays } from "lucide-react";
export const Route = createFileRoute("/_authenticated/dashboard")({
  validateSearch: (search: Record<string, unknown>): { period?: "7" | "30" | "90" } => ({ period: search.period === "7" || search.period === "90" ? search.period : "30" }),
  head: () => ({ meta: [
    { title: "Vezetői részletek és ügyféláttekintés | VIBA CRM" },
    { name: "description", content: "Időszakos nyitott Sales-állomány, projektek és ügyfélaktivitás a VIBA CRM-ben." },
    { property: "og:title", content: "Vezetői részletek | VIBA CRM" },
    { property: "og:description", content: "Valós CRM-adatokra épülő vezetői részletek és ügyféláttekintés." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: Dashboard,
});
function Dashboard() {
  const { period = "30" } = Route.useSearch();
  const navigate = Route.useNavigate();
  return <div className="crm-today flex flex-col">
    <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 border-b px-4 py-5 sm:px-6">
      <div className="min-w-0"><h1 className="font-display text-2xl font-semibold">Vezetői részletek</h1><p className="mt-1 text-sm text-muted-foreground">Időszakos Sales-állomány, ügyfélaktivitás és projektáttekintés.</p></div>
      <div className="flex shrink-0 items-center gap-2"><CalendarDays className="hidden h-4 w-4 text-muted-foreground sm:block" /><Select value={period} onValueChange={value => { if (value === "7" || value === "30" || value === "90") void navigate({ search: { period: value } }); }}><SelectTrigger aria-label="Áttekintés időszaka" className="w-32 sm:w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="7">Utolsó 7 nap</SelectItem><SelectItem value="30">Utolsó 30 nap</SelectItem><SelectItem value="90">Utolsó 90 nap</SelectItem></SelectContent></Select></div>
    </header>
    <div className="space-y-4 px-4 py-4 sm:px-6"><Button asChild variant="ghost" size="sm"><Link to="/today"><ArrowLeft />Mai vezetői munka</Link></Button><OwnerWorkspace detail period={period} /></div>
    <section aria-label="Ügyfélaktivitás és kapcsolódó ügyek"><div className="px-4 py-3 sm:px-6"><h2 className="font-display text-lg font-semibold">Ügyfelek és aktivitás</h2><p className="text-xs text-muted-foreground">Aktuális állapot és legutóbbi mentett események; az időszakválasztó a felső Sales-állományt szűri.</p></div><CustomerKpiWidgets /></section>
    <details className="mx-4 mb-6 border-t pt-4 sm:mx-6"><summary className="cursor-pointer text-sm font-semibold">Részletes projekt-, terheltség- és utánkövetési riportok</summary><div className="pt-4"><ExecutiveWidgets /></div></details>
  </div>;
}
