import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles, Briefcase, Send, FileText, Activity, User, CalendarClock, ListChecks, Clock, Trophy, XCircle, Plus, Check } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/page-header";
import { supabase } from "@/integrations/supabase/client";
import { useListWhere } from "@/lib/db-hooks";
import { fmtDate, fmtDateTime, useLookup } from "@/components/resource/resource-page";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusChip } from "@/components/sales/status-chip";
import { LeadStatusStepper } from "@/components/sales/lead-status-stepper";
import { LeadActionBar } from "@/components/sales/lead-action-bar";
import { NextStepEditor } from "@/components/sales/next-step-editor";
import { WonDialog } from "@/components/sales/won-dialog";
import { LostDialog } from "@/components/sales/lost-dialog";
import { HandoffDialog, type HandoffPayload } from "@/components/sales/handoff-dialog";
import { useAssigneeLookup } from "@/lib/sales/use-assignee-name";
import { AssigneePicker } from "@/components/sales/assignee-picker";
import { LOST_REASON_LABEL, NEXT_STEP_LABEL, type LeadStatus, type LostReason, type NextStepType } from "@/lib/sales/constants";

export const Route = createFileRoute("/_authenticated/leads/$id")({
  component: LeadDetail,
});

const QUOTE_EDITABLE_STATUSES: LeadStatus[] = ["quote_prep", "quote_sent", "follow_up", "contract"];

function LeadDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const companyLabel = useLookup("companies", "name");
  const contactLabel = useLookup("contacts", "name");
  const assigneeName = useAssigneeLookup();

  const q = useQuery({
    queryKey: ["leads", "detail", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("leads").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });
  const projects = useListWhere<any>("projects", "lead_id", id, { order: "created_at", ascending: false });
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

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["leads", "detail", id] });
    qc.invalidateQueries({ queryKey: ["lead-status-history", id] });
    qc.invalidateQueries({ queryKey: ["projects"] });
    qc.invalidateQueries({ queryKey: ["quotes"] });
  };

  const updateLead = useMutation({
    mutationFn: async (patch: Record<string, any>) => {
      const { error } = await supabase.from("leads").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success("Mentve"); },
    onError: (e: any) => toast.error(e.message ?? "Mentés sikertelen"),
  });

  const [wonOpen, setWonOpen] = useState(false);
  const [lostOpen, setLostOpen] = useState(false);
  const [handoffOpen, setHandoffOpen] = useState(false);

  if (q.isLoading) return <div className="p-6 text-sm text-muted-foreground">Lead betöltése…</div>;
  if (q.error || !q.data) {
    return <div className="p-6"><EmptyState icon={Sparkles} title="A lead nem található" description={(q.error as any)?.message} /></div>;
  }
  const lead = q.data;
  const lastActivityAt = (history.data ?? [])[0]?.changed_at ?? lead.assigned_at ?? lead.created_at;
  const currentStatus = (lead.status ?? "new") as LeadStatus;

  return (
    <div className="flex flex-col">
      <div className="border-b bg-background px-6 py-4">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Lead</div>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-semibold">
              {lead.summary ?? `#${String(lead.id).slice(0, 8)}`}
              <StatusChip status={currentStatus} />
            </h1>
            <div className="mt-1 text-sm text-muted-foreground">
              {lead.source ? `Forrás: ${lead.source}` : ""}
              {lead.project_type ? ` · ${lead.project_type}` : ""}
            </div>
          </div>
          <LeadActionBar
            status={currentStatus}
            busy={updateLead.isPending}
            onChangeStatus={(next) => updateLead.mutate({ status: next })}
            onWon={() => setWonOpen(true)}
            onLost={() => setLostOpen(true)}
          />
        </div>
        <div className="mt-3">
          <LeadStatusStepper status={currentStatus} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
          <div className="rounded-md border bg-muted/30 px-3 py-2">
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
              <User className="h-3 w-3" /> Felelős
            </div>
            <div className="mt-0.5 flex items-center justify-between gap-2">
              <span className={`text-sm font-medium ${!lead.assigned_to ? "italic text-muted-foreground" : ""}`}>
                {assigneeName(lead.assigned_to)}
              </span>
              <AssigneePicker
                assigneeId={lead.assigned_to}
                assigneeLabel={assigneeName(lead.assigned_to)}
                busy={updateLead.isPending}
                onAssign={(next) => updateLead.mutate({ assigned_to: next })}
              />
            </div>
          </div>
          <KeyFact icon={ListChecks} label="Következő lépés" value={lead.next_step_type ? NEXT_STEP_LABEL[lead.next_step_type as NextStepType] ?? lead.next_step_type : "Nincs megadva"} muted={!lead.next_step_type} />
          <KeyFact icon={CalendarClock} label="Határidő" value={lead.next_step_due_at ? fmtDate(lead.next_step_due_at) : "—"} muted={!lead.next_step_due_at} />
          <KeyFact icon={Clock} label="Utolsó aktivitás" value={lastActivityAt ? fmtDate(lastActivityAt) : "—"} muted={!lastActivityAt} />
          {currentStatus === "won" && (
            <KeyFact icon={Trophy} label="Megnyert" value={lead.won_at ? fmtDateTime(lead.won_at) : "—"} />
          )}
          {currentStatus === "lost" && (
            <KeyFact icon={XCircle} label="Elveszett" value={lead.lost_at ? fmtDateTime(lead.lost_at) : "—"} />
          )}
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
          <CardContent className="space-y-3 text-sm">
            {!lead.next_step_type && !lead.next_step_due_at && (
              <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Nincs következő lépés megadva. SLA-tile figyelmeztet a dashboardon.
              </div>
            )}
            <NextStepEditor
              type={lead.next_step_type ?? null}
              dueAt={lead.next_step_due_at ?? null}
              note={lead.next_step_note ?? null}
              busy={updateLead.isPending}
              onSave={(p) => updateLead.mutate(p)}
              onClear={() => updateLead.mutate({ next_step_type: null, next_step_due_at: null, next_step_note: null })}
            />
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
                      <span className="text-muted-foreground">
                        {new Date(h.changed_at).toLocaleString("hu-HU")}
                        <span className="ml-2 text-xs">· {assigneeName(h.changed_by)}</span>
                      </span>
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
          <QuotesTab leadId={id} status={currentStatus} quotes={quotes.data ?? []} onChanged={invalidate} />
        </TabsContent>

        <TabsContent value="handoff" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Briefcase className="h-4 w-4" /> Projekt átadás
              </CardTitle>
            </CardHeader>
            <CardContent>
              {currentStatus !== "won" ? (
                <p className="text-sm text-muted-foreground">
                  Csak <code>won</code> státuszú leadből indítható projekt. Jelenlegi: <StatusChip status={currentStatus} />
                </p>
              ) : (projects.data ?? []).length > 0 ? (
                <HandoffReport projects={projects.data ?? []} />
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">Még nincs projekt ehhez a megnyert leadhez.</p>
                  <Button onClick={() => setHandoffOpen(true)}><Send className="mr-1 h-4 w-4" /> Projekt indítása</Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <WonDialog
        open={wonOpen}
        onOpenChange={setWonOpen}
        busy={updateLead.isPending}
        onConfirm={() => updateLead.mutate({ status: "won" }, { onSuccess: () => setWonOpen(false) })}
      />
      <LostDialog
        open={lostOpen}
        onOpenChange={setLostOpen}
        busy={updateLead.isPending}
        onConfirm={(p) => updateLead.mutate({ status: "lost", ...p }, { onSuccess: () => setLostOpen(false) })}
      />
      <HandoffDialog
        open={handoffOpen}
        onOpenChange={setHandoffOpen}
        defaultTitle={lead.summary ? `Projekt — ${lead.summary}` : `Projekt — #${String(lead.id).slice(0, 8)}`}
        seed={{
          contact_name: contactLabel(lead.contact_id) !== "—" ? contactLabel(lead.contact_id) : "",
        }}
        onConfirm={async ({ title, payload }) => {
          const { error } = await supabase.from("projects").insert({
            lead_id: id,
            title,
            status: "planned",
            handoff_payload: payload,
          });
          if (error) { toast.error(error.message); return; }
          toast.success("Projekt létrehozva");
          setHandoffOpen(false);
          invalidate();
        }}
      />
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

function KeyFact({
  icon: Icon,
  label,
  value,
  muted,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <div className="rounded-md border bg-muted/30 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className={`mt-0.5 text-sm font-medium ${muted ? "italic text-muted-foreground" : ""}`}>{value}</div>
    </div>
  );
}

function QuotesTab({
  leadId,
  status,
  quotes,
  onChanged,
}: {
  leadId: string;
  status: LeadStatus;
  quotes: any[];
  onChanged: () => void;
}) {
  const editable = QUOTE_EDITABLE_STATUSES.includes(status);
  const [busy, setBusy] = useState(false);

  const setCurrent = async (quoteId: string) => {
    setBusy(true);
    try {
      // előbb az összes többit lekapcsoljuk, hogy a unique index ne ütközzön
      const off = await supabase.from("quotes").update({ is_current: false }).eq("lead_id", leadId).neq("id", quoteId);
      if (off.error) throw off.error;
      const on = await supabase.from("quotes").update({ is_current: true }).eq("id", quoteId);
      if (on.error) throw on.error;
      toast.success("Aktuális verzió frissítve");
      onChanged();
    } catch (e: any) {
      toast.error(e.message ?? "Hiba");
    } finally { setBusy(false); }
  };

  const createVersion = async () => {
    setBusy(true);
    try {
      const maxV = quotes.reduce((m, q) => Math.max(m, q.version ?? 0), 0);
      const off = await supabase.from("quotes").update({ is_current: false }).eq("lead_id", leadId);
      if (off.error) throw off.error;
      const ins = await supabase.from("quotes").insert({ lead_id: leadId, version: maxV + 1, is_current: true });
      if (ins.error) throw ins.error;
      toast.success(`v${maxV + 1} létrehozva`);
      onChanged();
    } catch (e: any) {
      toast.error(e.message ?? "Hiba");
    } finally { setBusy(false); }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-sm">Ajánlat verziók</CardTitle>
        <Button size="sm" variant="outline" disabled={!editable || busy} onClick={createVersion}>
          <Plus className="mr-1 h-4 w-4" /> Új verzió
        </Button>
      </CardHeader>
      <CardContent>
        {!editable && (
          <p className="mb-2 text-xs text-muted-foreground">
            Új verzió csak ajánlat-fázisú lead esetén készíthető (quote_prep / quote_sent / follow_up / contract).
          </p>
        )}
        {quotes.length === 0 ? (
          <EmptyState icon={FileText} title="Még nincs ajánlat ehhez a leadhez" />
        ) : (
          <ul className="space-y-1.5 text-sm">
            {quotes.map((qu: any) => (
              <li key={qu.id} className="flex items-center justify-between border-b py-1.5 last:border-0">
                <span className="flex items-center gap-2">
                  <Badge variant="outline">v{qu.version}</Badge>
                  {qu.is_current && <Badge>aktuális</Badge>}
                  <Link to="/quotes/$id" params={{ id: qu.id }} className="text-primary hover:underline">megnyitás</Link>
                </span>
                <span className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{fmtDate(qu.created_at)}</span>
                  {!qu.is_current && (
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => setCurrent(qu.id)}>
                      <Check className="mr-1 h-3.5 w-3.5" /> Aktuálissá tesz
                    </Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function HandoffReport({ projects }: { projects: any[] }) {
  return (
    <ul className="space-y-3 text-sm">
      {projects.map((p) => {
        const payload = (p.handoff_payload ?? {}) as Partial<HandoffPayload>;
        return (
          <li key={p.id} className="rounded-md border p-3">
            <div className="flex items-center justify-between">
              <Link to="/projects/$id" params={{ id: p.id }} className="font-medium text-primary hover:underline">{p.title}</Link>
              <Badge variant="outline">{p.status}</Badge>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Átadva: {p.handoff_at ? fmtDateTime(p.handoff_at) : "—"}
            </div>
            {Object.keys(payload).length > 0 && (
              <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 text-xs md:grid-cols-2">
                <PayloadRow label="Kapcsolattartó" value={payload.contact_name} />
                <PayloadRow label="Telefon" value={payload.contact_phone} />
                <PayloadRow label="Email" value={payload.contact_email} />
                <PayloadRow label="Cím" value={payload.site_address} />
                <PayloadRow label="Dokumentum" value={payload.doc_url} link />
                <PayloadRow label="Kezdés" value={payload.start_date} />
                {payload.note && <div className="md:col-span-2"><span className="text-muted-foreground">Megjegyzés: </span>{payload.note}</div>}
              </dl>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function PayloadRow({ label, value, link }: { label: string; value?: string; link?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex gap-1">
      <span className="text-muted-foreground">{label}:</span>
      {link ? <a href={value} target="_blank" rel="noreferrer" className="truncate text-primary hover:underline">{value}</a> : <span className="truncate">{value}</span>}
    </div>
  );
}