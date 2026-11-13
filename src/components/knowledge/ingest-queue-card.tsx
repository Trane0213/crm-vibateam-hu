import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileSearch, Loader2, Play } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { knowledgeProcessBatch, knowledgeQueueOverview } from "@/lib/knowledge/ingest.functions";
import { STATUS_LABEL, type IngestStatus } from "@/lib/knowledge/ingest-model";

const ORDER: (IngestStatus | "pending")[] = ["pending", "processed", "partial", "needs_review", "unsupported", "error"];
const TONE: Record<string, "default" | "secondary" | "destructive" | "outline"> = { processed: "default", error: "destructive", needs_review: "destructive", partial: "secondary" };

export function IngestQueueCard() {
  const qc = useQueryClient();
  const overview = useServerFn(knowledgeQueueOverview);
  const process = useServerFn(knowledgeProcessBatch);
  const q = useQuery({ queryKey: ["knowledge-ingest"], queryFn: () => overview() });
  const run = useMutation({
    mutationFn: () => process({ data: { limit: 5 } }),
    onSuccess: (r) => { toast.success(r.claimed ? `${r.claimed} dokumentum feldolgozása lezárult.` : "Nincs sorban álló dokumentum."); void qc.invalidateQueries({ queryKey: ["knowledge-ingest"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "A feldolgozás nem indult el."),
  });
  const counts = q.data?.counts ?? {};
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><FileSearch className="h-4 w-4" /> Dokumentumok a közös AI-tudásbázisban</CardTitle>
        <CardDescription>
          Új vagy módosított dokumentum és e-mail-melléklet automatikusan sorba kerül. A gomb a következő 5 fájlt dolgozza fel:
          csak szövegkinyerés, AI-hívás és költség nélkül. Az eredeti fájl nem módosul; a művelet bármikor megismételhető.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {q.isLoading ? <p className="text-sm text-muted-foreground">Betöltés…</p> : q.isError ? <p className="text-sm text-destructive">Az állapot nem tölthető be.</p> : (
          <>
            <div className="flex flex-wrap gap-2">
              {ORDER.map((s) => <Badge key={s} variant={TONE[s] ?? "outline"}>{STATUS_LABEL[s]}: {counts[s] ?? 0}</Badge>)}
              <Badge variant="outline">Kereshető szövegrész: {q.data?.chunks ?? 0}</Badge>
              <Badge variant="outline">Elavult verzió: {q.data?.superseded ?? 0}</Badge>
            </div>
            <Button size="sm" onClick={() => run.mutate()} disabled={run.isPending || !(counts.pending ?? 0)}>
              {run.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
              Következő 5 feldolgozása
            </Button>
            {(q.data?.problems ?? []).length > 0 && (
              <div className="space-y-1">
                <div className="text-sm font-medium">Figyelmet igénylő dokumentumok</div>
                <ul className="divide-y rounded-md border text-sm">
                  {q.data!.problems.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2">
                      <span className="truncate">{p.title}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{STATUS_LABEL[p.processing_status as IngestStatus] ?? p.processing_status}{p.error_code ? ` · ${p.error_code}` : ""}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
