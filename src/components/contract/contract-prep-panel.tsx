/**
 * Szerződés-előkészítés megjelenítése — minden tétel a `contract-prep.ts`
 * modellből jön (állapot, felelős, forrás, hivatkozás). Nem ír, nem jelöl
 * jóváhagyást vagy aláírást; a fájlok a meglévő, jogosultság-ellenőrzött
 * letöltési úton nyílnak meg.
 */
import { Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, ArrowUpRight, Ban, CheckCircle2, CircleDashed, CircleHelp, FileText, Link2Off, Loader2, Scale } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/hooks/use-permissions";
import { canAccessRoute } from "@/lib/permissions";
import { humanizeSupabaseError } from "@/lib/db-hooks";
import { r2PresignDownload } from "@/lib/r2.functions";
import { useContractPrep } from "@/hooks/use-contract-prep";
import { HANDOFF_ROLE_LABEL, HANDOFF_STATE_LABEL, type HandoffSummary } from "@/lib/handoff/sales-pm-handoff";
import {
  CONTRACT_NOT_IN_CRM, CONTRACT_PHASE_LABEL, contractItemsBesideHandoff, contractNext, contractTargetLink, ownerDecisionPrep,
  type ContractDoc, type ContractItem, type ContractPhase, type ContractPrepSummary, type ContractState,
} from "@/lib/contract/contract-prep";

const ICON: Record<ContractState, typeof CheckCircle2> = { ok: CheckCircle2, missing: AlertTriangle, pending: CircleDashed, not_linked: Link2Off, unknown: CircleHelp };
const TONE: Record<ContractState, string> = {
  ok: "text-[color:var(--status-success)]", missing: "text-destructive", pending: "text-[color:var(--status-warning)]",
  not_linked: "text-muted-foreground", unknown: "text-muted-foreground",
};
const PHASE_TONE: Record<ContractPhase, string> = {
  ready: "border-[color:var(--status-success)]/40 bg-[color:var(--status-success)]/10 text-[color:var(--status-success)]",
  check: "border-[color:var(--status-warning)]/40 bg-[color:var(--status-warning)]/10 text-[color:var(--status-warning)]",
  owner_gap: "border-destructive/40 bg-destructive/10 text-destructive",
  sales_gap: "border-destructive/40 bg-destructive/10 text-destructive",
  pm_gap: "border-destructive/40 bg-destructive/10 text-destructive",
  unknown: "border-border bg-muted text-muted-foreground",
  not_relevant: "border-border bg-muted text-muted-foreground",
};

export function ContractPhaseBadge({ phase }: { phase: ContractPhase }) {
  return <span data-contract-phase={phase} className={cn("inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium", PHASE_TONE[phase])}>{CONTRACT_PHASE_LABEL[phase]}</span>;
}

function useAccess() {
  const { role } = usePermissions();
  return { role, can: (path: string) => canAccessRoute(role, path) };
}

function SourceLink({ item, can, className }: { item: Pick<ContractItem, "target">; can: (p: string) => boolean; className?: string }) {
  const l = contractTargetLink(item.target, can);
  if (!l) return null;
  return (
    <Link to={l.to as any} params={l.params as any} search={l.search as any} className={cn("inline-flex items-center gap-0.5 text-xs font-medium text-primary hover:underline", className)}>
      {l.label}<ArrowUpRight className="h-3 w-3" />
    </Link>
  );
}

export function ContractChecklist({ items, can, highlightRole }: { items: ContractItem[]; can: (p: string) => boolean; highlightRole?: string | null }) {
  return (
    <ul className="divide-y text-sm">
      {items.map((i) => {
        const Icon = ICON[i.state];
        const mine = highlightRole === i.role && (i.state === "missing" || i.state === "pending");
        return (
          <li key={i.key} data-contract-item={i.key} data-state={i.state} className={cn("flex flex-col gap-1 px-3 py-2 sm:flex-row sm:items-start sm:gap-2", mine && "bg-primary/5")}>
            <Icon className={cn("mt-0.5 hidden h-4 w-4 shrink-0 sm:block", TONE[i.state])} aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <Icon className={cn("h-4 w-4 shrink-0 sm:hidden", TONE[i.state])} aria-hidden />
                <span className="font-medium">{i.label}</span>
                <Badge variant="outline" className={cn("text-[10px]", TONE[i.state])}>{HANDOFF_STATE_LABEL[i.state]}</Badge>
                <Badge variant="outline" className="text-[10px] text-muted-foreground">Felelős: {HANDOFF_ROLE_LABEL[i.role]}</Badge>
              </div>
              <p className="mt-0.5 break-words text-xs text-muted-foreground">{i.detail}</p>
              <p className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground/80">Forrás: {i.source.label}</p>
            </div>
            {i.state !== "ok" && <SourceLink item={i} can={can} className="shrink-0 self-start sm:mt-0.5" />}
          </li>
        );
      })}
    </ul>
  );
}

/** Valóban feltöltött szerződés- és feltételfájlok; megnyitás a meglévő, RLS-ellenőrzött letöltési úton. */
export function ContractDocs({ docs }: { docs: ContractDoc[] }) {
  const presign = useServerFn(r2PresignDownload);
  const open = useMutation({
    mutationFn: async (d: ContractDoc) => {
      if (!d.file_url) throw new Error("A rekordhoz nem tartozik fájl.");
      const { url } = await presign({ data: { key: d.file_url } });
      window.open(url, "_blank", "noopener,noreferrer");
    },
    onError: (e: any) => toast.error("A fájl nem nyitható meg", { description: humanizeSupabaseError(e) }),
  });
  if (!docs.length) return <p className="px-3 py-2 text-xs text-muted-foreground">Nincs feltöltött szerződés- vagy feltételfájl, amelyhez hozzáférésed van.</p>;
  return (
    <ul className="divide-y text-sm" aria-label="Szerződés- és feltételfájlok">
      {docs.map((d) => (
        <li key={`${d.table}:${d.id}`} data-contract-doc={d.table} className="flex flex-wrap items-center gap-2 px-3 py-2">
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0 flex-1 truncate">{d.name ?? "Névtelen fájl"}</span>
          <Badge variant="secondary" className="text-[10px]">{d.table === "project_documents" ? "Szerződés (projekt)" : "Szerződési / fizetési feltételek (ajánlat)"}</Badge>
          <Button size="sm" variant="outline" className="h-7" disabled={open.isPending || !d.file_url} onClick={() => open.mutate(d)}>Megnyitás</Button>
        </li>
      ))}
    </ul>
  );
}

export function OwnerDecisionBox({ contract, handoff, can, role }: { contract: ContractPrepSummary; handoff?: HandoffSummary | null; can: (p: string) => boolean; role: string | null | undefined }) {
  const list = ownerDecisionPrep(contract, handoff);
  return (
    <section aria-label="Tulajdonosi döntés-előkészítés" className="rounded-lg border border-dashed p-3">
      <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"><Scale className="h-3.5 w-3.5" />{role === "owner" ? "Döntésedre előkészítve" : "Tulajdonosi döntésre előkészítve"}</h4>
      {list.length ? (
        <ul className="mt-2 space-y-1.5 text-xs">
          {list.map((d) => (
            <li key={d.topic} data-owner-decision={d.topic} className="flex flex-wrap items-start justify-between gap-2">
              <span><span className="font-medium">{d.label}:</span> <span className="text-muted-foreground">{d.detail}</span></span>
              {d.target && <SourceLink item={{ target: d.target }} can={can} />}
            </li>
          ))}
        </ul>
      ) : <p className="mt-1 text-xs text-muted-foreground">Nincs tulajdonosi döntést igénylő hiány a források szerint.</p>}
      <p className="mt-2 text-[11px] text-muted-foreground">Csak előkészítés: a CRM nem rögzít döntést, jóváhagyást vagy aláírást.</p>
    </section>
  );
}

export function ContractNotInCrm() {
  return (
    <details className="rounded-lg border border-dashed bg-muted/20 p-3 text-xs">
      <summary className="flex cursor-pointer items-center gap-1.5 font-semibold uppercase tracking-wider text-muted-foreground"><Ban className="h-3.5 w-3.5" />Nincs a CRM-ben (NINCS ÖSSZEKÖTVE)</summary>
      <ul className="mt-2 space-y-1.5">
        {CONTRACT_NOT_IN_CRM.map((n) => <li key={n.key}><span className="font-medium">{n.label}:</span> <span className="text-muted-foreground">{n.detail}</span></li>)}
      </ul>
    </details>
  );
}

function Loading() {
  return <p className="flex items-center gap-1.5 p-3 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Szerződés-előkészítési adatok ellenőrzése…</p>;
}
function LoadError({ retry }: { retry: () => void }) {
  return <p role="alert" className="p-3 text-xs text-destructive">A szerződés-előkészítési adatok nem tölthetők be (NINCS ADAT). <button type="button" className="underline" onClick={retry}>Újra</button></p>;
}

/**
 * Teljes szerződés-előkészítési panel. `besideHandoff`: a projekt Átadás fülén
 * a Sales→PM listában már szereplő tételek (kapcsolattartó, elfogadott verzió,
 * szerződésfájl) itt nem ismétlődnek.
 */
export function ContractPrepPanel({ leadId, projectId, besideHandoff, handoff, title = "Szerződés-előkészítés" }: {
  leadId?: string | null; projectId?: string | null; besideHandoff?: boolean; handoff?: HandoffSummary | null; title?: string;
}) {
  const { role, can } = useAccess();
  const q = useContractPrep({ leadId, projectId });
  return (
    <section aria-label={title} className="rounded-lg border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        {q.data && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] tabular-nums text-muted-foreground">{q.data.summary.items.filter((i) => i.state === "ok").length}/{q.data.summary.items.length} rendben</span>
            <ContractPhaseBadge phase={q.data.summary.phase} />
          </div>
        )}
      </header>
      {q.isPending ? <Loading /> : q.isError ? <LoadError retry={() => q.refetch()} /> : (() => {
        const s = q.data.summary;
        const next = contractNext(s, role);
        const items = besideHandoff ? contractItemsBesideHandoff(s.items) : s.items;
        const docs = [...(q.data.input.contractDocs ?? []), ...(q.data.input.termsDocs ?? [])];
        return (
          <>
            <div className="border-b px-3 py-2 text-xs">
              <span className="font-semibold">{next.mine ? "Következő lépésed:" : "Következő lépés:"}</span> {next.title}. <span className="text-muted-foreground">{next.detail}</span>
              {next.item && next.item.state !== "ok" && <> <SourceLink item={next.item} can={can} /></>}
            </div>
            {besideHandoff && <p className="border-b px-3 py-1.5 text-[11px] text-muted-foreground">A kapcsolattartó, az elfogadott verzió és a szerződésfájl állapota a fenti átvételi listában szerepel.</p>}
            <ContractChecklist items={items} can={can} highlightRole={role} />
            <div className="border-t">
              <h4 className="px-3 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Szerződés- és feltételfájlok</h4>
              {q.data.input.contractDocs === undefined && q.data.input.project !== null
                ? <p className="px-3 py-2 text-xs text-muted-foreground">A projekt dokumentumai nem tölthetők be (NINCS ADAT).</p>
                : <ContractDocs docs={docs} />}
            </div>
            <div className="space-y-2 border-t p-3">
              <OwnerDecisionBox contract={s} handoff={handoff} can={can} role={role} />
              <ContractNotInCrm />
            </div>
          </>
        );
      })()}
    </section>
  );
}

/** Rövid állapot (elfogadott ajánlat 4. lépése, megnyert ügy kártyája): fázis + következő lépés + hivatkozás a teljes listára. */
export function ContractPrepCompact({ leadId, projectId, fullLink }: {
  leadId?: string | null; projectId?: string | null;
  fullLink?: { to: string; params?: Record<string, string>; search?: Record<string, string>; label: string } | null;
}) {
  const { role, can } = useAccess();
  const q = useContractPrep({ leadId, projectId });
  const allowed = fullLink && can(fullLink.to.replace(/\/\$id$/, "")) ? fullLink : null;
  return (
    <section aria-label="Szerződés-előkészítés állapota" className="rounded-md border bg-background p-2 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold">Szerződés-előkészítés</span>
        {q.data && <ContractPhaseBadge phase={q.data.summary.phase} />}
      </div>
      {q.isPending ? <p className="mt-1 flex items-center gap-1.5 text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />Ellenőrzés…</p>
        : q.isError ? <p role="alert" className="mt-1 text-destructive">Nem tölthető be (NINCS ADAT). <button type="button" className="underline" onClick={() => q.refetch()}>Újra</button></p>
        : (() => {
          const s = q.data.summary; const next = contractNext(s, role);
          return (
            <>
              <p className="mt-1"><span className="font-medium">{next.title}.</span> <span className="text-muted-foreground">{next.detail}</span></p>
              <p className="mt-1 text-muted-foreground tabular-nums">{s.missing} hiány · {s.pending} ellenőrizendő · {s.unknown} NINCS ADAT{s.ownerDecisions.length ? ` · ${s.ownerDecisions.length} tulajdonosi döntés` : ""}</p>
              <div className="mt-1.5 flex flex-wrap gap-3">
                {next.item && next.item.state !== "ok" && <SourceLink item={next.item} can={can} />}
                {allowed && <Link to={allowed.to as any} params={allowed.params as any} search={allowed.search as any} className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline">{allowed.label}<ArrowUpRight className="h-3 w-3" /></Link>}
              </div>
            </>
          );
        })()}
    </section>
  );
}
