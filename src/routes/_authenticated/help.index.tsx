import { createFileRoute, Link } from "@tanstack/react-router";
import { usePermissions } from "@/hooks/use-permissions";
import { HELP_PATHS } from "@/lib/help-guide";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { BookOpen, Sparkles, AlertTriangle } from "lucide-react";
export const Route = createFileRoute("/_authenticated/help/")({
  head: () => ({ meta: [{ title: "Segítség és problémajelzés | VIBA CRM" }, { name: "description", content: "Szerepkör szerinti használati segítség és a közös hibaközpont állapota." }, { property: "og:title", content: "Segítség és problémajelzés | VIBA CRM" }, { property: "og:description", content: "Használati kérdés vagy működési hiba elkülönítése." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: HelpHome,
});
function HelpHome() {
  const { role } = usePermissions();
  return <div><PageHeader title="Segítség / Probléma jelzése" /><div className="mx-auto grid max-w-4xl gap-6 p-4 sm:grid-cols-2 sm:p-6">
    <section className="space-y-4 border-t py-4"><BookOpen className="h-6 w-6 text-primary" /><h2 className="text-lg font-semibold">Nem értem, hogyan kell</h2><Button asChild><Link to={HELP_PATHS[role]}>Saját szerepkörsúgó megnyitása</Link></Button><Button asChild variant="outline"><Link to="/ai-assistant" search={{ agent: "crm" }}><Sparkles />Kérdés George-nak</Link></Button></section>
    <section className="space-y-4 border-t py-4"><AlertTriangle className="h-6 w-6 text-status-warning" /><h2 className="text-lg font-semibold">Nem működik / hibát tapasztaltam</h2><p role="status" className="text-sm text-muted-foreground">A közös, saját jelentéseket védő hibajegytároló még nincs engedélyezve. Bejelentés jelenleg nem menthető; ez nem működő hibajegylista.</p><p className="text-sm text-muted-foreground">George-nak nincs hozzáférése az alkalmazás technikai naplóihoz, ezért automatikus hibadiagnózist és javítást nem ígérünk.</p></section>
  </div></div>;
}