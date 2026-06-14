import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Sparkles, Briefcase, Send, FileText, Activity } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/page-header";
import { supabase } from "@/integrations/supabase/client";
import { useListWhere } from "@/lib/db-hooks";
import { fmtDate, useLookup } from "@/components/resource/resource-page";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusChip } from "@/components/sales/status-chip";
import { LeadStatusStepper } from "@/components/sales/lead-status-stepper";
import { LeadActionBar } from "@/components/sales/lead-action-bar";
import { NextStepCell } from "@/components/sales/next-step-cell";
import { LEAD_STATUS_LABEL, LOST_REASON_LABEL, NEXT_STEP_LABEL, type LeadStatus, type LostReason, type NextStepType } from "@/lib/sales/constants";

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
  const quotes = useListWhere<any>("quotes", "lead_id", id, { order: "version", ascending: false });
  const history = useQuery({
    queryKey: ["lead-status-history", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_status_history")
        .select("id, from_status, to_status, changed_at, changed_by")
        .eq("lead_id", id)
        .order("changed_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });
  return (
    <div className="flex flex-col">
      <div className="border-b bg-background px-6 py-4">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Lead</div>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-semibold">
              {lead.summary ?? `#${String(lead.id).slice(0, 8)}`}
              <StatusChip status={lead.status} />
            </h1>
            <div className="mt-1 text-sm text-muted-foreground">
              {lead.source ? `Forrás: ${lead.source}` : ""}
              {lead.project_type ? ` · ${lead.project_type}` : ""}
            </div>
          </div>
          <LeadActionBar status={lead.status} />
        </div>
        <div className="mt-3">
          <LeadStatusStepper status={lead.status} />
        </div>
      </div>
      <Tabs defaultValue="overview" className="px-6 pt-4">
        <TabsList>
          <TabsTrigger value="overview">Áttekintés</TabsTrigger>
          <TabsTrigger value="activity"><Activity className="mr-1 h-3.5 w-3.5" />Aktivitás</TabsTrigger>
          <TabsTrigger value="quotes"><FileText className="mr-1 h-3.5 w-3.5" />Ajánlatok</TabsTrigger>
          <TabsTrigger value="handoff"><Send className="mr-1 h-3.5 w-3.5" />Átadás</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="pt-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-sm">Adatok</CardTitle></CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            <Row label="Cég">
              {lead.company_id ? (
                <Link to="/customers/$id" params={{ id: lead.company_id }} className="text-primary hover:underline">
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
            <Row label="Kiosztva">
              <span>{lead.assigned_to ? fmtDate(lead.assigned_at) : <span className="italic text-muted-foreground">nincs</span>}</span>
            </Row>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Következő lépés</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {!lead.next_step_type && !lead.next_step_due_at ? (
              <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Nincs következő lépés megadva. SLA-tile figyelmeztet a dashboardon.
              </div>
            ) : (
              <div className="space-y-1">
                <Row label="Típus"><span>{lead.next_step_type ? NEXT_STEP_LABEL[lead.next_step_type as NextStepType] ?? lead.next_step_type : "—"}</span></Row>
                <Row label="Esedékesség"><span>{lead.next_step_due_at ? fmtDate(lead.next_step_due_at) : "—"}</span></Row>
                {lead.next_step_note && <div className="rounded-md border bg-muted/40 p-2 text-xs text-muted-foreground">{lead.next_step_note}</div>}
              </div>
            )}
          </CardContent>
        </Card>
        {lead.status === "lost" && (
          <Card className="lg:col-span-2 border-rose-200">
            <CardHeader><CardTitle className="text-sm text-rose-800">Elveszett — indok</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-sm">
              <Row label="Indok"><span>{lead.lost_reason ? LOST_REASON_LABEL[lead.lost_reason as LostReason] ?? lead.lost_reason : "—"}</span></Row>
              {lead.lost_note && <div className="rounded-md border bg-muted/40 p-2 text-xs text-muted-foreground">{lead.lost_note}</div>}
            </CardContent>
          </Card>
        )}
        {lead.summary && (
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle className="text-sm">Összefoglaló</CardTitle></CardHeader>
            <CardContent className="text-sm whitespace-pre-wrap">{lead.summary}</CardContent>
          </Card>
        )}
      </div>
        </TabsContent>

        <TabsContent value="activity" className="pt-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">Státusz timeline</CardTitle></CardHeader>
            <CardContent>
              {history.isLoading ? (
                <p className="text-sm text-muted-foreground">Betöltés…</p>
              ) : (history.data ?? []).length === 0 ? (
                <EmptyState icon={Activity} title="Még nincs státuszváltás" />
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {(history.data ?? []).map((h: any) => (
                    <li key={h.id} className="flex items-center justify-between border-b py-1.5 last:border-0">
                      <span className="text-muted-foreground">{new Date(h.changed_at).toLocaleString("hu-HU")}</span>
                      <span className="flex items-center gap-2">
                        <Badge variant="outline">{h.from_status ?? "—"}</Badge>
                        <span className="text-muted-foreground">→</span>
                        <Badge>{h.to_status}</Badge>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="quotes" className="pt-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">Ajánlat verziók</CardTitle></CardHeader>
            <CardContent>
              {(quotes.data ?? []).length === 0 ? (
                <EmptyState icon={FileText} title="Még nincs ajánlat ehhez a leadhez" />
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {(quotes.data ?? []).map((qu: any) => (
                    <li key={qu.id} className="flex items-center justify-between border-b py-1.5 last:border-0">
                      <span className="flex items-center gap-2">
                        <Badge variant="outline">v{qu.version}</Badge>
                        {qu.is_current && <Badge>aktuális</Badge>}
                        <Link to="/quotes/$id" params={{ id: qu.id }} className="text-primary hover:underline">megnyitás</Link>
                      </span>
                      <span className="text-xs text-muted-foreground">{fmtDate(qu.created_at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="handoff" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Briefcase className="h-4 w-4" /> Projekt átadás
              </CardTitle>
            </CardHeader>
            <CardContent>
              {lead.status !== "won" ? (
                <p className="text-sm text-muted-foreground">
                  Csak <code>won</code> státuszú leadből indítható projekt. Jelenlegi: <StatusChip status={lead.status} />
                </p>
              ) : (projects.data ?? []).length > 0 ? (
                <ul className="space-y-1.5 text-sm">
                  {(projects.data ?? []).map((p) => (
                    <li key={p.id} className="flex justify-between gap-2 border-b py-1.5 last:border-0">
                      <Link to="/projects/$id" params={{ id: p.id }} className="truncate text-primary hover:underline">{p.title}</Link>
                      <span className="text-muted-foreground">{p.status}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">Még nincs projekt. Indítsd a Sales átadás felületről.</p>
                  <Link to="/sales/handoff" className="inline-flex items-center text-sm text-primary hover:underline">
                    Tovább a Átadás oldalra →
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
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