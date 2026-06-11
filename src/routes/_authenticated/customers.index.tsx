import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Users, Building2, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { PageHeader, EmptyState } from "@/components/page-header";
import { supabase } from "@/integrations/supabase/client";
import { fmtDate } from "@/components/resource/resource-page";
import { COMPANY_TYPE_LABEL } from "@/lib/viba-constants";

export const Route = createFileRoute("/_authenticated/customers/")({
  component: CustomersIndex,
});

function CustomersIndex() {
  const companies = useQuery({
    queryKey: ["customers", "list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("id,name,company_type,created_at")
        .order("name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const projects = useQuery({
    queryKey: ["customers", "list", "kpi"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_kpi_v")
        .select("customer_id,total_projects,active_projects,open_quotes,overdue_followups,last_activity_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = useMemo(() => {
    const byCo = new Map<string, any>();
    for (const k of (projects.data ?? []) as any[]) {
      byCo.set(k.customer_id, k);
    }
    return (companies.data ?? []).map((c: any) => {
      const k = byCo.get(c.id);
      const total = k?.total_projects ?? 0;
      const active = k?.active_projects ?? 0;
      const status = active > 0 ? "Aktív" : total > 0 ? "Korábbi" : "Új";
      return {
        ...c,
        projectCount: total,
        activeCount: active,
        openQuotes: k?.open_quotes ?? 0,
        overdueFollowups: k?.overdue_followups ?? 0,
        lastActivity: k?.last_activity_at ?? null,
        status,
      };
    });
  }, [companies.data, projects.data]);

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Ügyfelek"
        description="Egységes ügyfél nézet: cégek és magánszemélyek."
      />
      <div className="p-6">
        {companies.isLoading ? (
          <p className="text-sm text-muted-foreground">Betöltés…</p>
        ) : rows.length === 0 ? (
          <EmptyState icon={Users} title="Nincs ügyfél" description="Először vegyél fel egy céget vagy magánszemélyt." />
        ) : (
          <div className="rounded-md border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ügyfél</TableHead>
                  <TableHead>Típus</TableHead>
                  <TableHead className="text-right">Projektek</TableHead>
                  <TableHead className="text-right">Nyitott ajánlat</TableHead>
                  <TableHead className="text-right">Lejárt follow-up</TableHead>
                  <TableHead>Utolsó aktivitás</TableHead>
                  <TableHead>Státusz</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r: any) => {
                  const isPersonal = r.company_type === "maganszemely";
                  const TypeIcon = isPersonal ? User : Building2;
                  return (
                    <TableRow key={r.id} className="cursor-pointer">
                      <TableCell className="font-medium">
                        <Link
                          to="/customers/$id"
                          params={{ id: r.id }}
                          className="flex items-center gap-2 text-primary hover:underline"
                        >
                          <TypeIcon className="h-4 w-4 text-muted-foreground" />
                          {r.name}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant={isPersonal ? "outline" : "secondary"}>
                          {isPersonal ? "Magánszemély" : (COMPANY_TYPE_LABEL[r.company_type] ?? "Cég")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.activeCount} / {r.projectCount}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.openQuotes > 0 ? (
                          <span className="text-primary font-medium">{r.openQuotes}</span>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.overdueFollowups > 0 ? (
                          <span className="text-destructive font-semibold">{r.overdueFollowups}</span>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {r.lastActivity ? fmtDate(r.lastActivity) : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            r.status === "Aktív"
                              ? "border-emerald-500/40 text-emerald-600"
                              : r.status === "Új"
                              ? "border-primary/40 text-primary"
                              : ""
                          }
                        >
                          {r.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}