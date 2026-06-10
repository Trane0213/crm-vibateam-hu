import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Sparkles, Briefcase } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/page-header";
import { supabase } from "@/integrations/supabase/client";
import { useListWhere } from "@/lib/db-hooks";
import { fmtDate, useLookup } from "@/components/resource/resource-page";

export const Route = createFileRoute("/_authenticated/leads/$id")({
  component: LeadDetail,
});

function LeadDetail() {
  const { id } = Route.useParams();
  const companyLabel = useLookup("companies", "name");
  const contactLabel = useLookup("contacts", "name");
  const q = useQuery({
    queryKey: ["leads", "detail", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("leads").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });
  const projects = useListWhere<any>("projects", "lead_id", id, { order: "created_at", ascending: false });

  if (q.isLoading) return <div className="p-6 text-sm text-muted-foreground">Lead betöltése…</div>;
  if (q.error || !q.data) {
    return <div className="p-6"><EmptyState icon={Sparkles} title="A lead nem található" description={(q.error as any)?.message} /></div>;
  }
  const lead = q.data;
  return (
    <div className="flex flex-col">
      <div className="border-b bg-background px-6 py-4">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Lead</div>
        <h1 className="mt-1 text-xl font-semibold flex items-center gap-2">
          {lead.summary ?? `#${String(lead.id).slice(0, 8)}`}
          {lead.status && <Badge variant="secondary">{lead.status}</Badge>}
        </h1>
        <div className="mt-1 text-sm text-muted-foreground">
          {lead.source ? `Forrás: ${lead.source}` : ""}
          {lead.project_type ? ` · ${lead.project_type}` : ""}
        </div>
      </div>
      <div className="grid gap-4 p-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-sm">Adatok</CardTitle></CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            <Row label="Cég">
              {lead.company_id ? (
                <Link to="/companies/$id" params={{ id: lead.company_id }} className="text-primary hover:underline">
                  {companyLabel(lead.company_id)}
                </Link>
              ) : "—"}
            </Row>
            <Row label="Kapcsolattartó">
              {lead.contact_id ? (
                <Link to="/contacts/$id" params={{ id: lead.contact_id }} className="text-primary hover:underline">
                  {contactLabel(lead.contact_id)}
                </Link>
              ) : "—"}
            </Row>
            <Row label="Forrás"><span>{lead.source ?? "—"}</span></Row>
            <Row label="Típus"><span>{lead.project_type ?? "—"}</span></Row>
            <Row label="Létrejött"><span>{fmtDate(lead.created_at)}</span></Row>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Briefcase className="h-4 w-4" />Konvertált projektek</CardTitle></CardHeader>
          <CardContent>
            {(projects.data ?? []).length === 0 ? (
              <EmptyState icon={Briefcase} title="Még nincs projekt a leadhez" />
            ) : (
              <ul className="space-y-1.5 text-sm">
                {(projects.data ?? []).map((p) => (
                  <li key={p.id} className="flex justify-between gap-2">
                    <Link to="/projects/$id" params={{ id: p.id }} className="truncate text-primary hover:underline">{p.title}</Link>
                    <span className="text-muted-foreground">{p.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        {lead.summary && (
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle className="text-sm">Összefoglaló</CardTitle></CardHeader>
            <CardContent className="text-sm whitespace-pre-wrap">{lead.summary}</CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{children}</span>
    </div>
  );
}