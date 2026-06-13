import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Building2, User, Briefcase, UserPlus, Phone, Calendar, Sparkles,
  Mail, BellRing, FolderOpen, StickyNote, History, FileText,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/page-header";
import { supabase } from "@/integrations/supabase/client";
import { useListWhere, humanizeSupabaseError } from "@/lib/db-hooks";
import { fmtDate, fmtDateTime } from "@/components/resource/resource-page";
import { COMPANY_TYPE_LABEL, PROJECT_STATUS_LABEL, ACTIVE_PROJECT_STATUSES } from "@/lib/viba-constants";
import { formatHuf } from "@/lib/format";
import { ProjectTimeline } from "@/components/projects/project-timeline";
import { CompanyHealthPanel } from "@/components/customers/company-health-panel";
import { CrmHealthSummaryCard } from "@/components/customers/crm-health-summary-card";
import { useAutoEnrich } from "@/lib/enrichment/use-auto-enrich";
import { resolveCompanyIdentity } from "@/lib/dedupe/company-identity";
import { usePermissions } from "@/hooks/use-permissions";

export const Route = createFileRoute("/_authenticated/customers/$id")({
  component: CustomerDetail,
});

function CustomerDetail() {
  const { id } = Route.useParams();
  useAutoEnrich("company", id);
  const { role } = usePermissions();
  const isMarketing = role === "marketing";

  const cust = useQuery({
    queryKey: ["customers", "detail", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  // Egységes KPI forrás — ugyanaz, mint a Customer lista.
  const kpi = useQuery({
    queryKey: ["customers", "detail", id, "kpi"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_360_v")
        .select("total_projects,active_projects,open_quotes,overdue_followups,last_activity_at,won_revenue,contact_name,contact_email,contact_phone")
        .eq("customer_id", id)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const contacts  = useListWhere<any>("contacts",      "company_id", id, { order: "name",         ascending: true });
  const projects  = useListWhere<any>("projects",      "company_id", id, { order: "created_at",   ascending: false });
  const leads     = useListWhere<any>("leads",         "company_id", id, { order: "created_at",   ascending: false });
  const calls     = useListWhere<any>("phone_calls",   "company_id", id, { order: "created_at",   ascending: false });
  const meetings  = useListWhere<any>("meetings",      "company_id", id, { order: "meeting_date", ascending: false });
  const threads   = useListWhere<any>("email_threads", "company_id", id, { order: "last_message_at", ascending: false });

  // D7 — Identity Strength a CRM Egészség blokkhoz.
  const identity = useQuery({
    queryKey: ["customers", "detail", id, "identity"],
    queryFn: () => resolveCompanyIdentity(id),
    staleTime: 60_000,
  });

  const projectIds = (projects.data ?? []).map((p) => p.id);

  const quotes = useQuery({
    queryKey: ["customer", id, "quotes", projectIds.length],
    enabled: projectIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("quotes").select("*").in("project_id", projectIds).order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const followups = useQuery({
    queryKey: ["customer", id, "followups", projectIds.length],
    enabled: projectIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("followups").select("*").in("project_id", projectIds).order("due_date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
  const docs = useQuery({
    queryKey: ["customer", id, "docs", projectIds.length],
    enabled: projectIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("project_documents").select("*").in("project_id", projectIds).order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const notes = useQuery({
    queryKey: ["customer", id, "notes", projectIds.length],
    enabled: projectIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("project_notes").select("*").in("project_id", projectIds).order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  if (cust.isLoading) return <div className="p-6 text-sm text-muted-foreground">Ügyfél betöltése…</div>;
  if (cust.error || !cust.data) {
    return <div className="p-6"><EmptyState icon={Building2} title="Ügyfél nem található" description={(cust.error as any)?.message} /></div>;
  }

  const c = cust.data;
  const isPersonal = c.company_type === "maganszemely";
  const TypeIcon = isPersonal ? User : Building2;
  const primary = (contacts.data ?? [])[0] ?? null;
  const openFollowups = (followups.data ?? []).filter((f) => !f.completed);
  const overdueFollowups = openFollowups.filter((f) => f.due_date && new Date(f.due_date) < new Date());
  // A tab-tartalmakhoz továbbra is kellenek a részletes listák,
  // de a KPI számok a view-ból jönnek (egyetlen forrás).
  const activeProjectList = (projects.data ?? []).filter((p) => ACTIVE_PROJECT_STATUSES.includes(p.status));
  const totalProjects   = kpi.data?.total_projects    ?? projects.data?.length ?? 0;
  const activeProjects  = kpi.data?.active_projects   ?? activeProjectList.length;
  const openQuotesCount = kpi.data?.open_quotes       ?? (quotes.data ?? []).filter((q) => ["draft","sent","negotiation"].includes(q.status)).length;
  const overdueCount    = kpi.data?.overdue_followups ?? overdueFollowups.length;
  const lastActivityAtView = kpi.data?.last_activity_at ?? null;
  const wonRevenue      = Number(kpi.data?.won_revenue ?? 0);
  const totalQuoteValue = wonRevenue || (quotes.data ?? []).reduce((a, r) => a + (Number(r.total_amount) || 0), 0);
  const lastActivityAt = (() => {
    if (lastActivityAtView) return lastActivityAtView;
    const dates: number[] = [];
    for (const e of calls.data ?? [])    if (e.created_at)      dates.push(new Date(e.created_at).getTime());
    for (const e of meetings.data ?? []) if (e.meeting_date)    dates.push(new Date(e.meeting_date).getTime());
    for (const e of threads.data ?? [])  if (e.last_message_at) dates.push(new Date(e.last_message_at).getTime());
    for (const e of followups.data ?? []) if (e.due_date)       dates.push(new Date(e.due_date).getTime());
    if (!dates.length) return null;
    return new Date(Math.max(...dates)).toISOString();
  })();
  const customerStatus = activeProjects > 0
    ? "Aktív"
    : totalProjects > 0 ? "Korábbi ügyfél" : "Új";

  return (
    <div className="flex flex-col">
      <div className="border-b bg-background px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Ügyfél</div>
            <h1 className="mt-1 text-xl font-semibold flex items-center gap-2">
              <TypeIcon className="h-5 w-5 text-muted-foreground" />
              {c.name}
              <Badge variant={isPersonal ? "outline" : "secondary"}>
                {isPersonal ? "Magánszemély" : (COMPANY_TYPE_LABEL[c.company_type] ?? "Cég")}
              </Badge>
              <Badge variant="outline">{customerStatus}</Badge>
            </h1>
            <div className="mt-1 text-sm text-muted-foreground flex flex-wrap gap-3">
              {primary?.email   && <span>{primary.email}</span>}
              {primary?.phone   && <span>· {primary.phone}</span>}
              {c.tax_number     && <span>· Adószám: {c.tax_number}</span>}
              {c.website        && <a href={c.website.startsWith("http") ? c.website : `https://${c.website}`} className="text-primary hover:underline" target="_blank" rel="noreferrer">{c.website}</a>}
            </div>
          </div>
          <Badge variant="outline" className="self-start">{formatHuf(totalQuoteValue)} összérték</Badge>
        </div>
        {/* Vezetői összefoglaló */}
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-6">
          <Mini label="Típus"            value={isPersonal ? "Magánszemély" : (COMPANY_TYPE_LABEL[c.company_type] ?? "Cég")} />
          <Mini label="Projekt"          value={`${activeProjects} / ${totalProjects}`} hint="aktív / összes" />
          <Mini label="Nyitott ajánlat"  value={String(openQuotesCount)} tone={openQuotesCount > 0 ? "primary" : undefined} />
          <Mini label="Lejárt utókövetés" value={String(overdueCount)} tone={overdueCount > 0 ? "danger" : undefined} />
          <Mini label="Utolsó aktivitás" value={lastActivityAt ? fmtDate(lastActivityAt) : "—"} />
          <Mini label="Státusz"          value={customerStatus} tone={customerStatus === "Aktív" ? "success" : undefined} />
        </div>
      </div>

      <div className="p-6">
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="flex flex-wrap h-auto">
            <TabsTrigger value="overview"><Building2 className="mr-1.5 h-3.5 w-3.5" />Áttekintés</TabsTrigger>
            <TabsTrigger value="projects"><Briefcase className="mr-1.5 h-3.5 w-3.5" />Projektek ({projects.data?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="quotes"><FileText className="mr-1.5 h-3.5 w-3.5" />Ajánlatok ({quotes.data?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="followups"><BellRing className="mr-1.5 h-3.5 w-3.5" />Utókövetés ({openFollowups.length})</TabsTrigger>
            <TabsTrigger value="contacts"><UserPlus className="mr-1.5 h-3.5 w-3.5" />Kapcsolattartók ({contacts.data?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="leads"><Sparkles className="mr-1.5 h-3.5 w-3.5" />Leadek ({leads.data?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="emails"><Mail className="mr-1.5 h-3.5 w-3.5" />Emailek ({threads.data?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="calls"><Phone className="mr-1.5 h-3.5 w-3.5" />Hívások ({calls.data?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="meetings"><Calendar className="mr-1.5 h-3.5 w-3.5" />Találkozók ({meetings.data?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="docs"><FolderOpen className="mr-1.5 h-3.5 w-3.5" />Dokumentumok ({docs.data?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="notes"><StickyNote className="mr-1.5 h-3.5 w-3.5" />Jegyzetek ({notes.data?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="timeline"><History className="mr-1.5 h-3.5 w-3.5" />Idővonal</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="lg:col-span-2">
              <CompanyHealthPanel
                company={c}
                contacts={contacts.data ?? []}
                leads={leads.data ?? []}
              />
              <CrmHealthSummaryCard
                company={c}
                contacts={contacts.data ?? []}
                leads={leads.data ?? []}
                threads={threads.data ?? []}
              />
              {identity.data && (
                <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-xs">
                  <span className="font-medium uppercase tracking-wider text-muted-foreground">
                    Identity Strength
                  </span>
                  <Badge variant="outline" className="tabular-nums">
                    {identity.data.identityStrength}/100
                  </Badge>
                  {identity.data.isStrongIdentity && (
                    <Badge variant="secondary">erős azonosító</Badge>
                  )}
                  <span className="ml-2 text-muted-foreground">Forrás: {identity.data.identitySource}</span>
                  {identity.data.lastEnrichmentCandidate !== "none" && (
                    <span className="text-muted-foreground">
                      · javasolt enrichment: <span className="font-mono">{identity.data.lastEnrichmentCandidate}</span>
                    </span>
                  )}
                </div>
              )}
            </div>
            <Card>
              <CardHeader><CardTitle className="text-sm">Alapadatok</CardTitle></CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                <Row label={isPersonal ? "Név" : "Cégnév"} value={c.name} />
                <Row label="Típus" value={isPersonal ? "Magánszemély" : (COMPANY_TYPE_LABEL[c.company_type] ?? "—")} />
                {!isPersonal && <Row label="Adószám" value={c.tax_number ?? "—"} />}
                {primary?.phone   && <Row label="Telefon" value={primary.phone} />}
                {primary?.email   && <Row label="E-mail"  value={primary.email} />}
                {c.website        && <Row label="Web"     value={c.website} />}
                <Row label="Létrejött" value={fmtDate(c.created_at)} />
              </CardContent>
            </Card>
            {c.notes && (
              <Card>
                <CardHeader><CardTitle className="text-sm">Megjegyzés</CardTitle></CardHeader>
                <CardContent className="text-sm whitespace-pre-wrap">{c.notes}</CardContent>
              </Card>
            )}
            <Card>
              <CardHeader><CardTitle className="text-sm">Aktív projektek</CardTitle></CardHeader>
              <CardContent>
                {(projects.data ?? []).length === 0 ? <EmptyState icon={Briefcase} title="Nincs projekt" /> : (
                  <ul className="space-y-1.5 text-sm">
                    {(projects.data ?? []).slice(0, 5).map((p) => (
                      <li key={p.id} className="flex justify-between gap-2">
                        <Link to="/projects/$id" params={{ id: p.id }} className="truncate text-primary hover:underline">{p.title ?? `#${String(p.id).slice(0,8)}`}</Link>
                        <span className="text-muted-foreground">{PROJECT_STATUS_LABEL[p.status] ?? p.status ?? "—"}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Aktív utókövetések</CardTitle></CardHeader>
              <CardContent>
                {openFollowups.length === 0 ? <EmptyState icon={BellRing} title="Nincs nyitott utókövetés" /> : (
                  <ul className="space-y-1.5 text-sm">
                    {openFollowups.slice(0, 5).map((f) => {
                      const overdue = f.due_date && new Date(f.due_date) < new Date();
                      return (
                        <li key={f.id} className="flex justify-between gap-2">
                          <span className="truncate">{f.followup_type ?? "—"}</span>
                          <span className={`tabular-nums ${overdue ? "text-destructive font-semibold" : "text-muted-foreground"}`}>{fmtDateTime(f.due_date)}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="projects" className="mt-4">
            <SimpleList rows={projects.data} link={(r) => ({ to: "/projects/$id", params: { id: r.id } })} cols={[
              { label: "Megnevezés", get: (r) => r.title },
              { label: "Státusz", get: (r) => PROJECT_STATUS_LABEL[r.status] ?? r.status ?? "—" },
              { label: "Cím", get: (r) => r.address ?? "—" },
              { label: "Határidő", get: (r) => fmtDate(r.deadline) },
            ]} empty="Még nincs projekt." emptyIcon={Briefcase} />
          </TabsContent>
          <TabsContent value="quotes" className="mt-4">
            <SimpleList rows={quotes.data} link={(r) => ({ to: "/quotes/$id", params: { id: r.id } })} cols={[
              { label: "Verzió", get: (r) => r.version != null ? `v${r.version}` : `#${String(r.id).slice(0,8)}` },
              { label: "Státusz", get: (r) => r.status ?? "—" },
              { label: "Összeg", get: (r) => formatHuf(Number(r.total_amount ?? 0)) },
              { label: "Létrejött", get: (r) => fmtDate(r.created_at) },
            ]} empty="Még nincs ajánlat." emptyIcon={FileText} />
          </TabsContent>
          <TabsContent value="followups" className="mt-4">
            <SimpleList rows={followups.data} cols={[
              { label: "Esedékesség", get: (r) => fmtDateTime(r.due_date) },
              { label: "Típus", get: (r) => r.followup_type ?? "—" },
              { label: "Lezárva", get: (r) => (r.completed ? "✓" : "—") },
              { label: "Jegyzet", get: (r) => r.result ?? "—" },
            ]} empty="Nincs utókövetés." emptyIcon={BellRing} />
          </TabsContent>
          <TabsContent value="contacts" className="mt-4">
            <SimpleList rows={contacts.data} link={(r) => ({ to: "/contacts/$id", params: { id: r.id } })} cols={[
              { label: "Név", get: (r) => r.name },
              { label: "Beosztás", get: (r) => r.position ?? "—" },
              { label: "E-mail", get: (r) => r.email ?? "—" },
              { label: "Telefon", get: (r) => r.phone ?? "—" },
            ]} empty="Nincs kapcsolattartó." emptyIcon={UserPlus} />
          </TabsContent>
          <TabsContent value="leads" className="mt-4">
            <SimpleList rows={leads.data} link={(r) => ({ to: "/leads/$id", params: { id: r.id } })} cols={[
              { label: "Összefoglaló", get: (r) => r.summary ?? `#${String(r.id).slice(0,8)}` },
              { label: "Forrás", get: (r) => r.source ?? "—" },
              { label: "Státusz", get: (r) => r.status ?? "—" },
              { label: "Létrejött", get: (r) => fmtDate(r.created_at) },
            ]} empty="Nincs lead." emptyIcon={Sparkles} />
          </TabsContent>
          <TabsContent value="emails" className="mt-4">
            <SimpleList rows={threads.data} link={(r) => ({ to: "/emails/$threadId", params: { threadId: r.id } })} cols={[
              { label: "Tárgy", get: (r) => r.subject ?? "(nincs tárgy)" },
              { label: "Résztvevők", get: (r) => (r.participants ?? []).join(", ") || "—" },
              { label: "Utolsó", get: (r) => fmtDateTime(r.last_message_at) },
            ]} empty="Nincs email." emptyIcon={Mail} />
          </TabsContent>
          <TabsContent value="calls" className="mt-4">
            <SimpleList rows={calls.data} cols={[
              { label: "Időpont", get: (r) => fmtDateTime(r.created_at) },
              { label: "Irány", get: (r) => r.direction ?? "—" },
              { label: "Eredmény", get: (r) => r.outcome ?? "—" },
              { label: "Összefoglaló", get: (r) => r.summary ?? "—" },
            ]} empty="Nincs hívás." emptyIcon={Phone} />
          </TabsContent>
          <TabsContent value="meetings" className="mt-4">
            <SimpleList rows={meetings.data} cols={[
              { label: "Időpont", get: (r) => fmtDateTime(r.meeting_date) },
              { label: "Megnevezés", get: (r) => r.title ?? "—" },
              { label: "Helyszín", get: (r) => r.location ?? "—" },
            ]} empty="Nincs találkozó." emptyIcon={Calendar} />
          </TabsContent>
          <TabsContent value="docs" className="mt-4">
            <SimpleList rows={docs.data} cols={[
              { label: "Név", get: (r) => r.name ?? "—" },
              { label: "Típus", get: (r) => r.document_type ?? "—" },
              { label: "Feltöltve", get: (r) => fmtDateTime(r.created_at) },
            ]} empty="Nincs dokumentum." emptyIcon={FolderOpen} />
          </TabsContent>
          <TabsContent value="notes" className="mt-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <CustomerNotesEditor customerId={c.id} initial={c.notes ?? ""} />
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Projekt szintű jegyzetek ({(notes.data ?? []).length})</CardTitle>
                </CardHeader>
                <CardContent>
                  {(notes.data ?? []).length === 0 ? <EmptyState icon={StickyNote} title="Nincs projekt jegyzet" /> : (
                    <ul className="space-y-2">
                      {(notes.data ?? []).map((n) => (
                        <li key={n.id} className="rounded-md border bg-card p-3 text-sm">
                          <div className="text-xs text-muted-foreground mb-1">{fmtDateTime(n.created_at)}</div>
                          <div className="whitespace-pre-wrap">{n.note}</div>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
          <TabsContent value="timeline" className="mt-4">
            <ProjectTimeline
              project={null}
              projects={projects.data ?? []}
              leads={leads.data ?? []}
              quotes={quotes.data ?? []}
              followups={followups.data ?? []}
              tasks={[]}
              emails={(threads.data ?? []).map((t: any) => ({
                id: t.id,
                created_at: t.last_message_at ?? t.updated_at ?? t.created_at,
                summary: t.subject ?? "(nincs tárgy)",
                from_email: (t.participants ?? [])[0] ?? null,
              }))}
              calls={calls.data ?? []}
              meetings={meetings.data ?? []}
              documents={docs.data ?? []}
              notes={notes.data ?? []}
            />
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
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}

function Mini({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "primary" | "danger" | "success" }) {
  const toneCls =
    tone === "danger"  ? "text-destructive" :
    tone === "success" ? "text-emerald-600" :
    tone === "primary" ? "text-primary"     : "";
  return (
    <div className="rounded-md border bg-card px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-0.5 text-base font-semibold tabular-nums ${toneCls}`}>{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function CustomerNotesEditor({ customerId, initial }: { customerId: string; initial: string }) {
  const qc = useQueryClient();
  const [value, setValue] = useState(initial);
  useEffect(() => { setValue(initial); }, [initial]);
  const m = useMutation({
    mutationFn: async (notes: string) => {
      const { error } = await supabase.from("companies").update({ notes: notes || null }).eq("id", customerId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Ügyfél jegyzet mentve");
      qc.invalidateQueries({ queryKey: ["customers", "detail", customerId] });
    },
    onError: (e: any) => toast.error("Mentés sikertelen", { description: humanizeSupabaseError(e) }),
  });
  const dirty = value !== (initial ?? "");
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <StickyNote className="h-4 w-4" />
          Ügyfél jegyzetek
          <span className="ml-auto text-xs text-muted-foreground font-normal">preferenciák · fizetési tapasztalat · belső infó</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <Textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Pl. csak átutalással fizet, mindig délután hívható, korábban garanciális ügy volt..."
          rows={10}
          className="text-sm"
        />
        <div className="flex justify-end gap-2">
          {dirty && <Button variant="ghost" size="sm" onClick={() => setValue(initial ?? "")}>Mégse</Button>}
          <Button size="sm" disabled={!dirty || m.isPending} onClick={() => m.mutate(value)}>
            {m.isPending ? "Mentés…" : "Mentés"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

type Col = { label: string; get: (r: any) => any };
function SimpleList({ rows, cols, empty, emptyIcon, link }: {
  rows: any[] | undefined; cols: Col[]; empty: string; emptyIcon: any;
  link?: (r: any) => { to: string; params: Record<string, string> };
}) {
  if (!rows || rows.length === 0) return <EmptyState icon={emptyIcon} title="Nincs adat" description={empty} />;
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
                {cols.map((cc, i) => (
                  <td key={cc.label} className="px-3 py-2">
                    {i === 0 && lk ? <Link to={lk.to as any} params={lk.params as any} className="text-primary hover:underline">{String(cc.get(r) ?? "—")}</Link> : String(cc.get(r) ?? "—")}
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