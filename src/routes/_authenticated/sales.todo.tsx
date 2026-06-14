import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { SalesShell } from "@/components/sales/sales-shell";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { NextStepCell } from "@/components/sales/next-step-cell";
import { StatusChip } from "@/components/sales/status-chip";
import { DUE_BUCKETS, DUE_BUCKET_LABEL, type DueBucket } from "@/lib/sales/constants";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/sales/todo")({
  component: SalesTodoPage,
});

function SalesTodoPage() {
  const [bucket, setBucket] = useState<DueBucket>("today");

  const { data, isLoading } = useQuery({
    queryKey: ["sales", "todo", bucket],
    queryFn: async () => {
      const { data: bucketRows, error: bErr } = await supabase
        .from("v_lead_due_buckets")
        .select("lead_id, bucket, next_step_due_at")
        .eq("bucket", bucket)
        .limit(200);
      if (bErr) throw bErr;
      const ids = (bucketRows ?? []).map((r: any) => r.lead_id);
      if (ids.length === 0) return [];
      const { data: leads, error } = await supabase
        .from("leads")
        .select("id, status, summary, source, next_step_type, next_step_due_at, assigned_to")
        .in("id", ids);
      if (error) throw error;
      return leads ?? [];
    },
  });

  return (
    <SalesShell title="Teendők" description="A nyitott leadek időkorlátai. Csak váz — szerkesztés a Lead workspace-ben.">
      <div className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {DUE_BUCKETS.map((b) => (
            <button
              key={b}
              onClick={() => setBucket(b)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs transition",
                bucket === b
                  ? "bg-primary text-primary-foreground border-primary"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              {DUE_BUCKET_LABEL[b]}
            </button>
          ))}
        </div>
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 text-sm text-muted-foreground">Betöltés…</div>
            ) : (data?.length ?? 0) === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground">
                Nincs ebben a sávban lead.
              </div>
            ) : (
              <ul className="divide-y">
                {data!.map((l: any) => (
                  <li key={l.id} className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-muted/40">
                    <StatusChip status={l.status} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{l.summary || l.source || `Lead #${String(l.id).slice(0, 8)}`}</div>
                      <NextStepCell type={l.next_step_type} dueAt={l.next_step_due_at} />
                    </div>
                    <Link to="/leads/$id" params={{ id: l.id }} className="text-xs text-primary hover:underline">
                      megnyitás
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </SalesShell>
  );
}