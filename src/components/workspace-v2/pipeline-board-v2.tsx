import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2, RotateCcw, Search, Trophy, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LEAD_STATUS_LABEL, type LeadStatus } from "@/lib/sales/constants";
import { humanizeSupabaseError } from "@/lib/db-hooks";
import { PIPELINE_COLUMNS, type PipelineLead } from "@/components/pipeline/pipeline-types";
import { fetchPipelineLeads } from "@/components/pipeline/pipeline-data";
import { PipelineCard } from "@/components/pipeline/pipeline-card";
import { CreateProjectDialog } from "@/components/pipeline/create-project-dialog";
import { LostDialog } from "@/components/sales/lost-dialog";
import { usePipelineLeadMutations } from "@/components/pipeline/use-pipeline-lead-mutations";
import { pipelineDrop, columnSummary } from "@/lib/workspace-v2/pipeline-dnd";
import { formatHuf } from "@/lib/format";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

const COL_TONE: Record<string, string> = {
  quote_prep: "border-t-status-warning",
  quote_sent: "border-t-status-info",
  follow_up: "border-t-primary",
  contract: "border-t-status-success",
};

/**
 * Húzható Pipeline. Áthelyezés csak a meglévő STATUS_TRANSITIONS szerint, a közös
 * írási útvonalon; „Megnyert” → meglévő projektlétrehozó ablak, „Elveszett” → okválasztó.
 * A kártyára kattintva (mobilon koppintva) az ügy munkalapja nyílik meg.
 */
export function PipelineBoardV2() {
  const { user } = useAuth();
  const leadsQ = useQuery({ queryKey: ["pipeline", "board"], queryFn: fetchPipelineLeads });
  const navigate = useNavigate();
  const openCase = (id: string) => navigate({ to: "/munka/ugy/$id", params: { id } });
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);
  const [mine, setMine] = useState(false);
  const [search, setSearch] = useState("");
  const [mobileCol, setMobileCol] = useState<LeadStatus>(PIPELINE_COLUMNS[0]);
  const [wonLead, setWonLead] = useState<PipelineLead | null>(null);
  const [lostLead, setLostLead] = useState<PipelineLead | null>(null);
  const { statusMut, lostMut } = usePipelineLeadMutations(() => setLostLead(null));


  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (leadsQ.data ?? []).filter((l) => (!mine || l.assigned_to === user?.id)
      && (!s || `${l.company_name ?? ""} ${l.summary ?? ""} ${l.id}`.toLowerCase().includes(s)));
  }, [leadsQ.data, mine, search, user?.id]);

  const drop = (target: LeadStatus) => {
    const lead = (leadsQ.data ?? []).find((l) => l.id === dragId);
    setDragId(null); setOverCol(null);
    if (!lead) return;
    const d = pipelineDrop(lead.status, target);
    if (d.kind === "blocked") toast.error(d.reason);
    else if (d.kind === "status") statusMut.mutate({ lead, next: d.to });
    else if (d.kind === "won-dialog") setWonLead(lead);
    else if (d.kind === "lost-dialog") setLostLead(lead);
  };
  const zone = (target: LeadStatus) => ({
    onDragOver: (e: React.DragEvent) => { if (dragId) { e.preventDefault(); setOverCol(target); } },
    onDragLeave: () => setOverCol((c) => (c === target ? null : c)),
    onDrop: (e: React.DragEvent) => { e.preventDefault(); drop(target); },
  });
  const dragged = (leadsQ.data ?? []).find((l) => l.id === dragId) ?? null;
  const verdict = (t: LeadStatus) => (dragged ? pipelineDrop(dragged.status, t).kind : null);

  if (leadsQ.isLoading) return <div className="flex h-64 items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Pipeline betöltése…</div>;
  if (leadsQ.isError) return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
      A Pipeline nem tölthető be: {humanizeSupabaseError(leadsQ.error)}
      <Button size="sm" variant="outline" onClick={() => leadsQ.refetch()}><RotateCcw className="mr-1 h-3.5 w-3.5" />Újrapróbálás</Button>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1 sm:max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Keresés: ügyfél, ügy, azonosító…" className="pl-8" aria-label="Keresés a Pipeline-ban" />
        </div>
        <Button size="sm" variant={mine ? "default" : "outline"} onClick={() => setMine((v) => !v)} aria-pressed={mine}>Saját ügyeim</Button>
        <span className="ml-auto text-xs text-muted-foreground">{filtered.length} aktív ügy · húzd a kártyát a következő szakaszba</span>
      </div>

      <div role="tablist" aria-label="Pipeline szakaszok" className="flex gap-1 overflow-x-auto md:hidden">
        {PIPELINE_COLUMNS.map((s) => (
          <button key={s} role="tab" aria-selected={mobileCol === s} onClick={() => setMobileCol(s)}
            className={cn("shrink-0 rounded-full border px-3 py-1 text-xs", mobileCol === s ? "border-primary bg-primary text-primary-foreground" : "bg-background text-muted-foreground")}>
            {LEAD_STATUS_LABEL[s]} ({filtered.filter((l) => l.status === s).length})
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {PIPELINE_COLUMNS.map((status) => {
          const items = filtered.filter((l) => l.status === status);
          const sum = columnSummary(items);
          const v = verdict(status);
          return (
            <section key={status} aria-label={LEAD_STATUS_LABEL[status]} data-column={status} {...zone(status)}
              className={cn("min-h-[280px] flex-col rounded-lg border border-t-4 bg-muted/30 transition", COL_TONE[status],
                mobileCol === status ? "flex" : "hidden md:flex",
                overCol === status && v === "status" && "ring-2 ring-primary",
                overCol === status && v === "blocked" && "ring-2 ring-destructive")}>
              <header className="border-b bg-card/70 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">{LEAD_STATUS_LABEL[status]}</h3>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{sum.count}</span>
                </div>
                <div className="text-xs font-semibold text-foreground/80">{formatHuf(sum.sum)}{sum.unknown ? <span className="font-normal text-muted-foreground"> · {sum.unknown} érték nélkül</span> : null}</div>
              </header>
              <div className="flex flex-1 flex-col gap-2 p-2">
                {items.length === 0 ? <div className="rounded border border-dashed p-4 text-center text-[11px] text-muted-foreground">Nincs ügy ebben a szakaszban.</div>
                  : items.map((l) => (
                    <div key={l.id} draggable onDragStart={(e) => { setDragId(l.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", l.id); }}
                      onDragEnd={() => { setDragId(null); setOverCol(null); }} data-lead={l.id} className={cn("cursor-grab active:cursor-grabbing", dragId === l.id && "opacity-50")}>
                      <PipelineCard lead={l} onOpen={openCase} />
                    </div>
                  ))}
              </div>
            </section>
          );
        })}
      </div>

      <div className={cn("grid grid-cols-2 gap-3 transition", dragId ? "opacity-100" : "opacity-60")}>
        <div {...zone("won")} data-column="won" className={cn("flex items-center justify-center gap-2 rounded-lg border-2 border-dashed p-4 text-sm",
          overCol === "won" && (verdict("won") === "won-dialog" ? "border-status-success bg-status-success/10" : "border-destructive bg-destructive/5"))}>
          <Trophy className="h-4 w-4 text-status-success" />Megnyert – projekt létrehozása
        </div>
        <div {...zone("lost")} data-column="lost" className={cn("flex items-center justify-center gap-2 rounded-lg border-2 border-dashed p-4 text-sm",
          overCol === "lost" && "border-destructive bg-destructive/5")}>
          <XCircle className="h-4 w-4 text-destructive" />Elveszett – ok megadásával
        </div>
      </div>

      <CreateProjectDialog lead={wonLead} open={wonLead !== null} onOpenChange={(v) => { if (!v) setWonLead(null); }} />
      <LostDialog open={lostLead !== null} onOpenChange={(v) => { if (!v) setLostLead(null); }} busy={lostMut.isPending}
        onConfirm={(p) => { if (lostLead) lostMut.mutate({ lead: lostLead, ...p }); }} />
    </div>
  );
}
