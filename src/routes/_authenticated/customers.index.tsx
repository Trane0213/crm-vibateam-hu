import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Users, Building2, User, Sparkles, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { PageHeader, EmptyState } from "@/components/page-header";
import { supabase } from "@/integrations/supabase/client";
import { COMPANY_TYPE_LABEL } from "@/lib/viba-constants";
import { loadCompanySurfaceMap } from "@/lib/crm/crm-surface";
import { FilterBar, relativeTime } from "@/components/marketing-ui";

export const Route = createFileRoute("/_authenticated/customers/")({
  component: CustomersIndex,
});

function CustomersIndex() {
  const [search, setSearch] = useState("");
  const [segment, setSegment] = useState<"all" | "active" | "new" | "reactivatable">("all");
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
        .select("customer_id,active_projects,total_projects,open_quotes,overdue_followups,last_activity_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Pipeline érték: nyitott (draft/sent/negotiation) ajánlatok összegzve cégenként.
  const pipeline = useQuery({
    queryKey: ["customers", "list", "pipeline_value"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select("total_amount,status,projects!inner(company_id)")
        .in("status", ["draft", "sent", "negotiation"]);
      if (error) throw error;
      const map = new Map<string, number>();
      for (const q of (data ?? []) as any[]) {
        const cid = q.projects?.company_id;
        if (!cid) continue;
        map.set(cid, (map.get(cid) ?? 0) + Number(q.total_amount ?? 0));
      }
      return map;
    },
  });

  // Utolsó email cégenként.
  const lastEmail = useQuery({
    queryKey: ["customers", "list", "last_email"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_threads")
        .select("company_id,last_message_at")
        .not("company_id", "is", null)
        .order("last_message_at", { ascending: false })
        .limit(5000);
      if (error) throw error;
      const map = new Map<string, string>();
      for (const t of (data ?? []) as any[]) {
        if (!map.has(t.company_id)) map.set(t.company_id, t.last_message_at);
      }
      return map;
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
    const sevenDaysAgo = Date.now() - 7 * 86400_000;
    const ninetyDaysAgo = Date.now() - 90 * 86400_000;
    const all = (companies.data ?? []).map((c: any) => {
      const k = byCo.get(c.id);
      const active = k?.active_projects ?? 0;
      const totalProjects = k?.total_projects ?? 0;
      const s = surface?.get(c.id);
      const leads = s?.activeLeadCount ?? 0;
      const lastActivity = k?.last_activity_at ?? null;
      const lastEmailAt = lastEmail.data?.get(c.id) ?? null;
      const pipelineValue = pipeline.data?.get(c.id) ?? 0;
      const createdMs = c.created_at ? new Date(c.created_at).getTime() : 0;
      const lastActMs = lastActivity ? new Date(lastActivity).getTime() : 0;
      const isNew = createdMs >= sevenDaysAgo;
      const isReactivatable =
        !isNew && totalProjects > 0 && active === 0 && leads === 0 &&
        (lastActMs === 0 || lastActMs < ninetyDaysAgo);
      return {
        ...c,
        leads,
        activeProjects: active,
        totalProjects,
        lastActivity,
        lastEmailAt,
        pipelineValue,
        isNew,
        isReactivatable,
      };
    });
    const s = search.trim().toLowerCase();
    const searched = s ? all.filter((r) => r.name?.toLowerCase().includes(s)) : all;
    if (segment === "active") return searched.filter((r) => r.activeProjects > 0 || r.leads > 0);
    if (segment === "new") return searched.filter((r) => r.isNew);
    if (segment === "reactivatable") return searched.filter((r) => r.isReactivatable);
    return searched;
  }, [companies.data, kpis.data, surface, search, segment, pipeline.data, lastEmail.data]);

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Ügyfelek"
        description="Cégek és magánszemélyek — marketing nézet a fontos mezőkkel."
      />
      <div className="p-6">
        <div className="mb-3 flex flex-wrap gap-1.5">
          {([
            { v: "all" as const,            label: "Mind" },
            { v: "active" as const,         label: "Aktív" },
            { v: "new" as const,            label: "Új (7 nap)" },
            { v: "reactivatable" as const,  label: "Reaktiválható" },
          ]).map((s) => (
            <button
              key={s.v}
              onClick={() => setSegment(s.v)}
              className={`rounded-full border px-3 py-1 text-xs transition ${
                segment === s.v
                  ? "border-primary bg-primary/10 text-primary font-medium"
                  : "border-border bg-card hover:bg-muted/50 text-muted-foreground"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="mb-3">
          <FilterBar
            search={search}
            onSearch={setSearch}
            searchPlaceholder="Keresés ügyfélnév…"
            resultCount={rows.length}
            onReset={search || segment !== "all" ? () => { setSearch(""); setSegment("all"); } : undefined}
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
                  <TableHead>Utolsó aktivitás</TableHead>
                  <TableHead>Szegmens</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r: any) => {
                  const isPersonal = r.company_type === "maganszemely";
                  const TypeIcon = isPersonal ? User : Building2;
                  return (
                    <TableRow key={r.id} className="cursor-pointer">
                      <TableCell className="font-medium">
                        <div className="flex flex-col gap-0.5">
                          <Link
                            to="/customers/$id"
                            params={{ id: r.id }}
                            className="flex items-center gap-2 text-primary hover:underline"
                          >
                            <TypeIcon className="h-4 w-4 text-muted-foreground" />
                            {r.name}
                          </Link>
                          <span className="text-[11px] text-muted-foreground">
                            {isPersonal ? "Magánszemély" : (COMPANY_TYPE_LABEL[r.company_type] ?? "Cég")}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {relativeTime(r.lastActivity)}
                      </TableCell>
                      <TableCell>
                        {r.isNew ? (
                          <Badge className="border-[color:var(--status-info)]/40 bg-[color:var(--status-info)]/10 text-[color:var(--status-info)]">
                            <Sparkles className="mr-1 h-3 w-3" />Új
                          </Badge>
                        ) : r.isReactivatable ? (
                          <Badge className="border-[color:var(--status-warning)]/40 bg-[color:var(--status-warning)]/10 text-[color:var(--status-warning)]">
                            <RotateCcw className="mr-1 h-3 w-3" />Reaktiválható
                          </Badge>
                        ) : r.activeProjects > 0 || r.leads > 0 ? (
                          <Badge variant="secondary">Aktív</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
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