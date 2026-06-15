import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Trophy, XCircle, Loader2 } from "lucide-react";
import { LEAD_STATUS_LABEL } from "@/lib/sales/constants";
import { PIPELINE_COLUMNS } from "./pipeline-types";
import { fetchPipelineLeads, fetchPipelineClosed } from "./pipeline-data";
import { PipelineCard } from "./pipeline-card";
import { PipelineDetailSheet } from "./pipeline-detail-sheet";
import { cn } from "@/lib/utils";
import type { PipelineLead } from "./pipeline-types";

/**
 * 4 oszlopos kanban: quote_prep → quote_sent → follow_up → contract.
 * Won/Lost külön header-csempén — a kanbanon nem oszlop, dialógusból kerül oda.
 */
export function PipelineBoard() {
  const [openId, setOpenId] = useState<string | null>(null);

  const leadsQ = useQuery({
    queryKey: ["pipeline", "board"],
    queryFn: fetchPipelineLeads,
  });
  const closedQ = useQuery({
    queryKey: ["pipeline", "closed-counts"],
    queryFn: fetchPipelineClosed,
  });

  const grouped = new Map<string, PipelineLead[]>(PIPELINE_COLUMNS.map((s) => [s, []]));
  for (const l of leadsQ.data ?? []) {
    grouped.get(l.status)?.push(l);
  }
  const openLead = (leadsQ.data ?? []).find((l) => l.id === openId) ?? null;

  return (
    <div className="flex h-full flex-col">
      {/* Lezárt csempék */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <ClosedTile tone="success" icon={Trophy} label="Megnyert" value={closedQ.data?.won ?? "–"} />
        <ClosedTile tone="danger"  icon={XCircle} label="Elveszett" value={closedQ.data?.lost ?? "–"} />
        <span className="ml-auto text-xs text-muted-foreground">
          {leadsQ.isLoading
            ? "Pipeline betöltése…"
            : `${leadsQ.data?.length ?? 0} aktív ügy a pipeline-ban`}
        </span>
      </div>

      {leadsQ.isLoading ? (
        <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Pipeline betöltése…
        </div>
      ) : leadsQ.isError ? (
        <div className="rounded border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          Hiba a betöltéskor — a pipeline tábla elérhetetlen.
        </div>
      ) : (
        <div className="grid flex-1 grid-cols-1 gap-3 overflow-x-auto md:grid-cols-2 xl:grid-cols-4">
          {PIPELINE_COLUMNS.map((status) => {
            const items = grouped.get(status) ?? [];
            return (
              <div key={status} className="flex min-h-[300px] flex-col rounded-lg border bg-muted/30">
                <header className="flex items-center justify-between border-b bg-card/60 px-3 py-2">
                  <h3 className="text-sm font-semibold">{LEAD_STATUS_LABEL[status]}</h3>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                    {items.length}
                  </span>
                </header>
                <div className="flex flex-1 flex-col gap-2 p-2">
                  {items.length === 0 ? (
                    <div className="rounded border border-dashed bg-background/40 p-4 text-center text-[11px] text-muted-foreground">
                      Üres oszlop.
                    </div>
                  ) : (
                    items.map((l) => (
                      <PipelineCard
                        key={l.id}
                        lead={l}
                        active={openId === l.id}
                        onOpen={(id) => setOpenId(id)}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
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
          ? "border-emerald-300 bg-emerald-50 text-emerald-800"
          : "border-rose-300 bg-rose-50 text-rose-800",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      <span className="font-medium">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}