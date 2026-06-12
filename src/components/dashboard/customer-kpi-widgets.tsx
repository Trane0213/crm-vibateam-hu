import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Users, Activity, FileText, BellRing } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/page-header";
import { supabase } from "@/integrations/supabase/client";
import { fmtDateTime } from "@/components/resource/resource-page";

type KpiRow = {
  customer_id: string;
  total_projects: number;
  active_projects: number;
  open_quotes: number;
  overdue_followups: number;
  last_activity_at: string | null;
  customer_name?: string | null;
};

type ActivityRow = {
  customer_id: string;
  event_type: string;
  title: string | null;
  event_date: string;
  customer_name?: string | null;
};

export function CustomerKpiWidgets() {
  const kpi = useQuery({
    queryKey: ["dashboard", "customer_kpi_v"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_kpi_v")
        .select("customer_id,total_projects,active_projects,open_quotes,overdue_followups,last_activity_at");
      if (error) throw error;
      return (data ?? []) as KpiRow[];
    },
  });

  const activity = useQuery({
    queryKey: ["dashboard", "customer_activity_v"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_activity_v")
        .select("customer_id,event_type,title,event_date")
        .order("event_date", { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as ActivityRow[];
    },
  });

  const namesQ = useQuery({
    queryKey: ["dashboard", "customer_names"],
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("id,name");
      if (error) throw error;
      const m = new Map<string, string>();
      for (const r of data ?? []) m.set((r as any).id, (r as any).name ?? "—");
      return m;
    },
  });
  const nameOf = (id: string) => namesQ.data?.get(id) ?? "—";

  const rows = (kpi.data ?? []).map((r) => ({ ...r, customer_name: nameOf(r.customer_id) }));
  const topActive = [...rows]
    .sort((a, b) => (b.active_projects - a.active_projects) || (b.open_quotes - a.open_quotes))
    .filter((r) => r.active_projects > 0 || r.open_quotes > 0)
    .slice(0, 5);
  const topOpenQuotes = [...rows]
    .filter((r) => r.open_quotes > 0)
    .sort((a, b) => b.open_quotes - a.open_quotes)
    .slice(0, 5);
  const topOverdueFu = [...rows]
    .filter((r) => r.overdue_followups > 0)
    .sort((a, b) => b.overdue_followups - a.overdue_followups)
    .slice(0, 5);

  return (
    <div className="grid gap-4 px-6 pb-6 lg:grid-cols-2">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" /> Legaktívabb ügyfelek
            </CardTitle>
            <CardDescription>aktív projektek és nyitott ajánlatok alapján</CardDescription>
          </div>
          <Link to="/customers" className="text-xs text-primary hover:underline">Mind</Link>
        </CardHeader>
        <CardContent>
          {topActive.length === 0 ? (
            <EmptyState icon={Users} title="Nincs aktív ügyfél" />
          ) : (
            <ul className="space-y-1.5 text-sm">
              {topActive.map((r) => (
                <li key={r.customer_id} className="flex items-center justify-between gap-3">
                  <Link to="/customers/$id" params={{ id: r.customer_id }} className="truncate text-primary hover:underline">
                    {r.customer_name ?? "—"}
                  </Link>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {r.active_projects} aktív · {r.open_quotes} ajánlat
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" /> Utolsó ügyfél aktivitások
          </CardTitle>
          <CardDescription>egységes esemény idővonal</CardDescription>
        </CardHeader>
        <CardContent>
          {(activity.data ?? []).length === 0 ? (
            <EmptyState icon={Activity} title="Nincs aktivitás" />
          ) : (
            <ul className="space-y-1.5 text-sm">
              {(activity.data ?? []).map((a, i) => (
                <li key={`${a.customer_id}-${i}`} className="flex items-center justify-between gap-3">
                  <span className="min-w-0 flex-1 truncate">
                    <Link to="/customers/$id" params={{ id: a.customer_id }} className="text-primary hover:underline">
                      {nameOf(a.customer_id)}
                    </Link>
                    <span className="text-muted-foreground"> · {a.event_type}</span>
                    {a.title && <span className="text-muted-foreground"> — {a.title}</span>}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{fmtDateTime(a.event_date)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" /> Nyitott ajánlatok ügyfelenként
          </CardTitle>
          <CardDescription>top 5</CardDescription>
        </CardHeader>
        <CardContent>
          {topOpenQuotes.length === 0 ? (
            <EmptyState icon={FileText} title="Nincs nyitott ajánlat" />
          ) : (
            <ul className="space-y-1.5 text-sm">
              {topOpenQuotes.map((r) => (
                <li key={r.customer_id} className="flex items-center justify-between gap-3">
                  <Link to="/customers/$id" params={{ id: r.customer_id }} className="truncate text-primary hover:underline">
                    {r.customer_name ?? "—"}
                  </Link>
                  <span className="shrink-0 text-xs text-primary font-medium tabular-nums">{r.open_quotes}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BellRing className="h-4 w-4 text-destructive" /> Lejárt utókövetések ügyfelenként
          </CardTitle>
          <CardDescription>top 5</CardDescription>
        </CardHeader>
        <CardContent>
          {topOverdueFu.length === 0 ? (
            <EmptyState icon={BellRing} title="Nincs lejárt utókövetés" />
          ) : (
            <ul className="space-y-1.5 text-sm">
              {topOverdueFu.map((r) => (
                <li key={r.customer_id} className="flex items-center justify-between gap-3">
                  <Link to="/customers/$id" params={{ id: r.customer_id }} className="truncate text-primary hover:underline">
                    {r.customer_name ?? "—"}
                  </Link>
                  <span className="shrink-0 text-xs text-destructive font-semibold tabular-nums">{r.overdue_followups}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}