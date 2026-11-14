/**
 * Megnyert ügy → projektátadás állapota a lead munkafelületen.
 * A projektet a `sales_mark_won_with_project` hozta létre; itt csak olvassuk
 * (RLS), és a hiányzó tétel pótlási helyére (a projekt megfelelő fülére) visszük
 * a felhasználót. Nem ír, nem jelöl „kész” átadást.
 */
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Briefcase, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useListWhere } from "@/lib/db-hooks";
import { usePermissions } from "@/hooks/use-permissions";
import { useProjectHandoff, type ProjectHandoffRow } from "@/hooks/use-project-handoff";
import { canAccessRoute } from "@/lib/permissions";
import { HANDOFF_ROLE_LABEL, HANDOFF_STATE_LABEL, handoffNext, type HandoffItem } from "@/lib/handoff/sales-pm-handoff";
import { handoffFixTab } from "@/lib/handoff/handoff-links";
import { PROJECT_STATUS_LABEL } from "@/lib/viba-constants";
import { useAssigneeLookup } from "@/lib/sales/use-assignee-name";
import { HandoffPhaseBadge } from "./handoff-checklist";
import { ContractPrepCompact } from "@/components/contract/contract-prep-panel";
import { cn } from "@/lib/utils";

export function LeadHandoffCard({ project }: { project: ProjectHandoffRow }) {
  const { role } = usePermissions();
  const q = useProjectHandoff(project);
  const pmName = useAssigneeLookup();
  const canOpen = canAccessRoute(role, "/projects");
  const pm = project.project_manager_user_id ?? null;
  const open = (i: HandoffItem) => handoffFixTab(i);

  return (
    <section aria-label="Projektátadás" className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-primary">Megnyert → projektátadás</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 font-semibold"><Briefcase className="h-4 w-4 text-primary" />{project.title ?? "Projekt"}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {PROJECT_STATUS_LABEL[project.status ?? ""] ?? project.status ?? "—"} · Projektvezető: {pm ? pmName(pm) : <span className="text-destructive">nincs kijelölve</span>}
          </div>
        </div>
        {q.data && <HandoffPhaseBadge phase={q.data.phase} />}
      </div>
      {q.isPending ? (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Átadási adatok ellenőrzése…</p>
      ) : q.isError ? (
        <p role="alert" className="mt-2 text-xs text-destructive">Az átadási adatok nem tölthetők be. <button type="button" className="underline" onClick={() => q.refetch()}>Újra</button></p>
      ) : (() => {
        const next = handoffNext(q.data, role);
        const salesOpen = q.data.items.filter((i) => i.role === "sales" && (i.state === "missing" || i.state === "pending"));
        return (
          <>
            <p className="mt-2 text-xs"><span className="font-semibold">Következő lépés:</span> {next.title}. <span className="text-muted-foreground">{next.detail}</span></p>
            {salesOpen.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs" aria-label="Sales teendők az átadásnál">
                {salesOpen.map((i) => (
                  <li key={i.key} className="flex flex-wrap items-center justify-between gap-2 rounded border bg-background px-2 py-1">
                    <span><span className={cn("font-medium", i.state === "missing" ? "text-destructive" : "text-[color:var(--status-warning)]")}>{HANDOFF_STATE_LABEL[i.state]}:</span> {i.label} <span className="text-muted-foreground">· {HANDOFF_ROLE_LABEL[i.role]}</span></span>
                    {canOpen && open(i) && (
                      <Link to="/projects/$id" params={{ id: project.id }} search={{ tab: open(i)! }} className="text-primary hover:underline">Pótlás helye</Link>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        );
      })()}
      <div className="mt-2">
        <ContractPrepCompact leadId={project.lead_id} projectId={project.id}
          fullLink={{ to: "/projects/$id", params: { id: project.id }, search: { tab: "handover" }, label: "Szerződés-előkészítés az Átadás fülön" }} />
      </div>
      {canOpen ? (
        <Button size="sm" className="mt-3" asChild>
          <Link to="/projects/$id" params={{ id: project.id }} search={{ tab: "handover" }}>Átadás fül megnyitása<ArrowUpRight /></Link>
        </Button>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">A projekt adatlapját a szerepköröd nem nyithatja meg.</p>
      )}
    </section>
  );
}

/**
 * Megnyert ügy összes projektje (a megnyerés pontosan egyet hoz létre) a
 * hívó jogosultságával. Projekt nélküli megnyert ügy = NINCS ADAT, nem
 * kínál kézi projekt-létrehozást.
 */
export function WonLeadHandoff({ leadId }: { leadId: string }) {
  const projects = useListWhere<any>("projects", "lead_id", leadId, { order: "created_at", ascending: false });
  if (projects.isLoading) return <p className="text-xs text-muted-foreground">Projektátadás betöltése…</p>;
  if (projects.isError) return <p role="alert" className="text-xs text-destructive">A projekt nem tölthető be. <button type="button" className="underline" onClick={() => projects.refetch()}>Újra</button></p>;
  const rows = (projects.data ?? []) as ProjectHandoffRow[];
  if (!rows.length) return <p className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">NINCS ADAT: a megnyert ügyhöz nem látható projekt. A megnyerés mindig projektet hoz létre — jelezd a Tulajdonosnak (kézzel ne hozz létre projektet).</p>;
  return <div className="space-y-2">{rows.map((p) => <LeadHandoffCard key={p.id} project={p} />)}</div>;
}
