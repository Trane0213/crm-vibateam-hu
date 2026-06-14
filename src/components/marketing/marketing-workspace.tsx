import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Building2, Mail, UserPlus, StickyNote, History, FolderOpen,
  Send, ArrowRightCircle, Globe, Phone, Calendar, CheckCircle2,
  AlertCircle, Sparkles, MoreHorizontal,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EmptyState } from "@/components/page-header";
import { supabase } from "@/integrations/supabase/client";
import { humanizeSupabaseError } from "@/lib/db-hooks";
import { fmtDate, fmtDateTime } from "@/components/resource/resource-page";
import { CompanyDocumentManager } from "@/components/documents/company-document-manager";
import { EmailComposer } from "@/components/emails/email-composer";
import { logActivity } from "@/lib/activity-log";
import { COMPANY_TYPE_LABEL } from "@/lib/viba-constants";
import { normalizeRole } from "@/lib/permissions";
import {
  MARKETING_STATUS_LABEL, MARKETING_STATUS_TONE,
  readMarketingMeta, stripMarkers, withMarketingStatus, withSalesNote,
  type MarketingStatus,
} from "@/lib/marketing-status";
import { computeChecklist, computeNextStep, type StepActionKind } from "@/lib/marketing-workflow";
import { NextBestAction } from "@/components/marketing/next-best-action";
import { WorkflowChecklist } from "@/components/marketing/workflow-checklist";
import { buildTimeline, type TimelineEvent } from "@/lib/marketing-timeline";

/**
 * Marketing Minősítő Munkafelület — `/customers/$id` marketing role-ban.
 *
 * NINCS séma-módosítás. Minden marketing állapot a meglévő
 * `companies.notes` mezőben tárolódik fenced markerekkel
 * (`src/lib/marketing-status.ts`). A "Saleshez átadás" gomb a
 * meglévő `leads` táblába szúr egy sort és átállítja a state-et
 * `handoff`-ra — innentől a sales látja a leadet a saját pipeline-jában.
 */
export function MarketingWorkspace({ companyId }: { companyId: string }) {
  const qc = useQueryClient();
  const [composer, setComposer] = useState<{ to: string; subject: string; contactId?: string } | null>(null);
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<any | null>(null);
  const [tab, setTab] = useState<string>("overview");

  const cust = useQuery({
    queryKey: ["customers", "detail", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("*").eq("id", companyId).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const contacts = useQuery({
    queryKey: ["contacts", "by_company", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("contacts").select("*").eq("company_id", companyId).order("name");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const emails = useQuery({
    queryKey: ["emails", "by_company", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("emails")
        .select("id,thread_id,subject,from_email,to_email,internal_date,created_at,is_outbound")
        .eq("company_id", companyId)
        .order("internal_date", { ascending: false, nullsFirst: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const docs = useQuery({
    queryKey: ["company_documents", "list", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_documents" as any)
        .select("id,name,created_at")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const salesUsers = useQuery({
    queryKey: ["users_profile", "sales-handoff-options"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users_profile")
        .select("id,full_name,email,roles(name)");
      if (error) throw error;
      return ((data ?? []) as any[]).filter((row) => normalizeRole(row.roles?.name) === "sales");
    },
  });

  const docsCount = useQuery({
    queryKey: ["company_documents", "count", companyId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("company_documents" as any)
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const meta = useMemo(() => readMarketingMeta(cust.data?.notes ?? null), [cust.data?.notes]);
  const visibleNotes = useMemo(() => stripMarkers(cust.data?.notes ?? null), [cust.data?.notes]);

  const setStatus = useMutation({
    mutationFn: async (status: MarketingStatus) => {
      const next = withMarketingStatus(cust.data?.notes ?? null, status);
      const { error } = await supabase.from("companies").update({ notes: next }).eq("id", companyId);
      if (error) throw error;
    },
    onSuccess: (_d, status) => {
      toast.success(`Státusz: ${MARKETING_STATUS_LABEL[status]}`);
      qc.invalidateQueries({ queryKey: ["customers", "detail", companyId] });
    },
    onError: (e: any) => toast.error("Státusz mentése sikertelen", { description: humanizeSupabaseError(e) }),
  });

  const saveSalesNote = useMutation({
    mutationFn: async (text: string) => {
      const next = withSalesNote(cust.data?.notes ?? null, text);
      const { error } = await supabase.from("companies").update({ notes: next }).eq("id", companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Salesnek szánt jegyzet mentve");
      qc.invalidateQueries({ queryKey: ["customers", "detail", companyId] });
    },
    onError: (e: any) => toast.error("Mentés sikertelen", { description: humanizeSupabaseError(e) }),
  });

  const saveContact = useMutation({
    mutationFn: async (input: { id?: string; name: string; email: string; phone: string; position: string }) => {
      const payload: any = {
        name: input.name.trim(),
        email: input.email.trim() || null,
        phone: input.phone.trim() || null,
        position: input.position.trim() || null,
      };
      if (input.id) {
        const { error } = await supabase.from("contacts").update(payload).eq("id", input.id);
        if (error) throw error;
        return input.id;
      }
      const { data, error } = await supabase
        .from("contacts")
        .insert({ ...payload, company_id: companyId })
        .select("id")
        .single();
      if (error) throw error;
      return (data as any).id as string;
    },
    onSuccess: () => {
      toast.success(editingContact ? "Kapcsolattartó frissítve" : "Kapcsolattartó létrehozva");
      setContactDialogOpen(false);
      setEditingContact(null);
      qc.invalidateQueries({ queryKey: ["contacts", "by_company", companyId] });
      qc.invalidateQueries({ queryKey: ["customers", "detail", companyId] });
    },
    onError: (e: any) => toast.error("Kapcsolattartó mentése sikertelen", { description: humanizeSupabaseError(e) }),
  });

  const handoff = useMutation({
    mutationFn: async (input: { summary: string; project_type: string | null; contact_id: string | null }) => {
      const payload: any = {
        company_id: companyId,
        contact_id: input.contact_id,
        summary: input.summary,
        source: "marketing_handoff",
        project_type: input.project_type,
        status: "new",
      };
      const { data, error } = await supabase.from("leads").insert(payload).select("id").single();
      if (error) throw error;
      const leadId = (data as any).id as string;
      const nextNotes = withMarketingStatus(cust.data?.notes ?? null, "handoff", leadId);
      const { error: e2 } = await supabase.from("companies").update({ notes: nextNotes }).eq("id", companyId);
      if (e2) throw e2;
      return leadId;
    },
    onSuccess: () => {
      toast.success("Sikeresen átadva a salesnek", { description: "A lead megjelent a sales pipeline-ban." });
      qc.invalidateQueries({ queryKey: ["customers", "detail", companyId] });
      setHandoffOpen(false);
    },
    onError: (e: any) => toast.error("Átadás sikertelen", { description: humanizeSupabaseError(e) }),
  });

  if (cust.isLoading) return <div className="p-6 text-sm text-muted-foreground">Cég betöltése…</div>;
  if (cust.error || !cust.data) {
    return <div className="p-6"><EmptyState icon={Building2} title="Cég nem található" description={(cust.error as any)?.message} /></div>;
  }

  const c = cust.data;
  const primary = (contacts.data ?? [])[0] ?? null;
  // EGYSÉGES mérőszám és lista forrás: a cég-szintű emailek (`emails` tábla
  // `company_id = X`). A szálak ebből derivált csoportosítások — sosem külön
  // forrás. Ez biztosítja, hogy a KPI, a tab badge és a tab tartalma mindig
  // ugyanazt mutassa.
  const emailRows = emails.data ?? [];
  const emailCount = emailRows.length;
  const lastEmail = emailRows[0]?.internal_date ?? emailRows[0]?.created_at ?? null;
  const derivedThreads = useMemo(() => {
    const byThread = new Map<string, {
      id: string; subject: string | null;
      last_message_at: string | null; count: number;
      participants: string[];
    }>();
    for (const e of emailRows as any[]) {
      const key = e.thread_id ?? e.id;
      const at = e.internal_date ?? e.created_at;
      const cur = byThread.get(key) ?? {
        id: key, subject: e.subject ?? null, last_message_at: at,
        count: 0, participants: [] as string[],
      };
      cur.count++;
      if (!cur.subject && e.subject) cur.subject = e.subject;
      if (!cur.last_message_at || (at && at > cur.last_message_at)) cur.last_message_at = at;
      for (const a of [e.from_email, e.to_email].filter(Boolean) as string[]) {
        if (!cur.participants.includes(a)) cur.participants.push(a);
      }
      byThread.set(key, cur);
    }
    return Array.from(byThread.values()).sort((a, b) =>
      (b.last_message_at ?? "").localeCompare(a.last_message_at ?? ""),
    );
  }, [emailRows]);
  const threadCount = derivedThreads.length;
  const isHandoff = meta.status === "handoff";

  const wfInput = {
    company: { name: c.name, created_at: c.created_at },
    contacts: (contacts.data ?? []) as any[],
    threadCount,
    meta,
  };

  const timeline = buildTimeline({
    company: { name: c.name, created_at: c.created_at },
    contacts: (contacts.data ?? []) as any[],
    emails: emailRows as any[],
    docs: (docs.data ?? []) as any[],
    meta,
  }, c.notes ?? null);
  const step = computeNextStep(wfInput);
  const checklist = computeChecklist(wfInput);

  const handleAction = (action: StepActionKind, targetTab?: string) => {
    if (targetTab) setTab(targetTab);
    switch (action) {
      case "add-contact":
        setTab("contacts");
        setEditingContact(null);
        setContactDialogOpen(true);
        return;
      case "edit-contact":
        setTab("contacts");
        setEditingContact(primary ?? (contacts.data ?? [])[0] ?? null);
        setContactDialogOpen(true);
        return;
      case "send-email":
        if (primary?.email) setComposer({ to: primary.email, subject: `${c.name} — `, contactId: primary.id });
        else {
          setTab("contacts");
          setEditingContact(primary ?? null);
          setContactDialogOpen(true);
        }
        return;
      case "open-emails":
        setTab("emails");
        return;
      case "mark-contacted":
        setStatus.mutate("contacted");
        return;
      case "write-sales-note":
        setTab("sales-note");
        return;
      case "open-handoff":
        setHandoffOpen(true);
        return;
      case "open-lead":
      case "none":
      default:
        return;
    }
  };

  return (
    <div className="flex flex-col">
      {/* ───── Fejléc ───── */}
      <div className="border-b bg-background px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Marketing minősítés
            </div>
            <h1 className="mt-1 flex flex-wrap items-center gap-2 text-xl font-semibold">
              <Building2 className="h-5 w-5 text-muted-foreground" />
              <span className="truncate">{c.name}</span>
              <Badge variant="outline">{COMPANY_TYPE_LABEL[c.company_type] ?? "Cég"}</Badge>
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${MARKETING_STATUS_TONE[meta.status]}`}>
                {MARKETING_STATUS_LABEL[meta.status]}
                {meta.statusDate && <span className="ml-1 opacity-70">· {meta.statusDate}</span>}
              </span>
            </h1>
            <div className="mt-1 flex flex-wrap gap-3 text-sm text-muted-foreground">
              {primary?.email && <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{primary.email}</span>}
              {primary?.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{primary.phone}</span>}
              {c.website && (
                <a href={c.website.startsWith("http") ? c.website : `https://${c.website}`} target="_blank" rel="noreferrer"
                   className="inline-flex items-center gap-1 text-primary hover:underline">
                  <Globe className="h-3 w-3" />{c.website}
                </a>
              )}
            </div>
          </div>

          {/* Saleshez átadás + diszkrét státusz override */}
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => setHandoffOpen(true)}
              disabled={isHandoff || (contacts.data ?? []).length === 0 || step.id !== "ready-handoff"}
              title={
                isHandoff
                  ? "A cég már átadva"
                  : step.id !== "ready-handoff"
                    ? 'Nézd meg a „Következő lépés" kártyát — még hiányoznak feltételek'
                    : "Lead létrehozása és átadás a sales pipeline-nak"
              }
            >
              <ArrowRightCircle className="mr-1 h-4 w-4" />
              Saleshez átadás
            </Button>

            {!isHandoff && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" className="h-8 w-8 p-0" title="Státusz felülírása">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                    Státusz felülírása (haladó)
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {(["new", "contacted", "qualified"] as const).map((s) => (
                    <DropdownMenuItem
                      key={s}
                      disabled={setStatus.isPending || meta.status === s}
                      onClick={() => setStatus.mutate(s)}
                    >
                      {meta.status === s && <CheckCircle2 className="mr-2 h-3.5 w-3.5" />}
                      {meta.status !== s && <span className="mr-2 inline-block h-3.5 w-3.5" />}
                      {MARKETING_STATUS_LABEL[s]}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        {/* Workflow vezérlés: Next Best Action + checklist */}
        <div className="mt-4 grid gap-3 lg:grid-cols-[1.4fr_1fr]">
          <NextBestAction
            step={step}
            handoffLeadId={meta.handoffLeadId}
            pending={setStatus.isPending || handoff.isPending}
            onAction={handleAction}
          />
          <WorkflowChecklist items={checklist} onAction={handleAction} />
        </div>

        {/* Kompakt KPI csík — informatív, nem akciógomb */}
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Mini label="Kapcsolattartók" value={String(contacts.data?.length ?? 0)} icon={UserPlus} />
          <Mini label="Email aktivitás" value={String(emailCount)} icon={Mail}
                hint={lastEmail ? `utolsó: ${fmtDate(lastEmail)} · ${threadCount} szál` : "nincs üzenet"} />
          <Mini label="Dokumentumok" value={String(docsCount.data ?? 0)} icon={FolderOpen} />
          <Mini label="Felvéve" value={fmtDate(c.created_at)} icon={Calendar} />
        </div>
      </div>

      {/* ───── Tartalom ───── */}
      <div className="p-6">
        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="flex flex-wrap h-auto">
            <TabsTrigger value="overview"><Sparkles className="mr-1.5 h-3.5 w-3.5" />Áttekintés</TabsTrigger>
            <TabsTrigger value="contacts"><UserPlus className="mr-1.5 h-3.5 w-3.5" />Kapcsolattartók ({contacts.data?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="emails"><Mail className="mr-1.5 h-3.5 w-3.5" />Email aktivitás ({emailCount})</TabsTrigger>
            <TabsTrigger value="docs"><FolderOpen className="mr-1.5 h-3.5 w-3.5" />Dokumentumok ({docsCount.data ?? 0})</TabsTrigger>
            <TabsTrigger value="sales-note">
              <StickyNote className="mr-1.5 h-3.5 w-3.5" />
              Jegyzet salesnek
              {meta.salesNote && <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-primary" />}
            </TabsTrigger>
            <TabsTrigger value="timeline"><History className="mr-1.5 h-3.5 w-3.5" />Idővonal</TabsTrigger>
          </TabsList>

          {/* Áttekintés */}
          <TabsContent value="overview" className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-sm">Cég adatok</CardTitle></CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                <Row label="Cégnév" value={c.name} />
                <Row label="Típus" value={COMPANY_TYPE_LABEL[c.company_type] ?? "—"} />
                {c.tax_number && <Row label="Adószám" value={c.tax_number} />}
                {c.website && <Row label="Web" value={c.website} />}
                <Row label="Létrejött" value={fmtDate(c.created_at)} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  Elsődleges kapcsolattartó
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                {primary ? (
                  <>
                    <Row label="Név" value={primary.name ?? "—"} />
                    {primary.position && <Row label="Beosztás" value={primary.position} />}
                    <Row label="E-mail" value={primary.email ?? "—"} />
                    <Row label="Telefon" value={primary.phone ?? "—"} />
                    {primary.email && (
                      <div className="pt-2">
                        <Button size="sm" variant="outline" onClick={() => setComposer({ to: primary.email!, subject: `${c.name} — `, contactId: primary.id })}>
                          <Send className="mr-1 h-3.5 w-3.5" />Email küldése
                        </Button>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Nincs kapcsolattartó. A „Kapcsolattartók" fülön vegyél fel egyet, mielőtt átadnád a salesnek.
                  </p>
                )}
              </CardContent>
            </Card>

            {visibleNotes && (
              <Card className="lg:col-span-2">
                <CardHeader><CardTitle className="text-sm">Megjegyzés / forrás</CardTitle></CardHeader>
                <CardContent className="whitespace-pre-wrap text-sm">{visibleNotes}</CardContent>
              </Card>
            )}

            {meta.salesNote && (
              <Card className="lg:col-span-2 border-primary/40 bg-primary/5">
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <StickyNote className="h-4 w-4" /> Salesnek szánt jegyzet (vázlat)
                  </CardTitle>
                </CardHeader>
                <CardContent className="whitespace-pre-wrap text-sm">{meta.salesNote}</CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Kapcsolattartók */}
          <TabsContent value="contacts" className="mt-4">
            <ContactsTable
              rows={contacts.data ?? []}
              onAdd={() => {
                setEditingContact(null);
                setContactDialogOpen(true);
              }}
              onEdit={(contact: any) => {
                setEditingContact(contact);
                setContactDialogOpen(true);
              }}
              onEmail={(c2) => c2.email && setComposer({ to: c2.email, subject: "", contactId: c2.id })}
            />
          </TabsContent>

          {/* Email aktivitás */}
          <TabsContent value="emails" className="mt-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                A céghez rendelt email szálak. Az új üzeneteket az
                <Link to="/emails" className="mx-1 text-primary hover:underline">Emailek</Link>
                oldalon vagy az alábbi gombbal indíthatod.
              </p>
              {primary?.email && (
                <Button size="sm" variant="outline" onClick={() => setComposer({ to: primary.email!, subject: `${c.name} — `, contactId: primary.id })}>
                  <Send className="mr-1 h-3.5 w-3.5" />Új email
                </Button>
              )}
            </div>
            {emailCount === 0 ? (
              <EmptyState icon={Mail} title="Nincs email aktivitás"
                description="Küldj egy emailt valamelyik kapcsolattartónak — a szál automatikusan ide kerül." />
            ) : (
              <div className="rounded-md border bg-card overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">Tárgy</th>
                      <th className="px-3 py-2 text-left">Résztvevők</th>
                      <th className="px-3 py-2 text-center">Üzenet</th>
                      <th className="px-3 py-2 text-left whitespace-nowrap">Utolsó</th>
                    </tr>
                  </thead>
                  <tbody>
                    {derivedThreads.map((t) => (
                      <tr key={t.id} className="border-t hover:bg-muted/30">
                        <td className="px-3 py-2">
                          <Link to="/emails/$threadId" params={{ threadId: t.id }} className="text-primary hover:underline">
                            {t.subject ?? "(nincs tárgy)"}
                          </Link>
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {(t.participants ?? []).slice(0, 3).join(", ") || "—"}
                          {(t.participants ?? []).length > 3 && ` +${(t.participants ?? []).length - 3}`}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground text-center tabular-nums">{t.count}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">{fmtDateTime(t.last_message_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>

          {/* Dokumentumok — cég-szintű */}
          <TabsContent value="docs" className="mt-4">
            <CompanyDocumentManager companyId={companyId} />
          </TabsContent>

          {/* Salesnek szánt jegyzet */}
          <TabsContent value="sales-note" className="mt-4">
            <SalesNoteEditor
              initial={meta.salesNote}
              saving={saveSalesNote.isPending}
              onSave={(t) => saveSalesNote.mutate(t)}
              isHandoff={isHandoff}
              handoffLeadId={meta.handoffLeadId}
            />
          </TabsContent>

          {/* Idővonal — egyszerűsített marketing nézet */}
          <TabsContent value="timeline" className="mt-4">
            <SimpleTimeline events={timeline} />
          </TabsContent>
        </Tabs>
      </div>

      <EmailComposer
        open={!!composer}
        onOpenChange={(v) => { if (!v) setComposer(null); }}
        defaultTo={composer?.to ?? ""}
        defaultSubject={composer?.subject ?? ""}
        companyId={companyId}
        contactId={composer?.contactId}
        onSent={() => {
          qc.invalidateQueries({ queryKey: ["email_threads", "by_company", companyId] });
          qc.invalidateQueries({ queryKey: ["customers", "detail", companyId] });
          setTab("emails");
          setComposer(null);
        }}
      />

      <ContactDialog
        open={contactDialogOpen}
        onOpenChange={(open: boolean) => {
          setContactDialogOpen(open);
          if (!open) setEditingContact(null);
        }}
        initial={editingContact}
        saving={saveContact.isPending}
        onSave={(data: { id?: string; name: string; email: string; phone: string; position: string }) => saveContact.mutate(data)}
      />

      <HandoffDialog
        open={handoffOpen}
        onOpenChange={setHandoffOpen}
        companyName={c.name}
        contacts={contacts.data ?? []}
        defaultSummary={meta.salesNote || `${c.name} – marketing által átadva`}
        submitting={handoff.isPending}
        onSubmit={(d) => handoff.mutate(d)}
      />
    </div>
  );
}

/* ───────── helpers ───────── */

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right truncate">{value}</span>
    </div>
  );
}

function Mini({ label, value, hint, icon: Icon }: { label: string; value: string; hint?: string; icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="rounded-md border bg-card px-3 py-2">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </div>
      <div className="mt-0.5 text-base font-semibold tabular-nums">{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function ContactsTable({
  rows,
  onAdd,
  onEdit,
  onEmail,
}: {
  rows: any[];
  onAdd: () => void;
  onEdit: (c: any) => void;
  onEmail: (c: any) => void;
}) {
  if (rows.length === 0) return (
    <EmptyState
      icon={UserPlus}
      title="Nincs kapcsolattartó"
      description="Vegyél fel legalább egy kapcsolattartót, hogy emailt küldhess és végigvihesd az átadási folyamatot."
      action={<Button size="sm" onClick={onAdd}><UserPlus className="mr-1.5 h-4 w-4" />Kapcsolattartó hozzáadása</Button>}
    />
  );
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={onAdd}><UserPlus className="mr-1.5 h-4 w-4" />Kapcsolattartó hozzáadása</Button>
      </div>
      <div className="rounded-md border bg-card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left">Név</th>
            <th className="px-3 py-2 text-left">Beosztás</th>
            <th className="px-3 py-2 text-left">E-mail</th>
            <th className="px-3 py-2 text-left">Telefon</th>
            <th className="px-3 py-2 text-right">Művelet</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id} className="border-t hover:bg-muted/30">
              <td className="px-3 py-2">
                <Link to="/contacts/$id" params={{ id: c.id }} className="text-primary hover:underline">{c.name ?? "—"}</Link>
              </td>
              <td className="px-3 py-2">{c.position ?? "—"}</td>
              <td className="px-3 py-2">{c.email ?? "—"}</td>
              <td className="px-3 py-2">{c.phone ?? "—"}</td>
              <td className="px-3 py-2 text-right">
                <div className="flex items-center justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={() => onEdit(c)}>Szerkesztés</Button>
                  {c.email && (
                    <Button size="sm" variant="outline" onClick={() => onEmail(c)}>
                      <Send className="mr-1 h-3.5 w-3.5" />Email
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}

function ContactDialog({
  open,
  onOpenChange,
  initial,
  saving,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: any | null;
  saving: boolean;
  onSave: (data: { id?: string; name: string; email: string; phone: string; position: string }) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [position, setPosition] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? "");
    setEmail(initial?.email ?? "");
    setPhone(initial?.phone ?? "");
    setPosition(initial?.position ?? "");
  }, [open, initial]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{initial?.id ? "Kapcsolattartó szerkesztése" : "Kapcsolattartó hozzáadása"}</DialogTitle>
          <DialogDescription>
            A marketing workflow innen megszakítás nélkül továbbvihető emailre és átadásra.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-2">
            <Label htmlFor="contact-name">Név *</Label>
            <Input id="contact-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="contact-email">E-mail</Label>
            <Input id="contact-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="contact-phone">Telefon</Label>
              <Input id="contact-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="contact-position">Beosztás</Label>
              <Input id="contact-position" value={position} onChange={(e) => setPosition(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Mégse</Button>
          <Button
            onClick={() => onSave({ id: initial?.id, name, email, phone, position })}
            disabled={saving || !name.trim()}
          >
            {saving ? "Mentés…" : "Mentés"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SalesNoteEditor({
  initial, saving, onSave, isHandoff, handoffLeadId,
}: {
  initial: string;
  saving: boolean;
  onSave: (text: string) => void;
  isHandoff: boolean;
  handoffLeadId: string | null;
}) {
  const [value, setValue] = useState(initial);
  const dirty = value !== initial;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <StickyNote className="h-4 w-4" />
          Salesnek szánt jegyzet
          <span className="ml-auto text-xs font-normal text-muted-foreground">
            ez a szöveg lesz az átadás idő pontján a Lead összefoglalója
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {isHandoff && handoffLeadId && (
          <div className="rounded-md border border-[color:var(--status-success)]/40 bg-[color:var(--status-success)]/5 px-3 py-2 text-xs text-[color:var(--status-success)]">
            Ez a cég már át lett adva. A létrejött lead:{" "}
            <Link to="/leads/$id" params={{ id: handoffLeadId }} className="font-mono underline">
              #{handoffLeadId.slice(0, 8)}
            </Link>{" "}
            (a sales pipeline-ban dolgoznak rajta).
          </div>
        )}
        <Textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Mit kell tudni a salesnek? Pl. milyen projektre keresnek partnert, mikor érdemes felhívni, korábbi beszélgetések, döntéshozó neve…"
          rows={14}
          className="text-sm"
        />
        <div className="flex justify-end gap-2">
          {dirty && <Button variant="ghost" size="sm" onClick={() => setValue(initial)}>Mégse</Button>}
          <Button size="sm" disabled={!dirty || saving} onClick={() => onSave(value)}>
            {saving ? "Mentés…" : "Mentés"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function SimpleTimeline({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) return <EmptyState icon={History} title="Nincs esemény" />;
  const iconFor = (k: TimelineEvent["kind"]) => {
    switch (k) {
      case "company_created": return Sparkles;
      case "contact_added":   return UserPlus;
      case "email_sent":      return Send;
      case "email_received":  return Mail;
      case "doc_uploaded":    return FolderOpen;
      case "handoff":         return ArrowRightCircle;
      case "status_change":   return AlertCircle;
      default:                return History;
    }
  };
  const toneFor = (k: TimelineEvent["kind"]) => {
    if (k === "handoff") return "text-[color:var(--status-success)]";
    if (k === "status_change") return "text-primary";
    if (k === "company_created") return "text-[color:var(--status-info)]";
    return "text-muted-foreground";
  };
  return (
    <ol className="space-y-2">
      {events.map((e, i) => {
        const Icon = iconFor(e.kind);
        return (
          <li key={i} className="flex items-start gap-3 rounded-md border bg-card p-3 text-sm">
            <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${toneFor(e.kind)}`} />
            <div className="min-w-0 flex-1">
              <div className="truncate">
                {e.label}
                {e.detail && <span className="ml-2 text-muted-foreground">— {e.detail}</span>}
              </div>
              <div className="text-[11px] text-muted-foreground">{fmtDateTime(e.at)}</div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function HandoffDialog({
  open, onOpenChange, companyName, contacts, defaultSummary, submitting, onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  companyName: string;
  contacts: any[];
  defaultSummary: string;
  submitting: boolean;
  onSubmit: (d: { summary: string; project_type: string | null; contact_id: string | null }) => void;
}) {
  const [summary, setSummary] = useState(defaultSummary);
  const [projectType, setProjectType] = useState<string>("");
  const [contactId, setContactId] = useState<string>(contacts[0]?.id ?? "");
  // Minden megnyitáskor szinkronizáljuk a defaultokat (sales note vagy első kontakt).
  useEffect(() => {
    if (!open) return;
    setSummary(defaultSummary);
    setProjectType("");
    setContactId(contacts[0]?.id ?? "");
  }, [open, defaultSummary, contacts]);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <ArrowRightCircle className="h-5 w-5 text-[color:var(--status-success)]" />
            Saleshez átadás — {companyName}
          </AlertDialogTitle>
          <AlertDialogDescription>
            Ez létrehoz egy <strong>új leadet</strong> ehhez a céghez, és a marketing státuszt
            „Átadva sales-nek" állapotra állítja. A sales pipeline-ban innentől látható.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Lead összefoglaló</label>
            <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={4} className="mt-1" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Projekt típus (opcionális)</label>
              <Input value={projectType} onChange={(e) => setProjectType(e.target.value)} placeholder="pl. lakásfelújítás"
                     className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Kapcsolattartó</label>
              <Select value={contactId} onValueChange={setContactId}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Válassz kontaktot" /></SelectTrigger>
                <SelectContent>
                  {contacts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name ?? c.email ?? c.id.slice(0, 8)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>Mégse</AlertDialogCancel>
          <AlertDialogAction
            disabled={submitting || !summary.trim()}
            onClick={(e) => {
              e.preventDefault();
              onSubmit({
                summary: summary.trim(),
                project_type: projectType.trim() || null,
                contact_id: contactId || null,
              });
            }}
          >
            {submitting ? "Átadás…" : "Lead létrehozása és átadás"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}