import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { SalesShell } from "@/components/sales/sales-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import {
  LEAD_STATUSES,
  LEAD_STATUS_LABEL,
  LEAD_STATUS_TONE,
  DUE_BUCKETS,
  DUE_BUCKET_LABEL,
  DUE_BUCKET_TONE,
  type LeadStatus,
  type DueBucket,
} from "@/lib/sales/constants";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/sales/")({
  component: SalesDashboardPage,
});

function SalesDashboardPage() {
  return (
    <SalesShell title="Sales áttekintés" description="Pipeline, teendők és aktuális terhelés egyben.">
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-12">
          <PipelineTiles />
        </div>
        <div className="lg:col-span-6">
          <DueBucketsCard />
        </div>
        <div className="lg:col-span-6">
          <MyLoadCard />
        </div>
        <div className="lg:col-span-12">
          <RecentActivityCard />
        </div>
      </div>
    </SalesShell>
  );
}

function PipelineTiles() {
  const { data } = useQuery({
    queryKey: ["sales", "pipeline-counts"],
    queryFn: async () => {
      const out: Record<LeadStatus, number> = Object.fromEntries(
        LEAD_STATUSES.map((s) => [s, 0]),
      ) as Record<LeadStatus, number>;
      const { data, error } = await supabase.from("leads").select("status");
      if (error) throw error;
      for (const row of data ?? []) {
        const s = (row as { status: string }).status as LeadStatus;
        if (s in out) out[s] = (out[s] ?? 0) + 1;
      }
      return out;
    },
  });
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Pipeline</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
          {LEAD_STATUSES.map((s) => {
            // Won = projektté vált → Projektek listára.
            // Lost = külön Elveszett menüpontra.
            // A többi (aktív pipeline állapot) a Pipeline kanbanra megy,
            // mert sales szerepkörből nincs /sales/leads "Lista" útvonal.
            const linkProps =
              s === "won"
                ? ({ to: "/projects" } as const)
                : s === "lost"
                ? ({ to: "/leads/lost" } as const)
                : ({ to: "/sales/pipeline" } as const);
            return (
              <Link
                key={s}
                {...linkProps}
                className={cn(
                  "rounded-lg border px-3 py-2 transition hover:shadow-sm",
                  LEAD_STATUS_TONE[s],
                )}
              >
                <div className="text-[11px] opacity-80">{LEAD_STATUS_LABEL[s]}</div>
                <div className="text-2xl font-semibold leading-tight">{data?.[s] ?? "–"}</div>
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function DueBucketsCard() {
  const { data } = useQuery({
    queryKey: ["sales", "due-buckets"],
    queryFn: async () => {
      const { data, error } = await supabase.from("v_lead_due_buckets").select("bucket");
      if (error) throw error;
      const out: Record<DueBucket, number> = Object.fromEntries(
        DUE_BUCKETS.map((b) => [b, 0]),
      ) as Record<DueBucket, number>;
      for (const row of data ?? []) {
        const b = (row as { bucket: string }).bucket as DueBucket;
        if (b in out) out[b]++;
      }
      return out;
    },
  });
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Teendők státusza</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {DUE_BUCKETS.map((b) => (
            <Link
              key={b}
              to="/sales/todo"
              search={{ bucket: b } as any}
              className={cn("rounded-md border px-3 py-2 transition hover:shadow-sm", DUE_BUCKET_TONE[b])}
            >
              <div className="text-[11px] opacity-80">{DUE_BUCKET_LABEL[b]}</div>
              <div className="text-xl font-semibold leading-tight">{data?.[b] ?? "–"}</div>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function MyLoadCard() {
  const { data } = useQuery({
    queryKey: ["sales", "user-load"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_sales_user_load")
        .select("user_id, full_name, email, active_lead_count")
        .order("active_lead_count", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Csapat terhelés</CardTitle>
      </CardHeader>
      <CardContent>
        {!data || data.length === 0 ? (
          <p className="text-sm text-muted-foreground">Még nincs sales felhasználó vagy lead.</p>
        ) : (
          <ul className="space-y-1.5">
            {data.map((u: any) => (
              <li key={u.user_id} className="flex items-center justify-between rounded-md border px-3 py-1.5 text-sm">
                <span className="truncate">{u.full_name || u.email || "—"}</span>
                <Badge variant="secondary">{u.active_lead_count}</Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function RecentActivityCard() {
  const { data } = useQuery({
    queryKey: ["sales", "recent-status"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_status_history")
        .select("id, lead_id, from_status, to_status, changed_at")
        .order("changed_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
  });
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Legutóbbi státuszváltások</CardTitle>
      </CardHeader>
      <CardContent>
        {!data || data.length === 0 ? (
          <p className="text-sm text-muted-foreground">Még nincs státuszváltás.</p>
        ) : (
          <ul className="divide-y">
            {data.map((h: any) => (
              <li key={h.id} className="flex items-center justify-between py-1.5 text-sm">
                <span className="text-muted-foreground">
                  {new Date(h.changed_at).toLocaleString("hu-HU")}
                </span>
                <span className="flex items-center gap-2">
                  <Badge variant="outline">{h.from_status ?? "—"}</Badge>
                  <span className="text-muted-foreground">→</span>
                  <Badge>{h.to_status}</Badge>
                </span>
                <Link
                  to="/leads/$id"
                  params={{ id: h.lead_id }}
                  className="text-xs text-primary hover:underline"
                >
                  megnyitás
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}