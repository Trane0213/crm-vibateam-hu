import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/sales/status-chip";
import { LeadStatusStepper } from "@/components/sales/lead-status-stepper";
import { LeadActionBar } from "@/components/sales/lead-action-bar";
import { NextStepEditor } from "@/components/sales/next-step-editor";
import { WonDialog } from "@/components/sales/won-dialog";
import { LostDialog } from "@/components/sales/lost-dialog";
import { PipelineActivityLog } from "./pipeline-activity-log";
import { CreateProjectDialog } from "./create-project-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { humanizeSupabaseError } from "@/lib/db-hooks";
import { logActivity } from "@/lib/activity-log";
import { ExternalLink, Building2, Mail, User, Calendar } from "lucide-react";
import type { LeadStatus } from "@/lib/sales/constants";
import type { PipelineLead } from "./pipeline-types";

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
  const [wonOpen, setWonOpen] = useState(false);
  const [lostOpen, setLostOpen] = useState(false);
  const [projOpen, setProjOpen] = useState(false);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["pipeline"] });
    qc.invalidateQueries({ queryKey: ["pipeline", "activity", lead?.id] });
  };

  const statusMut = useMutation({
    mutationFn: async (next: LeadStatus) => {
      if (!lead) throw new Error("Nincs lead.");
      const from = lead.status;
      const { error } = await supabase.from("leads").update({ status: next }).eq("id", lead.id);
      if (error) throw error;
      await logActivity("leads", "status_change", lead.id, { from, to: next });
    },
    onError: (e: any) => toast.error("Státuszváltás sikertelen", { description: humanizeSupabaseError(e) }),
    onSuccess: () => { toast.success("Státusz frissítve"); invalidate(); },
  });

  const wonMut = useMutation({
    mutationFn: async () => {
      if (!lead) throw new Error("Nincs lead.");
      const { error } = await supabase.from("leads").update({ status: "won", won_at: new Date().toISOString() }).eq("id", lead.id);
      if (error) throw error;
      await logActivity("leads", "status_change", lead.id, { from: lead.status, to: "won" });
    },
    onError: (e: any) => toast.error("Won-jelölés sikertelen", { description: humanizeSupabaseError(e) }),
    onSuccess: () => {
      toast.success("Lead megnyerve");
      invalidate();
      setWonOpen(false);
      // Megnyerés után rögtön a projekt-létrehozás dialógus.
      setProjOpen(true);
    },
  });

  const lostMut = useMutation({
    mutationFn: async (p: { lost_reason: string; lost_note: string | null }) => {
      if (!lead) throw new Error("Nincs lead.");
      const { error } = await supabase
        .from("leads")
        .update({ status: "lost", lost_at: new Date().toISOString(), lost_reason: p.lost_reason, lost_note: p.lost_note })
        .eq("id", lead.id);
      if (error) throw error;
      await logActivity("leads", "status_change", lead.id, { from: lead.status, to: "lost", reason: p.lost_reason });
    },
    onError: (e: any) => toast.error("Lost-jelölés sikertelen", { description: humanizeSupabaseError(e) }),
    onSuccess: () => { toast.success("Lead elveszettnek jelölve"); invalidate(); setLostOpen(false); onOpenChange(false); },
  });

  const nextStepMut = useMutation({
    mutationFn: async (p: { next_step_type: any; next_step_due_at: string | null; next_step_note: string | null }) => {
      if (!lead) throw new Error("Nincs lead.");
      const { error } = await supabase.from("leads").update(p).eq("id", lead.id);
      if (error) throw error;
      await logActivity("leads", "update", lead.id, { field: "next_step", ...p });
    },
    onError: (e: any) => toast.error("Next step mentés sikertelen", { description: humanizeSupabaseError(e) }),
    onSuccess: () => { toast.success("Következő lépés mentve"); invalidate(); },
  });

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
                    Pipeline részletek — szerkesztés csak itt és a Workspace-en.
                  </SheetDescription>
                </div>
                <StatusChip status={lead.status} />
              </div>
              <div className="mt-3">
                <LeadStatusStepper status={lead.status} />
              </div>
            </SheetHeader>

            <div className="grid gap-0 lg:grid-cols-[280px_minmax(0,1fr)_320px]">
              {/* Bal: alap */}
              <aside className="border-r p-4 text-sm">
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
                      Megnyitás Workspace-ben
                    </Link>
                  </Button>
                </div>
              </aside>

              {/* Közép: next step + aktivitás */}
              <section className="p-4">
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
              <aside className="border-l bg-muted/20 p-4">
                <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Műveletek</h3>
                <LeadActionBar
                  status={lead.status}
                  busy={statusMut.isPending || wonMut.isPending || lostMut.isPending}
                  onChangeStatus={(s) => statusMut.mutate(s)}
                  onWon={() => setWonOpen(true)}
                  onLost={() => setLostOpen(true)}
                />
                <div className="mt-4 rounded-md border bg-card p-3 text-[11px] text-muted-foreground">
                  <p className="font-medium text-foreground">Csak itt végezhető</p>
                  <ul className="mt-1 list-disc pl-4">
                    <li>Pipeline státuszváltás</li>
                    <li>Megnyert / Elveszett lezárás</li>
                    <li>Következő lépés rögzítés</li>
                  </ul>
                  <p className="mt-2 font-medium text-foreground">Nem itt</p>
                  <ul className="mt-1 list-disc pl-4">
                    <li>Lead átkiosztás → Workspace</li>
                    <li>Ajánlat szerkesztés → Ajánlat modul</li>
                    <li>Projekt módosítás → Projektek</li>
                  </ul>
                </div>
              </aside>
            </div>

            <WonDialog open={wonOpen} onOpenChange={setWonOpen} busy={wonMut.isPending} onConfirm={() => wonMut.mutate()} />
            <LostDialog open={lostOpen} onOpenChange={setLostOpen} busy={lostMut.isPending} onConfirm={(p) => lostMut.mutate(p)} />
            <CreateProjectDialog
              lead={lead}
              open={projOpen}
              onOpenChange={(v) => { setProjOpen(v); if (!v) onOpenChange(false); }}
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