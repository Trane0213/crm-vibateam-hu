import { CrmLink, useCrmNavigate } from "@/components/workspace-v2/crm-link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { cn } from "@/lib/utils";
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
import { leadNextAction, currentQuotes } from "@/lib/sales/sales-flow";
import { ContractPrepPanel } from "@/components/contract/contract-prep-panel";
import { RelatedDocumentsPanel } from "@/components/documents/related-documents-panel";
import { LEAD_STATUS_LABEL } from "@/lib/sales/constants";
import { PrimaryActionCard } from "@/components/sales/sales-flow-ui";
import { createDraftQuote } from "@/lib/quotes/create";
import type { LeadStatus } from "@/lib/sales/constants";
import type { PipelineLead } from "./pipeline-types";
import { usePipelineLeadMutations } from "./use-pipeline-lead-mutations";
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
  inline = false,
}: {
  lead: PipelineLead | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Oldalba ágyazva (új munkaterület ügyoldala), felugró panel nélkül; ugyanazok a műveletek. */
  inline?: boolean;
}) {
  const Hdr = inline ? InlineHeader : SheetHeader;
  const Ttl = inline ? InlineTitle : SheetTitle;
  const Desc = inline ? InlineDesc : SheetDescription;
  const qc = useQueryClient();
  const [lostOpen, setLostOpen] = useState(false);
  const [projOpen, setProjOpen] = useState(false);
  const [quoteChoiceOpen, setQuoteChoiceOpen] = useState(false);
  const navigate = useCrmNavigate();
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

  const { statusMut: sharedStatus, lostMut: sharedLost, invalidate: sharedInvalidate } = usePipelineLeadMutations(() => { setLostOpen(false); onOpenChange(false); });
  const invalidate = () => sharedInvalidate(lead?.id);
  // Közös írási útvonal (use-pipeline-lead-mutations): ugyanaz a visszaolvasás, napló és invalidálás.
  // A „won” átmenet továbbra is kizárólag a CreateProjectDialog → sales_mark_won_with_project úton.
  const statusMut = {
    isPending: sharedStatus.isPending,
    mutate: (next: LeadStatus) => { if (lead) sharedStatus.mutate({ lead, next }); },
  };
  const lostMut = {
    isPending: sharedLost.isPending,
    mutate: (p: { lost_reason: string; lost_note: string | null }) => { if (lead) sharedLost.mutate({ lead, ...p }); },
  };

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
  const busy = statusMut.isPending || lostMut.isPending || newQuote.isPending;
  const primaryButton = !next ? null
    : next.kind === "create_quote" ? <Button size="sm" disabled={busy || leadQuotes.isLoading} onClick={() => setQuoteChoiceOpen(true)}><FileText className="mr-1.5 h-3.5 w-3.5" />Ajánlat létrehozása</Button>
    : next.kind === "open_quote" && next.quoteId ? <Button size="sm" asChild><CrmLink to="/quotes/$id" params={{ id: next.quoteId }}><FileText className="mr-1.5 h-3.5 w-3.5" />Ajánlat megnyitása</CrmLink></Button>
    : next.kind === "change_status" && next.suggestStatus ? <Button size="sm" disabled={busy} onClick={() => statusMut.mutate(next.suggestStatus!)}><ArrowRight className="mr-1.5 h-3.5 w-3.5" />Áthelyezés: {LEAD_STATUS_LABEL[next.suggestStatus]}</Button>
    : next.kind === "win" ? <Button size="sm" disabled={busy} onClick={() => setProjOpen(true)}><Trophy className="mr-1.5 h-3.5 w-3.5" />Megnyertük → projektátadás</Button>
    : next.kind === "open_prep" ? <Button size="sm" asChild><CrmLink to="/leads" search={{ lead: lead!.id }}>Sales-előkészítés megnyitása</CrmLink></Button>
    : null;

  const body = (
      <>
        {!lead ? (
          <div className="p-6 text-sm text-muted-foreground">Nincs kiválasztott lead.</div>
        ) : (
          <>
            <Hdr className="border-b bg-card/40 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Ttl className="flex items-center gap-2 text-base">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    {lead.company_name || lead.summary || "Lead"}
                  </Ttl>
                  <Desc>
                    Ügy adatlap · {lead.assignee_name ? `felelős: ${lead.assignee_name}` : "felelős nincs megadva"}
                  </Desc>
                </div>
                <StatusChip status={lead.status} />
              </div>
              <div className="mt-3">
                <LeadStatusStepper status={lead.status} />
              </div>
            </Hdr>

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
                {!inline && <div className="mt-4">
                  <Button asChild variant="outline" size="sm" className="w-full">
                    <CrmLink to="/leads/$id" params={{ id: lead.id }}>
                      <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                      Előzmények és ügyféladatok
                    </CrmLink>
                  </Button>
                </div>}
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
                        <CrmLink to="/quotes/$id" params={{ id: q.id }} className="flex items-center gap-2 px-3 py-2 transition hover:bg-muted/50">
                          <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="min-w-0 flex-1 truncate">{q.title?.trim() || `Ajánlat v${q.version ?? 1}`}<span className="ml-1 text-xs text-muted-foreground">· {q.alternative_key ?? "A"} alt.</span></span>
                          <Badge variant={q.sent_at ? "default" : "secondary"} className="shrink-0 text-[10px]">{quoteStatusLabel(q.status)}</Badge>
                        </CrmLink>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="mb-6">
                  {/* Ügy dokumentumai: ajánlat (minden verzió), ügyfél és a megnyerésből lett projekt — csak a látható fájlok, megnyitás jogosultság szerint. */}
                  <RelatedDocumentsPanel
                    ctx={{ leadId: lead.id, companyIds: [lead.company_id] }}
                    enabled={open}
                    title="Ügy dokumentumai"
                    description="Ajánlati, ügyfél- és projektfájlok ehhez az ügyhöz. Feltölteni az ajánlat, az ügyfél vagy a projekt adatlapján lehet."
                    emptyTitle="Ehhez az ügyhöz még nincs látható dokumentum"
                  />
                </div>

                {(lead.status === "contract" || accepted) && (
                  <div className="mb-6">
                    {/* Közös szerződés-előkészítési modell (contract-prep.ts) — csak olvas, nem hagy jóvá. */}
                    <ContractPrepPanel leadId={lead.id} />
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
                    <li>Projekt adatai: a megnyerés után a projekt Átadás fülén (ott látszik, mi ment át és mi hiányzik).</li>
                  </ul>
                </details>
              </aside>
            </div>

            <LostDialog open={lostOpen} onOpenChange={setLostOpen} busy={lostMut.isPending} onConfirm={(p) => lostMut.mutate(p)} />
            <CreateProjectDialog
              lead={lead}
              currentQuoteCount={leadQuotes.isSuccess ? quotes.length : null}
              open={projOpen}
              onOpenChange={setProjOpen}
            />
          </>
        )}
      </>
  );
  if (inline) return <div className="min-w-0">{body}</div>;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full max-w-[1100px] overflow-y-auto p-0 sm:max-w-[1100px]">
        {body}
      </SheetContent>
    </Sheet>
  );
}

function InlineHeader({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("flex flex-col space-y-2 text-left", className)}>{children}</div>;
}
function InlineTitle({ className, children }: { className?: string; children: React.ReactNode }) {
  return <h2 className={cn("font-display font-semibold", className)}>{children}</h2>;
}
function InlineDesc({ className, children }: { className?: string; children: React.ReactNode }) {
  return <p className={cn("text-sm text-muted-foreground", className)}>{children}</p>;
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