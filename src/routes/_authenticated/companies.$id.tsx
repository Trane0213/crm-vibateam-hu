import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Building2, Briefcase, UserPlus, Phone, Calendar, Sparkles } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/page-header";
import { supabase } from "@/integrations/supabase/client";
import { useListWhere } from "@/lib/db-hooks";
import { fmtDate, fmtDateTime } from "@/components/resource/resource-page";

export const Route = createFileRoute("/_authenticated/companies/$id")({
  component: CompanyDetail,
});

function CompanyDetail() {
  const { id } = Route.useParams();
  const q = useQuery({
    queryKey: ["companies", "detail", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });
  const contacts = useListWhere<any>("contacts", "company_id", id, { order: "name", ascending: true });
  const projects = useListWhere<any>("projects", "company_id", id, { order: "created_at", ascending: false });
  const leads = useListWhere<any>("leads", "company_id", id, { order: "created_at", ascending: false });
  const calls = useListWhere<any>("phone_calls", "company_id", id, { order: "created_at", ascending: false });
  const meetings = useListWhere<any>("meetings", "company_id", id, { order: "meeting_date", ascending: false });

  if (q.isLoading) return <div className="p-6 text-sm text-muted-foreground">Cég betöltése…</div>;
  if (q.error || !q.data) {
    return <div className="p-6"><EmptyState icon={Building2} title="A cég nem található" description={(q.error as any)?.message} /></div>;
  }
  const c = q.data;
  return (
    <div className="flex flex-col">
      <div className="border-b bg-background px-6 py-4">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Cég</div>
        <h1 className="mt-1 text-xl font-semibold flex items-center gap-2">
          {c.name}
          {c.company_type && <Badge variant="secondary">{c.company_type}</Badge>}
        </h1>
        <div className="mt-1 text-sm text-muted-foreground flex flex-wrap gap-3">
          {c.tax_number && <span>Adószám: {c.tax_number}</span>}
          {c.website && <a href={c.website.startsWith("http") ? c.website : `https://${c.website}`} className="text-primary hover:underline" target="_blank" rel="noreferrer">{c.website}</a>}
        </div>
      </div>
      <div className="p-6">
        <Tabs defaultValue="overview">
          <TabsList className="flex flex-wrap h-auto">
            <TabsTrigger value="overview"><Building2 className="mr-1.5 h-3.5 w-3.5" />Áttekintés</TabsTrigger>
            <TabsTrigger value="contacts"><UserPlus className="mr-1.5 h-3.5 w-3.5" />Kapcsolattartók ({contacts.data?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="projects"><Briefcase className="mr-1.5 h-3.5 w-3.5" />Projektek ({projects.data?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="leads"><Sparkles className="mr-1.5 h-3.5 w-3.5" />Leadek ({leads.data?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="calls"><Phone className="mr-1.5 h-3.5 w-3.5" />Hívások ({calls.data?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="meetings"><Calendar className="mr-1.5 h-3.5 w-3.5" />Találkozók ({meetings.data?.length ?? 0})</TabsTrigger>
          </TabsList>
          <TabsContent value="overview" className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-sm">Alapadatok</CardTitle></CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                <Row label="Cégnév" value={c.name} />
                <Row label="Típus" value={c.company_type ?? "—"} />
                <Row label="Adószám" value={c.tax_number ?? "—"} />
                <Row label="Weboldal" value={c.website ?? "—"} />
                <Row label="Létrejött" value={fmtDate(c.created_at)} />
              </CardContent>
            </Card>
            {c.notes && (
              <Card>
                <CardHeader><CardTitle className="text-sm">Megjegyzés</CardTitle></CardHeader>
                <CardContent className="text-sm whitespace-pre-wrap">{c.notes}</CardContent>
              </Card>
            )}
          </TabsContent>
          <TabsContent value="contacts" className="mt-4">
            <SimpleList rows={contacts.data} link={(r) => ({ to: "/contacts/$id", params: { id: r.id } })} cols={[
              { label: "Név", get: (r) => r.name },
              { label: "Beosztás", get: (r) => r.position ?? "—" },
              { label: "E-mail", get: (r) => r.email ?? "—" },
              { label: "Telefon", get: (r) => r.phone ?? "—" },
            ]} empty="Nincs kapcsolattartó." />
          </TabsContent>
          <TabsContent value="projects" className="mt-4">
            <SimpleList rows={projects.data} link={(r) => ({ to: "/projects/$id", params: { id: r.id } })} cols={[
              { label: "Megnevezés", get: (r) => r.title },
              { label: "Státusz", get: (r) => r.status ?? "—" },
              { label: "Határidő", get: (r) => fmtDate(r.deadline) },
            ]} empty="Még nincs projekt." />
          </TabsContent>
          <TabsContent value="leads" className="mt-4">
            <SimpleList rows={leads.data} link={(r) => ({ to: "/leads/$id", params: { id: r.id } })} cols={[
              { label: "Összefoglaló", get: (r) => r.summary ?? `#${String(r.id).slice(0,8)}` },
              { label: "Forrás", get: (r) => r.source ?? "—" },
              { label: "Státusz", get: (r) => r.status ?? "—" },
              { label: "Létrejött", get: (r) => fmtDate(r.created_at) },
            ]} empty="Nincs lead." />
          </TabsContent>
          <TabsContent value="calls" className="mt-4">
            <SimpleList rows={calls.data} cols={[
              { label: "Időpont", get: (r) => fmtDateTime(r.created_at) },
              { label: "Irány", get: (r) => r.direction ?? "—" },
              { label: "Típus", get: (r) => r.call_type ?? "—" },
              { label: "Eredmény", get: (r) => r.outcome ?? "—" },
              { label: "Összefoglaló", get: (r) => r.summary ?? "—" },
            ]} empty="Nincs hívás." />
          </TabsContent>
          <TabsContent value="meetings" className="mt-4">
            <SimpleList rows={meetings.data} cols={[
              { label: "Időpont", get: (r) => fmtDateTime(r.meeting_date) },
              { label: "Megnevezés", get: (r) => r.title ?? "—" },
              { label: "Helyszín", get: (r) => r.location ?? "—" },
              { label: "Jegyzet", get: (r) => r.summary ?? "—" },
            ]} empty="Nincs találkozó." />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

type Col = { label: string; get: (r: any) => any };
function SimpleList({ rows, cols, empty, link }: {
  rows: any[] | undefined; cols: Col[]; empty: string;
  link?: (r: any) => { to: string; params: Record<string, string> };
}) {
  if (!rows || rows.length === 0) return <EmptyState icon={Building2} title="Nincs adat" description={empty} />;
  return (
    <div className="rounded-md border bg-card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
          <tr>{cols.map((c) => <th key={c.label} className="px-3 py-2 text-left">{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const lk = link?.(r);
            return (
              <tr key={r.id} className="border-t hover:bg-muted/30">
                {cols.map((c, i) => (
                  <td key={c.label} className="px-3 py-2">
                    {i === 0 && lk ? <Link to={lk.to} params={lk.params} className="text-primary hover:underline">{String(c.get(r) ?? "—")}</Link> : String(c.get(r) ?? "—")}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}