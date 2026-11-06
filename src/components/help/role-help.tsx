import { useState } from "react";
import { Link } from "@tanstack/react-router";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Search, ArrowUpRight, Sparkles, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/page-header";
import { HELP_GUIDES } from "@/lib/help-guide";
import { ROLE_LABEL, type RoleSlug } from "@/lib/permissions";

export function RoleHelp({ role, manual }: { role: RoleSlug; manual?: string }) {
  const [search, setSearch] = useState("");
  const term = search.trim().toLocaleLowerCase("hu");
  const steps = HELP_GUIDES[role].filter(step => Object.values(step).join(" ").toLocaleLowerCase("hu").includes(term));
  return <div className="min-w-0">
    <PageHeader title={`${ROLE_LABEL[role]} · használati súgó`} actions={<Button asChild variant="outline" size="sm"><Link to="/ai-assistant" search={{ agent: "crm" }}><Sparkles />George megnyitása</Link></Button>} />
    <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
      <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label="Keresés a szerepkörsúgóban" className="pl-9" placeholder="Miben szeretnél segítséget? Pl. átadás, kapcsolattartó, mentés…" value={search} onChange={e => setSearch(e.target.value)} /></div>
      <p className="text-xs text-muted-foreground">A gombnevek a jelenlegi felület forrásából ellenőrizve. Valódi bejelentkezett mentés és küldés végigpróbája nem igazolt.</p>
      {steps.length ? steps.map(step => <details key={step.title} className="rounded-md border bg-card">
        <summary className="cursor-pointer p-4 font-medium">{step.title}{step.irreversible && <AlertTriangle aria-label="Visszavonási korlát" className="ml-2 inline h-4 w-4 text-status-warning" />}</summary>
        <div className="space-y-3 border-t p-4 text-sm">
          <dl className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">{[["Hol találom?", step.where], ["Melyik gomb?", step.button], ["Mit csinál?", step.effect], ["Mi történik utána?", step.after], ["Módosítás / visszavonás", step.undo]].map(([label, value]) => <div key={label} className="contents"><dt className="font-medium text-muted-foreground">{label}</dt><dd className="min-w-0 break-words">{value}</dd></div>)}</dl>
          <Button asChild variant="outline" size="sm"><Link to={step.path}><ArrowUpRight />Kapcsolódó oldal megnyitása</Link></Button>
        </div>
      </details>) : <p role="status" className="py-6 text-sm text-muted-foreground">Nincs ilyen súgótétel. Próbálj rövidebb keresést, vagy nyisd meg George-ot.</p>}
      {manual && <details className="border-t pt-4"><summary className="cursor-pointer font-medium">Részletes kézikönyv · történeti referencia</summary><p className="my-3 text-sm text-muted-foreground">Az október 30-i dokumentum korábbi állapotot is tartalmaz; az aktuális gombokat a fenti súgó mutatja.</p><article className="space-y-3 break-words text-sm [&_h1]:text-xl [&_h2]:mt-6 [&_h2]:font-semibold [&_table]:block [&_table]:overflow-x-auto [&_a]:text-primary"><ReactMarkdown remarkPlugins={[remarkGfm]}>{manual}</ReactMarkdown></article></details>}
    </div>
  </div>;
}