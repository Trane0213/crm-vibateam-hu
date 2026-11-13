import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Trophy, XCircle, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { LEAD_STATUS_LABEL, type LeadStatus } from "@/lib/sales/constants";
import { humanizeSupabaseError } from "@/lib/db-hooks";
import { PIPELINE_COLUMNS } from "./pipeline-types";
import { fetchPipelineLeads, fetchPipelineClosed } from "./pipeline-data";
import { PipelineCard } from "./pipeline-card";
import { PipelineDetailSheet } from "./pipeline-detail-sheet";
import { cn } from "@/lib/utils";
import type { PipelineLead } from "./pipeline-types";

const COLUMN_HINT: Partial<Record<LeadStatus, string>> = {
  quote_prep: "Ajánlat összeállítása és ellenőrzése",
  quote_sent: "Igazoltan kiküldve, válaszra vár",
  follow_up: "Rákérdezés, pontosítás",
  contract: "Szerződés-előkészítés, Megnyertük",
};

/**
 * 4 oszlopos kanban: quote_prep → quote_sent → follow_up → contract.
 * Won/Lost külön csempén. Mobilon egyszerre egy oszlop (fülekkel).
 * `initialLeadId`: napi listából érkező mélylink — közvetlenül megnyitja az ügyet.
 */
export function PipelineBoard({ initialLeadId = null }: { initialLeadId?: string | null }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [mobileCol, setMobileCol] = useState<LeadStatus>(PIPELINE_COLUMNS[0]);

  const leadsQ = useQuery({
    queryKey: ["pipeline", "board"],
    queryFn: fetchPipelineLeads,
  });
  const closedQ = useQuery({
    queryKey: ["pipeline", "closed-counts"],
    queryFn: fetchPipelineClosed,
  });

  useEffect(() => {
    if (!initialLeadId || !leadsQ.data) return;
    const hit = leadsQ.data.find((l) => l.id === initialLeadId);
    if (hit) { setOpenId(hit.id); setMobileCol(hit.status); }
    else toast.error("Ez az ügy nincs az aktív Pipeline-ban, vagy nincs hozzá jogosultságod.");
  }, [initialLeadId, leadsQ.data]);

  const grouped = new Map<string, PipelineLead[]>(PIPELINE_COLUMNS.map((s) => [s, []]));
  for (const l of leadsQ.data ?? []) {
    grouped.get(l.status)?.push(l);
  }
  const openLead = (leadsQ.data ?? []).find((l) => l.id === openId) ?? null;

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <ClosedTile tone="success" icon={Trophy} label="Megnyert" value={closedQ.isError ? "—" : closedQ.data?.won ?? "…"} />
        <ClosedTile tone="danger" icon={XCircle} label="Elveszett" value={closedQ.isError ? "—" : closedQ.data?.lost ?? "…"} />
        <span className="ml-auto text-xs text-muted-foreground">
          {leadsQ.isLoading ? "Pipeline betöltése…" : leadsQ.isError ? "Nem elérhető" : `${leadsQ.data?.length ?? 0} aktív ügy`}
        </span>
      </div>

      {leadsQ.isLoading ? (
        <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Pipeline betöltése…
        </div>
      ) : leadsQ.isError ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          A Pipeline nem tölthető be: {humanizeSupabaseError(leadsQ.error)}
          <Button size="sm" variant="outline" onClick={() => leadsQ.refetch()}><RotateCcw className="mr-1 h-3.5 w-3.5" />Újrapróbálás</Button>
        </div>
      ) : (
        <>
          <div role="tablist" aria-label="Pipeline szakaszok" className="mb-3 flex gap-1 overflow-x-auto md:hidden">
            {PIPELINE_COLUMNS.map((s) => (
              <button
                key={s}
                role="tab"
                aria-selected={mobileCol === s}
                onClick={() => setMobileCol(s)}
                className={cn(
                  "shrink-0 rounded-full border px-3 py-1 text-xs transition",
                  mobileCol === s ? "border-primary bg-primary text-primary-foreground" : "bg-background text-muted-foreground",
                )}
              >
                {LEAD_STATUS_LABEL[s]} ({grouped.get(s)?.length ?? 0})
              </button>
            ))}
          </div>
          <div className="grid flex-1 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {PIPELINE_COLUMNS.map((status) => {
              const items = grouped.get(status) ?? [];
              return (
                <div key={status} className={cn("min-h-[300px] flex-col rounded-lg border bg-muted/30", mobileCol === status ? "flex" : "hidden md:flex")}>
                  <header className="border-b bg-card/60 px-3 py-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold">{LEAD_STATUS_LABEL[status]}</h3>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{items.length}</span>
                    </div>
                    {COLUMN_HINT[status] && <p className="mt-0.5 text-[11px] text-muted-foreground">{COLUMN_HINT[status]}</p>}
                  </header>
                  <div className="flex flex-1 flex-col gap-2 p-2">
                    {items.length === 0 ? (
                      <div className="rounded border border-dashed bg-background/40 p-4 text-center text-[11px] text-muted-foreground">
                        Nincs ügy ebben a szakaszban.
                      </div>
                    ) : (
                      items.map((l) => (
                        <PipelineCard key={l.id} lead={l} active={openId === l.id} onOpen={(id) => setOpenId(id)} />
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <PipelineDetailSheet
        lead={openLead}
        open={openId !== null}
        onOpenChange={(v) => { if (!v) setOpenId(null); }}
      />
    </div>
  );
}

function ClosedTile({
  tone, icon: Icon, label, value,
}: {
  tone: "success" | "danger";
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs",
        tone === "success"
          ? "border-[color:var(--status-success)]/40 bg-[color:var(--status-success)]/10 text-[color:var(--status-success)]"
          : "border-destructive/40 bg-destructive/10 text-destructive",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      <span className="font-medium">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
