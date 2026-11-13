import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/sales/status-chip";
import { LeadStatusStepper } from "@/components/sales/lead-status-stepper";
import { LeadActionBar } from "@/components/sales/lead-action-bar";
import { NextStepEditor } from "@/components/sales/next-step-editor";
import { LostDialog } from "@/components/sales/lost-dialog";
import { PipelineActivityLog } from "./pipeline-activity-log";
import { CreateProjectDialog } from "./create-project-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { humanizeSupabaseError } from "@/lib/db-hooks";
import { updateLeadOrThrow } from "@/lib/sales/lead-update";
import { logActivity } from "@/lib/activity-log";
import { ExternalLink, Building2, Mail, User, Calendar, FileText, Plus, Trophy, ArrowRight, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { quoteStatusLabel } from "@/lib/quotes/quote-status";
import { leadNextAction, contractReadiness, currentQuotes, ESIGN_AVAILABLE } from "@/lib/sales/sales-flow";
import { LEAD_STATUS_LABEL } from "@/lib/sales/constants";
import { PrimaryActionCard, ReadinessList } from "@/components/sales/sales-flow-ui";
import { createDraftQuote } from "@/lib/quotes/create";
import type { LeadStatus } from "@/lib/sales/constants";
import { statusToLostStage } from "@/lib/sales/constants";
import type { PipelineLead } from "./pipeline-types";
import { QuoteWorkflowChoice } from "@/components/quotes/quote-workflow-choice";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { QuoteWorkflow } from "@/lib/quotes/workflow";

/**
 * A Pipeline kártya megnyitása utáni 3 oszlopos részletnézet.
 *  - Bal: alapadatok, cég, felelős, stepper.
 *  - Közép: next step szerkesztő.
 *  - Jobb: műveletek (státusz, Won/Lost) + aktivitásnapló.
 *
 * NEM végezhető itt: lead átkiosztás (Workspace feladat), ajánlat-szerkesztés
 * (külön quote modul), projekt-mezők szerkesztése (csak létrehozás Won után).
 */
export function PipelineDetailSheet({
  lead,
  open,
  onOpenChange,
}: {
  lead: PipelineLead | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [lostOpen, setLostOpen] = useState(false);
  const [projOpen, setProjOpen] = useState(false);
  const [quoteChoiceOpen, setQuoteChoiceOpen] = useState(false);
  const navigate = useNavigate();
  // Az ügy aktuális ajánlatverziói (RLS: can_access_quote) — duplikált
  // piszkozat helyett a meglévő ajánlatot ajánljuk fel.
  const leadQuotes = useQuery({
    queryKey: ["quotes", "by-lead", lead?.id],
    enabled: open && !!lead?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select("id,title,status,sent_at,is_current,version,alternative_key,manual_net_amount")
        .eq("lead_id", lead!.id)
        .eq("is_current", true)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });
  const quotes = currentQuotes(leadQuotes.data ?? []);
  const accepted = quotes.find((q) => q.status === "accepted") ?? null;
  const termsDoc = useQuery({
    queryKey: ["quote_documents", "contract_terms", accepted?.id],
    enabled: open && !!accepted?.id,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("quote_documents" as any)
        .select("id", { count: "exact", head: true })
        .eq("quote_id", accepted!.id)
        .eq("document_type", "contract_terms");
      if (error) throw error;
      return count ?? 0;
    },
  });
  const newQuote = useMutation({
    mutationFn: async (kind: QuoteWorkflow) => {
      if (!lead) throw new Error("Nincs lead.");
      const id = await createDraftQuote({ leadId: lead.id });
      const result = await supabase.from("quotes").update({ quote_kind: kind }).eq("id", id).select("id");
      if (result.error || result.data?.length !== 1) toast.error("A piszkozat elkészült; az ajánlattípust az adatlapon kell megadni.");
      await logActivity("quotes", "create", String(id), { lead_id: lead.id });
      return id;
    },
    onError: (e: any) =>
      toast.error("Nem sikerült létrehozni", { description: humanizeSupabaseError(e) }),
    onSuccess: (id) => {
      setQuoteChoiceOpen(false);
      qc.invalidateQueries({ queryKey: ["quotes"] });
      navigate({ to: "/quotes/$id", params: { id } });
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["pipeline"] });
    qc.invalidateQueries({ queryKey: ["pipeline", "activity", lead?.id] });
    // A Ma oldal és a Workspace lista a ["leads", ...] cache-eken él — won/lost
    // után ezek a számlálók is változnak, ezért közösen invalidáljuk.
    qc.invalidateQueries({ queryKey: ["leads"] });
  };

  const statusMut = useMutation({
    mutationFn: async (next: LeadStatus) => {
      if (!lead) throw new Error("Nincs lead.");
      const from = lead.status;
      await updateLeadOrThrow(lead.id, { status: next });
      await logActivity("leads", "status_change", lead.id, { from, to: next });
    },
    onError: (e: any) => toast.error("Státuszváltás sikertelen", { description: humanizeSupabaseError(e) }),
    onSuccess: (_d, next) => { toast.success(`Az ügy átkerült: ${LEAD_STATUS_LABEL[next]}`); invalidate(); },
  });

  // A 2026-06-27 invariáns óta a won-átmenetet a backend trigger
  // elutasítja külön — a „Megnyertük" gomb közvetlenül a CreateProjectDialog-ot
  // nyitja, ami egyetlen RPC-vel atomian állítja won-ra a leadet ÉS hozza
  // létre a projektet. (Korábbi köztes WonDialog megerősítő törölve.)

  const lostMut = useMutation({
    mutationFn: async (p: { lost_reason: string; lost_note: string | null }) => {
      if (!lead) throw new Error("Nincs lead.");
      await updateLeadOrThrow(lead.id, {
          status: "lost",
          // lost_at-et az adatbázis trigger tölti ki.
          lost_reason: p.lost_reason,
          lost_note: p.lost_note,
          // 2026-06-27 invariáns: a lost_stage a tényleges aktuális
          // pipeline-státusz, hogy a reaktiváló 1:1 vissza tudja állítani.
          lost_stage: statusToLostStage(lead.status),
      });
      await logActivity("leads", "status_change", lead.id, { from: lead.status, to: "lost", reason: p.lost_reason });
    },
    onError: (e: any) => toast.error("Az Elveszett jelölés sikertelen", { description: humanizeSupabaseError(e) }),
    onSuccess: () => { toast.success("Az ügy elveszettként lezárva"); invalidate(); setLostOpen(false); onOpenChange(false); },
  });

  const nextStepMut = useMutation({
    mutationFn: async (p: { next_step_type: any; next_step_due_at: string | null; next_step_note: string | null }) => {
      if (!lead) throw new Error("Nincs lead.");
      await updateLeadOrThrow(lead.id, p);
      await logActivity("leads", "update", lead.id, { field: "next_step", ...p });
    },
    onError: (e: any) => toast.error("A következő lépés mentése sikertelen", { description: humanizeSupabaseError(e) }),
    onSuccess: () => { toast.success("Következő lépés mentve"); invalidate(); },
  });

  const next = lead ? leadNextAction(lead, quotes) : null;
  const contract = lead
    ? contractReadiness({
        leadStatus: lead.status,
        acceptedQuote: !!accepted,
        companyId: lead.company_id,
        contactId: lead.contact_id ?? null,
        net: (lead.quote_total && lead.quote_total > 0 ? lead.quote_total : null) ?? accepted?.manual_net_amount ?? null,
        contractTermsDoc: (termsDoc.data ?? 0) > 0,
      })
    : null;
  const busy = statusMut.isPending || lostMut.isPending || newQuote.isPending;
  const primaryButton = !next ? null
    : next.kind === "create_quote" ? <Button size="sm" disabled={busy || leadQuotes.isLoading} onClick={() => setQuoteChoiceOpen(true)}><FileText className="mr-1.5 h-3.5 w-3.5" />Ajánlat létrehozása</Button>
    : next.kind === "open_quote" && next.quoteId ? <Button size="sm" asChild><Link to="/quotes/$id" params={{ id: next.quoteId }}><FileText className="mr-1.5 h-3.5 w-3.5" />Ajánlat megnyitása</Link></Button>
    : next.kind === "change_status" && next.suggestStatus ? <Button size="sm" disabled={busy} onClick={() => statusMut.mutate(next.suggestStatus!)}><ArrowRight className="mr-1.5 h-3.5 w-3.5" />Áthelyezés: {LEAD_STATUS_LABEL[next.suggestStatus]}</Button>
    : next.kind === "win" ? <Button size="sm" disabled={busy} onClick={() => setProjOpen(true)}><Trophy className="mr-1.5 h-3.5 w-3.5" />Megnyertük → projektátadás</Button>
    : next.kind === "open_prep" ? <Button size="sm" asChild><Link to="/leads" search={{ lead: lead!.id }}>Sales-előkészítés megnyitása</Link></Button>
    : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full max-w-[1100px] overflow-y-auto p-0 sm:max-w-[1100px]">
        {!lead ? (
          <div className="p-6 text-sm text-muted-foreground">Nincs kiválasztott lead.</div>
        ) : (
          <>
            <SheetHeader className="border-b bg-card/40 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <SheetTitle className="flex items-center gap-2 text-base">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    {lead.company_name || lead.summary || "Lead"}
                  </SheetTitle>
                  <SheetDescription>
                    Ügy adatlap · {lead.assignee_name ? `felelős: ${lead.assignee_name}` : "felelős nincs megadva"}
                  </SheetDescription>
                </div>
                <StatusChip status={lead.status} />
              </div>
              <div className="mt-3">
                <LeadStatusStepper status={lead.status} />
              </div>
            </SheetHeader>

            {next && (
              <div className="border-b p-4">
                <PrimaryActionCard eyebrow="Következő teendő" title={next.title} detail={next.detail} warnings={next.warnings} action={primaryButton} />
              </div>
            )}

            <div className="grid gap-0 lg:grid-cols-[280px_minmax(0,1fr)_320px]">
              {/* Bal: alap */}
              <aside className="border-b p-4 text-sm lg:border-b-0 lg:border-r">
                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Alapadatok</h3>
                <dl className="space-y-2 text-xs">
                  <Field icon={Building2} label="Cég" value={lead.company_name ?? "—"} />
                  <Field icon={User} label="Felelős" value={lead.assignee_name ?? "—"} />
                  <Field icon={Mail} label="Forrás" value={lead.source ?? "—"} />
                  <Field
                    icon={Calendar}
                    label="Pipeline-ba"
                    value={lead.pipeline_entered_at ? new Date(lead.pipeline_entered_at).toLocaleDateString("hu-HU") : "—"}
                  />
                </dl>
                {lead.summary && (
                  <div className="mt-4">
                    <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Összegzés</h4>
                    <p className="whitespace-pre-wrap text-xs text-foreground/80">{lead.summary}</p>
                  </div>
                )}
                <div className="mt-4">
                  <Button asChild variant="outline" size="sm" className="w-full">
                    <Link to="/leads/$id" params={{ id: lead.id }}>
                      <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                      Előzmények és ügyféladatok
                    </Link>
                  </Button>
                </div>
              </aside>

              {/* Közép: next step + aktivitás */}
              <section className="p-4">
                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Ajánlatok ehhez az ügyhöz</h3>
                {leadQuotes.isLoading ? (
                  <p className="mb-6 text-xs text-muted-foreground">Ajánlatok betöltése…</p>
                ) : leadQuotes.isError ? (
                  <div role="alert" className="mb-6 flex flex-wrap items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
                    Az ajánlatok nem tölthetők be. <Button size="sm" variant="outline" className="h-7" onClick={() => leadQuotes.refetch()}>Újra</Button>
                  </div>
                ) : quotes.length === 0 ? (
                  <p className="mb-6 rounded-md border border-dashed p-3 text-xs text-muted-foreground">Még nincs aktuális ajánlat. Az „Ajánlat létrehozása” gombbal indíthatod.</p>
                ) : (
                  <ul className="mb-6 divide-y rounded-md border text-sm">
                    {quotes.map((q) => (
                      <li key={q.id}>
                        <Link to="/quotes/$id" params={{ id: q.id }} className="flex items-center gap-2 px-3 py-2 transition hover:bg-muted/50">
                          <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="min-w-0 flex-1 truncate">{q.title?.trim() || `Ajánlat v${q.version ?? 1}`}<span className="ml-1 text-xs text-muted-foreground">· {q.alternative_key ?? "A"} alt.</span></span>
                          <Badge variant={q.sent_at ? "default" : "secondary"} className="shrink-0 text-[10px]">{quoteStatusLabel(q.status)}</Badge>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}

                {contract && (lead.status === "contract" || accepted) && (
                  <div className="mb-6">
                    <ReadinessList
                      title="Szerződés-előkészítés"
                      readiness={contract}
                      note={`${ESIGN_AVAILABLE ? "" : "Elektronikus aláírás a CRM-ben nem érhető el: a szerződést a CRM-en kívül írjátok alá. "}A megnyerés után az aláírt példány a projekt Dokumentumai között „Szerződés” kategóriában tölthető fel. Ez a lista tájékoztató, nem ment adatot.`}
                    />
                  </div>
                )}

                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Következő lépés</h3>
                <NextStepEditor
                  type={lead.next_step_type}
                  dueAt={lead.next_step_due_at}
                  note={lead.next_step_note}
                  busy={nextStepMut.isPending}
                  onSave={(p) => nextStepMut.mutate(p)}
                  onClear={() => nextStepMut.mutate({ next_step_type: null, next_step_due_at: null, next_step_note: null })}
                />

                <div className="mt-6">
                  <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Aktivitásnapló</h3>
                  <PipelineActivityLog leadId={lead.id} />
                </div>
              </section>

              {/* Jobb: műveletek */}
              <aside className="border-t bg-muted/20 p-4 lg:border-l lg:border-t-0">
                <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Műveletek</h3>
                <LeadActionBar
                  status={lead.status}
                  busy={statusMut.isPending || lostMut.isPending}
                  onChangeStatus={(s) => statusMut.mutate(s)}
                  onWon={() => setProjOpen(true)}
                  onLost={() => setLostOpen(true)}
                />
                <div className="mt-3">
                  <Button
                    variant="outline"
                    className="w-full"
                    disabled={newQuote.isPending || leadQuotes.isLoading}
                    onClick={() => setQuoteChoiceOpen(true)}
                  >
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    {newQuote.isPending ? "Létrehozás…" : quotes.length ? "Új, külön ajánlat" : "Ajánlat létrehozása"}
                  </Button>
                  {quotes.length > 0 && <p className="mt-1 text-[11px] text-muted-foreground">Már van ajánlat. Új verziót vagy alternatívát a meglévő ajánlat adatlapján készíts — ez a gomb egy külön, új piszkozatot hoz létre.</p>}
                  <Dialog open={quoteChoiceOpen} onOpenChange={(v) => { if (!newQuote.isPending) setQuoteChoiceOpen(v); }}>
                    <DialogContent><DialogHeader><DialogTitle>Új ajánlat</DialogTitle></DialogHeader>{quotes.length > 0 && <p className="text-xs text-[color:var(--status-warning)]">Figyelem: ehhez az ügyhöz már van {quotes.length} aktuális ajánlat. Ez külön piszkozatot hoz létre.</p>}<QuoteWorkflowChoice disabled={newQuote.isPending} onChoose={(kind) => newQuote.mutate(kind)} /></DialogContent>
                  </Dialog>
                </div>
                <details className="mt-4 rounded-md border bg-card p-3 text-[11px] text-muted-foreground">
                  <summary className="flex cursor-pointer items-center gap-1 font-medium text-foreground"><Info className="h-3.5 w-3.5" />Mit hol intézek?</summary>
                  <ul className="mt-2 list-disc space-y-0.5 pl-4">
                    <li>Itt: Pipeline-szakasz, következő lépés, Megnyertük / Elveszett.</li>
                    <li>Ajánlat tartalma, kiküldése, állapota: az ajánlat adatlapján.</li>
                    <li>Felelős átadása: csak tulajdonos.</li>
                    <li>Projekt adatai: a megnyerés után a Projektek között.</li>
                  </ul>
                </details>
              </aside>
            </div>

            <LostDialog open={lostOpen} onOpenChange={setLostOpen} busy={lostMut.isPending} onConfirm={(p) => lostMut.mutate(p)} />
            <CreateProjectDialog
              lead={lead}
              open={projOpen}
              onOpenChange={setProjOpen}
            />
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Field({
  icon: Icon, label, value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</dt>
        <dd className="truncate text-foreground">{value}</dd>
      </div>
    </div>
  );
}