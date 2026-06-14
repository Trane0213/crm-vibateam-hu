import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { SalesShell } from "@/components/sales/sales-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { StatusChip } from "@/components/sales/status-chip";
import { NextStepCell } from "@/components/sales/next-step-cell";
import { LEAD_STATUSES, type LeadStatus } from "@/lib/sales/constants";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/sales/leads")({
  component: SalesLeadsPage,
});

type QuickFilter = "mine_open" | "unassigned" | "assigned_not_contacted" | "overdue" | "all";

const QUICK_FILTERS: { id: QuickFilter; label: string }[] = [
  { id: "mine_open", label: "Saját, nyitott" },
  { id: "unassigned", label: "Kiosztatlan" },
  { id: "assigned_not_contacted", label: "Kiosztva, nem kontaktált" },
  { id: "overdue", label: "Lejárt next step" },
  { id: "all", label: "Mind" },
];

function SalesLeadsPage() {
  const { user } = useAuth();
  const [filter, setFilter] = useState<QuickFilter>("mine_open");
  const [status, setStatus] = useState<LeadStatus | "all">("all");

  const { data, isLoading } = useQuery({
    queryKey: ["sales", "leads", filter, status, user?.id ?? null],
    queryFn: async () => {
      let q = supabase
        .from("leads")
        .select(
          "id, status, source, summary, assigned_to, assigned_at, next_step_type, next_step_due_at, created_at, company_id, pipeline_entered_at",
        )
        // Pipeline menü: kizárólag a tudatos döntéssel átléptetett leadek.
        .not("pipeline_entered_at", "is", null)
        .order("created_at", { ascending: false })
        .limit(200);

      if (filter === "mine_open") {
        if (user?.id) q = q.eq("assigned_to", user.id);
        q = q.not("status", "in", "(won,lost)");
      } else if (filter === "unassigned") {
        q = q.is("assigned_to", null).eq("status", "new");
      } else if (filter === "assigned_not_contacted") {
        q = q.not("assigned_to", "is", null).eq("status", "new");
      } else if (filter === "overdue") {
        q = q.not("status", "in", "(won,lost)").lt("next_step_due_at", new Date().toISOString());
      }

      if (status !== "all") q = q.eq("status", status);

      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <SalesShell title="Leadek" description="Sales nézet — szerepkör-specifikus szűrőkkel.">
      <div className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {QUICK_FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs transition",
                filter === f.id
                  ? "bg-primary text-primary-foreground border-primary"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Státusz:</span>
          <button
            onClick={() => setStatus("all")}
            className={cn(
              "rounded-full border px-2 py-0.5 text-[11px]",
              status === "all" ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted",
            )}
          >
            mind
          </button>
          {LEAD_STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={cn(
                "rounded-full border px-2 py-0.5 text-[11px]",
                status === s ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted",
              )}
            >
              {s}
            </button>
          ))}
        </div>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 text-sm text-muted-foreground">Betöltés…</div>
            ) : (data?.length ?? 0) === 0 ? (
              <div className="p-10 text-center">
                <p className="text-sm text-muted-foreground">Nincs találat ezzel a szűrővel.</p>
              </div>
            ) : (
              <ul className="divide-y">
                {data!.map((l: any) => (
                  <li key={l.id} className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-muted/40">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <StatusChip status={l.status} />
                        <span className="truncate font-medium">
                          {l.summary || l.source || `Lead #${String(l.id).slice(0, 8)}`}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                        <span>forrás: {l.source ?? "—"}</span>
                        <span>•</span>
                        <NextStepCell type={l.next_step_type} dueAt={l.next_step_due_at} />
                      </div>
                    </div>
                    <div className="hidden text-xs text-muted-foreground sm:block">
                      {l.assigned_to ? "kiosztva" : <span className="italic">nincs kiosztva</span>}
                    </div>
                    <Button asChild size="sm" variant="ghost">
                      <Link to="/leads/$id" params={{ id: l.id }}>Megnyitás</Link>
                    </Button>
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