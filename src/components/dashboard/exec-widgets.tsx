import { useQuery } from "@tanstack/react-query";
import { TrendingUp, Layers, UserCog } from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/page-header";
import { supabase } from "@/integrations/supabase/client";
import { formatHuf } from "@/lib/format";
import { PROJECT_STATUS_LABEL } from "@/lib/viba-constants";

type PipelineRow = { status: string; project_count: number; total_value: number };
type RevenueRow  = { month: string; quote_count: number; total_amount: number };
type WorkloadRow = {
  user_id: string; user_name: string; email: string | null;
  open_tasks: number; open_followups: number; active_projects: number;
};

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
        .select("user_id,user_name,email,open_tasks,open_followups,active_projects");
      if (error) throw error;
      return ((data ?? []) as WorkloadRow[])
        .sort((a, b) =>
          (b.open_tasks + b.open_followups + b.active_projects) -
          (a.open_tasks + a.open_followups + a.active_projects),
        );
    },
  });

  const pipelineData = (pipeline.data ?? []).map((r) => ({
    status: r.status,
    label: PROJECT_STATUS_LABEL[r.status] ?? r.status,
    count: Number(r.project_count ?? 0),
    value: Number(r.total_value ?? 0),
  }));

  return (
    <div className="grid gap-4 px-6 pb-6 lg:grid-cols-2">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Layers className="h-4 w-4 text-primary" /> Projekt pipeline
          </CardTitle>
          <CardDescription>Aktív státuszok és kapcsolódó ajánlat-összérték</CardDescription>
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
                  labelStyle={{ color: "var(--foreground)" }}
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
          <CardDescription>Hónap × elfogadott ajánlat összérték</CardDescription>
        </CardHeader>
        <CardContent className="h-[240px]">
          {(revenue.data ?? []).length === 0 ? (
            <EmptyState icon={TrendingUp} title="Nincs megnyert ajánlat" />
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
          <CardDescription>Nyitott teendők felhasználónként</CardDescription>
        </CardHeader>
        <CardContent>
          {(workload.data ?? []).length === 0 ? (
            <EmptyState icon={UserCog} title="Nincs adat" />
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-2 py-1 text-left">Felhasználó</th>
                  <th className="px-2 py-1 text-right">Projekt</th>
                  <th className="px-2 py-1 text-right">Feladat</th>
                  <th className="px-2 py-1 text-right">Utókövetés</th>
                </tr>
              </thead>
              <tbody>
                {(workload.data ?? []).slice(0, 8).map((r) => (
                  <tr key={r.user_id} className="border-t">
                    <td className="px-2 py-1 font-medium truncate">{r.user_name}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{r.active_projects}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{r.open_tasks}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{r.open_followups}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}