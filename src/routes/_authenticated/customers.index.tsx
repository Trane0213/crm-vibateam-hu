import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Users, Building2, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { PageHeader, EmptyState } from "@/components/page-header";
import { supabase } from "@/integrations/supabase/client";
import { COMPANY_TYPE_LABEL } from "@/lib/viba-constants";
import { loadCompanySurfaceMap } from "@/lib/crm/crm-surface";
import { FilterBar, StatusPill, relativeTime, type StatusKey } from "@/components/marketing-ui";

export const Route = createFileRoute("/_authenticated/customers/")({
  component: CustomersIndex,
});

function CustomersIndex() {
  const [search, setSearch] = useState("");
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

  const kpis = useQuery({
    queryKey: ["customers", "list", "kpi"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_kpi_v")
        .select("customer_id,active_projects,last_activity_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const surfaceQ = useQuery({
    queryKey: ["companies", "surface-map"],
    queryFn: loadCompanySurfaceMap,
    staleTime: 60_000,
  });
  const surface = surfaceQ.data;

  const rows = useMemo(() => {
    const byCo = new Map<string, any>();
    for (const k of (kpis.data ?? []) as any[]) {
      byCo.set(k.customer_id, k);
    }
    const all = (companies.data ?? []).map((c: any) => {
      const k = byCo.get(c.id);
      const active = k?.active_projects ?? 0;
      const s = surface?.get(c.id);
      const leads = s?.activeLeadCount ?? 0;
      const lastActivity = k?.last_activity_at ?? null;
      const status: StatusKey = active > 0 || leads > 0 ? "active" : lastActivity ? "neutral" : "new";
      return {
        ...c,
        leads,
        lastActivity,
        status,
      };
    });
    const s = search.trim().toLowerCase();
    return s ? all.filter((r) => r.name?.toLowerCase().includes(s)) : all;
  }, [companies.data, kpis.data, surface, search]);

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Ügyfelek"
        description="Cégek és magánszemélyek — marketing nézet a fontos mezőkkel."
      />
      <div className="p-6">
        <div className="mb-3">
          <FilterBar
            search={search}
            onSearch={setSearch}
            searchPlaceholder="Keresés ügyfélnév…"
            resultCount={rows.length}
            onReset={search ? () => setSearch("") : undefined}
          />
        </div>
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
                  <TableHead className="text-right">Leadek</TableHead>
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
                        {r.leads > 0 ? (
                          <span className="font-medium text-primary">{r.leads}</span>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {relativeTime(r.lastActivity)}
                      </TableCell>
                      <TableCell>
                        <StatusPill status={r.status} />
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