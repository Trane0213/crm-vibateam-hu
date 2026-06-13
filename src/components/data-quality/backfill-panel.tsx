import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { History, Loader2, PlayCircle, CheckCircle2, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  runHistoricalBackfill,
  createEmptyBackfillReport,
  type BackfillReport,
  type BackfillKind,
} from "@/lib/enrichment/backfill";

const KIND_LABEL: Record<BackfillKind, string> = {
  company: "Cégek",
  contact: "Kapcsolattartók",
  lead: "Érdeklődők",
  thread: "Email threadek",
};

export function HistoricalBackfillPanel() {
  const qc = useQueryClient();
  const [report, setReport] = useState<BackfillReport>(createEmptyBackfillReport());
  const [done, setDone] = useState(false);

  const run = useMutation({
    mutationFn: async () => {
      setDone(false);
      setReport(createEmptyBackfillReport());
      return runHistoricalBackfill((r) => setReport(r));
    },
    onSuccess: (final) => {
      setReport(final);
      setDone(true);
      toast.success("Historikus backfill lefutott", {
        description: `Frissítve: ${final.company.changed} cég, ${final.contact.changed} kapcsolattartó, ${final.lead.changed} lead, ${final.thread.changed} thread.`,
      });
      // Cache invalidate — minden D5/D7 nézet újraszámol
      qc.invalidateQueries({ queryKey: ["dq"] });
      qc.invalidateQueries({ queryKey: ["companies"] });
      qc.invalidateQueries({ queryKey: ["contacts"] });
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["quality"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Backfill sikertelen"),
  });

  const kinds: BackfillKind[] = ["company", "contact", "lead", "thread"];

  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base flex items-center gap-2">
            <History className="h-4 w-4 text-primary" /> Historikus backfill
          </CardTitle>
          <Button size="sm" onClick={() => run.mutate()} disabled={run.isPending}>
            {run.isPending ? (
              <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Fut…</>
            ) : (
              <><PlayCircle className="h-3.5 w-3.5 mr-1.5" /> Indítás</>
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Egyszer lefuttatja az összes meglévő rekordon a D3 enrichment és a thread-összekapcsoló motort.
          Nem módosít sémát — csak kitölti a hiányzó mezőket és összeköti a kapcsolódó rekordokat.
        </p>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {kinds.map((k) => {
            const p = report[k];
            const pct = p.total ? Math.round((p.processed / p.total) * 100) : 0;
            return (
              <div key={k} className="rounded-md border p-3">
                <div className="flex items-center justify-between text-xs font-medium">
                  <span>{KIND_LABEL[k]}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {p.processed}/{p.total || "—"}
                  </span>
                </div>
                <Progress value={pct} className="mt-2 h-1.5" />
                <div className="mt-2 flex items-center justify-between text-[11px]">
                  <span className="flex items-center gap-1 text-emerald-700">
                    <CheckCircle2 className="h-3 w-3" /> {p.changed} javítva
                  </span>
                  {p.errors > 0 && (
                    <span className="flex items-center gap-1 text-destructive">
                      <AlertTriangle className="h-3 w-3" /> {p.errors}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {done && (
          <p className="mt-3 text-xs text-emerald-700">
            ✓ Készen van. Az összes lista és KPI automatikusan újraszámolt.
          </p>
        )}
      </CardContent>
    </Card>
  );
}