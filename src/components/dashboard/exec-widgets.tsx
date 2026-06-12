import { useQuery } from "@tanstack/react-query";
import { TrendingUp, Layers, UserCog, BellRing } from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/page-header";
import { supabase } from "@/integrations/supabase/client";
import { formatHuf } from "@/lib/format";
import { PROJECT_STATUS_LABEL } from "@/lib/viba-constants";

type PipelineRow  = { status: string; project_count: number; total_value: number };
type RevenueRow   = { month: string; quote_count: number; total_amount: number };
type WorkloadRow  = {
  user_id: string; user_name: string; email: string | null;
  open_tasks: number; overdue_tasks: number; done_tasks: number;
};
type HeatmapRow   = { day: string; followup_type: string; open_count: number; done_count: number };

export function ExecutiveWidgets() {
  const pipeline = useQuery({
    queryKey: ["dashboard_pipeline_v"],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dashboard_pipeline_v")
        .select("status,project_count,total_value");
      if (error) throw error;
      return (data ?? []) as PipelineRow[];
    },
  });

  const revenue = useQuery({
    queryKey: ["dashboard_revenue_monthly_v"],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dashboard_revenue_monthly_v")
        .select("month,quote_count,total_amount")
        .order("month", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as RevenueRow[]).map((r) => ({
        ...r,
        label: new Date(r.month).toLocaleDateString("hu-HU", { month: "short", year: "2-digit" }),
        total_amount: Number(r.total_amount ?? 0),
      }));
    },
  });

  const workload = useQuery({
    queryKey: ["dashboard_user_workload_v"],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dashboard_user_workload_v")
        .select("user_id,user_name,email,open_tasks,overdue_tasks,done_tasks");
      if (error) throw error;
      return ((data ?? []) as WorkloadRow[])
        .sort((a, b) => (b.open_tasks - a.open_tasks) || (b.overdue_tasks - a.overdue_tasks));
    },
  });

  const heatmap = useQuery({
    queryKey: ["dashboard_followup_heatmap_v"],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dashboard_followup_heatmap_v")
        .select("day,followup_type,open_count,done_count")
        .order("day", { ascending: false });
      if (error) throw error;
      return (data ?? []) as HeatmapRow[];
    },
  });

  const pipelineData = (pipeline.data ?? []).map((r) => ({
    status: r.status,
    label: PROJECT_STATUS_LABEL[r.status] ?? r.status,
    count: Number(r.project_count ?? 0),
    value: Number(r.total_value ?? 0),
  }));

  // Heatmap aggregation: type-onként az utolsó 14 nap összesítve
  const heatmapByType = (() => {
    const map = new Map<string, { open: number; done: number }>();
    for (const r of heatmap.data ?? []) {
      const cur = map.get(r.followup_type) ?? { open: 0, done: 0 };
      cur.open += Number(r.open_count ?? 0);
      cur.done += Number(r.done_count ?? 0);
      map.set(r.followup_type, cur);
    }
    return Array.from(map.entries())
      .map(([t, v]) => ({ type: t, ...v, total: v.open + v.done }))
      .sort((a, b) => b.total - a.total);
  })();

  return (
    <div className="grid gap-4 px-6 pb-6 lg:grid-cols-2">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Layers className="h-4 w-4 text-primary" /> Projekt pipeline
          </CardTitle>
          <CardDescription>Projektek darabszáma státuszonként + kapcsolódó utolsó ajánlat összérték</CardDescription>
        </CardHeader>
        <CardContent className="h-[260px]">
          {pipelineData.length === 0 ? (
            <EmptyState icon={Layers} title="Nincs projekt adat" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={pipelineData} margin={{ top: 10, right: 12, left: 0, bottom: 30 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="label" angle={-25} textAnchor="end" interval={0} tick={{ fontSize: 11 }} height={60} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(v: any, name: string) =>
                    name === "value" ? formatHuf(Number(v)) : [v, name === "count" ? "Projektek" : name]
                  }
                  contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", fontSize: 12 }}
                />
                <Bar dataKey="count" name="Projektek" fill="var(--primary)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" /> Megnyert bevétel (12 hónap)
          </CardTitle>
          <CardDescription>
            A <code className="text-[10px]">dashboard_status_config</code> „quote_won" listájából.
          </CardDescription>
        </CardHeader>
        <CardContent className="h-[240px]">
          {(revenue.data ?? []).length === 0 ? (
            <EmptyState
              icon={TrendingUp}
              title="Nincs adat"
              description="Töltsd ki a Settings → Dashboard státusz oldalon, mely quote státuszok számítanak megnyertnek."
            />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={revenue.data ?? []} margin={{ top: 10, right: 12, left: 0, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => `${(v / 1_000_000).toFixed(0)}M`} tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(v: any) => formatHuf(Number(v))}
                  contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", fontSize: 12 }}
                />
                <Line type="monotone" dataKey="total_amount" name="Bevétel" stroke="var(--primary)" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <UserCog className="h-4 w-4 text-primary" /> Felelős terheltség
          </CardTitle>
          <CardDescription>Nyitott / lejárt feladatok felhasználónként (csak tasks)</CardDescription>
        </CardHeader>
        <CardContent>
          {(workload.data ?? []).length === 0 ? (
            <EmptyState icon={UserCog} title="Nincs adat" />
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-2 py-1 text-left">Felhasználó</th>
                  <th className="px-2 py-1 text-right">Nyitott</th>
                  <th className="px-2 py-1 text-right">Lejárt</th>
                  <th className="px-2 py-1 text-right">Kész</th>
                </tr>
              </thead>
              <tbody>
                {(workload.data ?? []).slice(0, 10).map((r) => (
                  <tr key={r.user_id} className="border-t">
                    <td className="px-2 py-1 font-medium truncate">{r.user_name}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{r.open_tasks}</td>
                    <td className={`px-2 py-1 text-right tabular-nums ${r.overdue_tasks > 0 ? "text-destructive font-semibold" : ""}`}>
                      {r.overdue_tasks}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">{r.done_tasks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BellRing className="h-4 w-4 text-primary" /> Utókövetés aktivitás (90 nap, típus szerint)
          </CardTitle>
          <CardDescription>Nyitott vs. lezárt utókövetések típusonkénti megoszlása</CardDescription>
        </CardHeader>
        <CardContent>
          {heatmapByType.length === 0 ? (
            <EmptyState icon={BellRing} title="Nincs utókövetés a megadott időszakban" />
          ) : (
            <div className="space-y-2">
              {heatmapByType.map((row) => {
                const max = Math.max(...heatmapByType.map((r) => r.total));
                const openPct = max > 0 ? Math.round((row.open / max) * 100) : 0;
                const donePct = max > 0 ? Math.round((row.done / max) * 100) : 0;
                return (
                  <div key={row.type} className="flex items-center gap-3 text-sm">
                    <div className="w-32 truncate text-muted-foreground">{row.type}</div>
                    <div className="flex-1 flex gap-0.5 h-5 rounded overflow-hidden bg-muted/30">
                      <div
                        className="bg-[color:var(--status-warning)]"
                        style={{ width: `${openPct}%` }}
                        title={`Nyitott: ${row.open}`}
                      />
                      <div
                        className="bg-emerald-500/70"
                        style={{ width: `${donePct}%` }}
                        title={`Kész: ${row.done}`}
                      />
                    </div>
                    <div className="w-24 text-right tabular-nums text-xs">
                      <span className="text-[color:var(--status-warning)] font-medium">{row.open}</span>
                      <span className="text-muted-foreground"> / </span>
                      <span className="text-emerald-600">{row.done}</span>
                    </div>
                  </div>
                );
              })}
              <div className="pt-2 flex items-center gap-4 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-sm bg-[color:var(--status-warning)]" /> Nyitott
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-sm bg-emerald-500/70" /> Lezárt
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
