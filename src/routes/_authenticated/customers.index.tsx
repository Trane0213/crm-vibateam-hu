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
import { ACTIVE_PROJECT_STATUSES, COMPANY_TYPE_LABEL } from "@/lib/viba-constants";

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
    queryKey: ["customers", "list", "projects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id,company_id,status,created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Utolsó aktivitáshoz a Detail oldallal megegyező forrásokat használjuk
  const activity = useQuery({
    queryKey: ["customers", "list", "activity"],
    queryFn: async () => {
      const [calls, meetings, threads, fups] = await Promise.all([
        supabase.from("phone_calls").select("company_id,created_at"),
        supabase.from("meetings").select("company_id,meeting_date"),
        supabase.from("email_threads").select("company_id,last_message_at"),
        supabase.from("followups").select("project_id,due_date"),
      ]);
      return {
        calls: calls.data ?? [],
        meetings: meetings.data ?? [],
        threads: threads.data ?? [],
        followups: fups.data ?? [],
      };
    },
  });

  const rows = useMemo(() => {
    const byCo = new Map<string, { total: number; active: number; last: number }>();
    const projectToCo = new Map<string, string>();
    for (const p of projects.data ?? []) {
      if (!p.company_id) continue;
      projectToCo.set(p.id, p.company_id);
      const x = byCo.get(p.company_id) ?? { total: 0, active: 0, last: 0 };
      x.total += 1;
      if (ACTIVE_PROJECT_STATUSES.includes(p.status)) x.active += 1;
      const ts = new Date(p.created_at ?? 0).getTime();
      if (ts > x.last) x.last = ts;
      byCo.set(p.company_id, x);
    }
    const bump = (coId: string | null | undefined, dateStr: string | null | undefined) => {
      if (!coId || !dateStr) return;
      const x = byCo.get(coId) ?? { total: 0, active: 0, last: 0 };
      const ts = new Date(dateStr).getTime();
      if (!Number.isFinite(ts)) return;
      if (ts > x.last) x.last = ts;
      byCo.set(coId, x);
    };
    for (const e of activity.data?.calls ?? [])    bump(e.company_id, e.created_at);
    for (const e of activity.data?.meetings ?? []) bump(e.company_id, e.meeting_date);
    for (const e of activity.data?.threads ?? [])  bump(e.company_id, e.last_message_at);
    for (const f of activity.data?.followups ?? []) bump(projectToCo.get(f.project_id), f.due_date);

    return (companies.data ?? []).map((c: any) => {
      const s = byCo.get(c.id) ?? { total: 0, active: 0, last: 0 };
      const status = s.active > 0 ? "Aktív" : s.total > 0 ? "Korábbi" : "Új";
      return {
        ...c,
        projectCount: s.total,
        activeCount: s.active,
        lastActivity: s.last ? new Date(s.last).toISOString() : null,
        status,
      };
    });
  }, [companies.data, projects.data, activity.data]);

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