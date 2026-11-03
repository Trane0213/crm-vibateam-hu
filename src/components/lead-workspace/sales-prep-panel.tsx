/**
 * Sales előkészítő panel (3. oszlop).
 *
 * Ez NEM a pipeline. Az értékesítő itt az átadott leadekkel első kontaktot
 * vesz fel: hívás / email / találkozó aktivitást rögzít, és kitölti a
 * következő lépést. Üzleti döntés után két lehetséges kimenet:
 *   - Pipeline-ba léptetés (csak ha van ≥1 aktivitás ÉS kitöltött köv. lépés)
 *   - Elveszett (sales előkészítő szakaszban)
 *
 * Pipeline-ba kerülés egyirányú (DB trigger védi). Projekt fogalom itt nincs.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Phone, Mail, Users, ListChecks, Activity, ArrowRight, XCircle, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useServerFn } from "@tanstack/react-start";
import { recordPrepActivity } from "@/lib/sales/prep-activity.functions";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { humanizeSupabaseError } from "@/lib/db-hooks";
import { fmtDateTime, fmtDate } from "@/components/resource/resource-page";
import { toast } from "sonner";
import { NextStepEditor } from "@/components/sales/next-step-editor";
import { canEnterPipeline } from "@/lib/sales/next-step-input";
import { LostDialog } from "@/components/sales/lost-dialog";
import { useUpdateLead } from "./use-lead-mutations";
import { updateLeadOrThrow } from "@/lib/sales/lead-update";
import { logActivity } from "@/lib/activity-log";
import { statusToLostStage } from "@/lib/sales/constants";

type ActivityType = "call" | "email" | "meeting";
const ACTIVITY_LABEL: Record<ActivityType, string> = {
  call: "Hívás",
  email: "Email",
  meeting: "Találkozó",
};
const ACTIVITY_ICON: Record<ActivityType, React.ComponentType<{ className?: string }>> = {
  call: Phone,
  email: Mail,
  meeting: Users,
};

export function SalesPrepPanel({ leadId }: { leadId: string | null }) {
  const qc = useQueryClient();
  const recordActivity = useServerFn(recordPrepActivity);
  const updateLead = useUpdateLead(leadId);

  const lead = useQuery({
    queryKey: ["leads", "detail", leadId],
    enabled: !!leadId,
    queryFn: async () => {
      if (!leadId) throw new Error("Nincs kiválasztott lead.");
      const { data, error } = await supabase.from("leads").select("*").eq("id", leadId).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  // Sales aktivitások (lead-szintű followups). A sales modul migráció óta a
  // followups.lead_id elérhető — ezt szűrjük.
  const activities = useQuery({
    queryKey: ["leads", "prep", "activities", leadId],
    enabled: !!leadId,
    queryFn: async () => {
      if (!leadId) throw new Error("Nincs kiválasztott lead.");
      const { data, error } = await supabase
        .from("followups")
        .select("id,followup_type,result,due_date,created_at,completed")
        .eq("lead_id", leadId)
        .eq("completed", true)
        .in("followup_type", ["call", "email", "meeting"])
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const [openType, setOpenType] = useState<ActivityType | null>(null);
  const [lostOpen, setLostOpen] = useState(false);
  const [pipelineOpen, setPipelineOpen] = useState(false);

  const createActivity = useMutation({
    mutationFn: async (input: { type: "call" | "email"; result: string }) => {
      if (!leadId) throw new Error("Nincs kiválasztott lead.");
      return recordActivity({ data: { leadId, ...input } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads", "prep", "activities", leadId] });
      qc.invalidateQueries({ queryKey: ["followups"] });
      qc.invalidateQueries({ queryKey: ["leads", "dossier"] });
      toast.success("Aktivitás rögzítve");
      setOpenType(null);
    },
    onError: (e: any) => toast.error("Mentés sikertelen", { description: humanizeSupabaseError(e) }),
  });

  const moveToPipeline = useMutation({
    mutationFn: async () => {
      if (!leadId) throw new Error("Nincs kiválasztott lead.");
      // Friss szerverérték a léptetés előtt — ne a gyorsítótárra hagyatkozzunk.
      const { data: fresh, error: freshErr } = await supabase
        .from("leads")
        .select("status, next_step_type, next_step_due_at")
        .eq("id", leadId)
        .maybeSingle();
      if (freshErr) throw freshErr;
      const { count, error: activityError } = await supabase.from("followups")
        .select("id", { count: "exact", head: true }).eq("lead_id", leadId)
        .eq("completed", true).in("followup_type", ["call", "email", "meeting"]);
      if (activityError) throw activityError;
      if (!count) throw new Error("A Pipeline-hoz legalább egy rögzített aktivitás szükséges.");
      if (!fresh?.next_step_type || !fresh?.next_step_due_at) {
        qc.invalidateQueries({ queryKey: ["leads"] });
        throw new Error("A Pipeline-hoz mentett következő lépés típus, dátum és időpont szükséges.");
      }
      const current = (fresh.status ?? "new") as string;
      const pipelineStatuses = new Set(["quote_prep", "quote_sent", "follow_up", "contract"]);
      const patch: Record<string, any> = { pipeline_entered_at: new Date().toISOString() };
      // A Pipeline board csak pipeline-fázisú leadeket mutat — ha a lead még
      // pre-pipeline státuszban van (new/contacted), bumpoljuk quote_prep-re,
      // különben a lead eltűnik a Workspace-ből, de nem jelenik meg a board-on.
      if (!pipelineStatuses.has(current)) patch.status = "quote_prep";
      await updateLeadOrThrow(leadId, patch);
      await logActivity("leads", "pipeline_entered", leadId, { from: current, to: patch.status ?? current });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      // A Pipeline kanban külön cache-en él — frissítsük, hogy a frissen
      // átléptetett lead azonnal megjelenjen a Pipeline tabon.
      qc.invalidateQueries({ queryKey: ["pipeline"] });
      toast.success("Lead átkerült a Pipeline-ba");
      setPipelineOpen(false);
    },
    onError: (e: any) => toast.error("Nem sikerült", { description: humanizeSupabaseError(e) }),
  });

  if (!leadId) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center">
        <div className="max-w-xs text-xs text-muted-foreground">
          Válassz egy érdeklődőt — itt rögzítheted az első sales aktivitásokat és a következő lépést.
        </div>
      </div>
    );
  }
  if (lead.isLoading) return <div className="p-4 text-xs text-muted-foreground">Betöltés…</div>;
  if (!lead.data) return <div className="p-4 text-xs text-muted-foreground">Nem található.</div>;

  const l = lead.data;
  const activityCount = activities.isError || activities.isPending ? 0 : (activities.data ?? []).length;
  const hasNextStepType = Boolean(l.next_step_type);
  const hasNextStepDue = Boolean(l.next_step_due_at);
  const hasNextStep = hasNextStepType && hasNextStepDue;
  const inPipeline = Boolean(l.pipeline_entered_at);
  const isLost = l.status === "lost";
  const canMoveToPipeline = canEnterPipeline({
    activityCount,
    nextStepType: l.next_step_type,
    nextStepDueAt: l.next_step_due_at,
    inPipeline,
    isLost,
  });

  return (
    <div className="flex h-full min-h-0 flex-col overflow-auto">
      <div className="border-b px-4 py-3">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Sales előkészítő</div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          Az értékesítő itt veszi fel az első kontaktot. A Pipeline külön menüben fut.
        </div>
      </div>

      <div className="flex-1 space-y-3 p-3">
        {inPipeline && (
          <Banner tone="success">
            Ez a lead {fmtDate(l.pipeline_entered_at)} óta a Pipeline-ban van. A további munka a Pipeline menüben történik.
          </Banner>
        )}
        {isLost && (
          <Banner tone="destructive">
            Ez a lead elveszettként le lett zárva{l.lost_at ? ` (${fmtDate(l.lost_at)})` : ""}.
          </Banner>
        )}

        {/* A. Aktivitás rögzítése */}
        <Block icon={Activity} title="Aktivitás rögzítése">
          <div className="grid grid-cols-2 gap-1.5">
            {(["call", "email"] as const).map((t) => {
              const Icon = ACTIVITY_ICON[t];
              return (
                <Button
                  key={t}
                  size="sm"
                  variant="outline"
                  onClick={() => setOpenType(t)}
                  disabled={inPipeline || isLost}
                  className="h-auto flex-col py-2"
                >
                  <Icon className="mb-0.5 h-4 w-4" />
                  <span className="text-[11px]">{ACTIVITY_LABEL[t]}</span>
                </Button>
              );
            })}
          </div>
          <div className="mt-1.5 text-[10px] text-muted-foreground">
            Naplózás — nem vált státuszt, nem indít pipeline-t.
          </div>
        </Block>

        {/* B. Következő lépés */}
        <Block icon={ListChecks} title="Következő lépés">
          {!hasNextStep && (
            <div className="mb-2 rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">
              Még nincs következő lépés. A Pipeline-ba léptetéshez kötelező.
            </div>
          )}
          <NextStepEditor
            type={l.next_step_type ?? null}
            dueAt={l.next_step_due_at ?? null}
            note={l.next_step_note ?? null}
            busy={updateLead.isPending}
            onSave={(p) => updateLead.mutate(p)}
            onClear={() => updateLead.mutate({ next_step_type: null, next_step_due_at: null, next_step_note: null })}
          />
        </Block>

        {/* C. Legutóbbi aktivitások */}
        <Block icon={Activity} title="Legutóbbi aktivitások">
          {activityCount === 0 ? (
            <div className="rounded-md border border-dashed p-3 text-center text-[11px] text-muted-foreground">
              Még nincs rögzített sales aktivitás.
            </div>
          ) : (
            <ul className="space-y-1">
              {(activities.data ?? []).slice(0, 5).map((a) => {
                const Icon = ACTIVITY_ICON[a.followup_type as ActivityType] ?? Activity;
                return (
                  <li key={a.id} className="flex items-start gap-2 rounded border px-2 py-1.5 text-[11px]">
                    <Icon className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{ACTIVITY_LABEL[a.followup_type as ActivityType] ?? a.followup_type}</span>
                        <span className="ml-auto shrink-0 text-muted-foreground">{fmtDate(a.due_date ?? a.created_at)}</span>
                      </div>
                      {a.result && <div className="mt-0.5 truncate text-muted-foreground">{a.result}</div>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Block>
      </div>

      {/* Döntési sáv */}
      <div className="border-t bg-muted/20 p-3">
        <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Döntés</div>
        <div className="flex gap-2">
          <div className="flex-1">
            <Button
              className="w-full"
              disabled={!canMoveToPipeline || moveToPipeline.isPending}
              onClick={() => setPipelineOpen(true)}
              title={!canMoveToPipeline ? "Legalább 1 aktivitás, következő lépés típusa és mentett határideje szükséges." : undefined}
            >
              <ArrowRight className="mr-1.5 h-3.5 w-3.5" />
              Pipeline-ba
            </Button>
            {!inPipeline && !isLost && !canMoveToPipeline && (
              <div className="mt-1 text-[10px] text-muted-foreground">
                Feltétel: ≥1 aktivitás{activityCount >= 1 ? " ✓" : ""}, köv. lépés típusa{hasNextStepType ? " ✓" : ""}, mentett határidő (dátum + időpont){hasNextStepDue ? " ✓" : ""}.
              </div>
            )}
          </div>
          <Button
            variant="outline"
            className="text-destructive"
            disabled={inPipeline || isLost || updateLead.isPending}
            onClick={() => setLostOpen(true)}
          >
            <XCircle className="mr-1.5 h-3.5 w-3.5" />
            Elveszett
          </Button>
        </div>
      </div>

      {/* Aktivitás rögzítő dialóg */}
      <ActivityDialog
        key={openType ?? "closed"}
        type={openType === "meeting" ? null : openType}
        onClose={() => setOpenType(null)}
        busy={createActivity.isPending}
        onSubmit={(payload) => createActivity.mutate(payload)}
      />

      {/* Pipeline-ba megerősítés */}
      <Dialog open={pipelineOpen} onOpenChange={(v) => { if (!moveToPipeline.isPending) setPipelineOpen(v); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pipeline-ba léptetés</DialogTitle>
            <DialogDescription>
              Ez az ügy átkerül a Pipeline menübe. Ez egyirányú döntés — onnan már nem hozható vissza ide az előkészítő szakaszba.
            </DialogDescription>
          </DialogHeader>
          <ul className="space-y-1 rounded-md border bg-muted/30 p-2 text-xs">
            <li className="flex items-center gap-1.5"><ChevronRight className="h-3 w-3 text-emerald-600" /> Rögzített aktivitások: <b>{activityCount}</b></li>
            <li className="flex items-center gap-1.5"><ChevronRight className="h-3 w-3 text-emerald-600" /> Következő lépés: <b>{l.next_step_type ?? "—"}</b>{l.next_step_due_at ? ` · ${fmtDateTime(l.next_step_due_at)}` : ""}</li>
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPipelineOpen(false)} disabled={moveToPipeline.isPending}>Mégse</Button>
            <Button onClick={() => moveToPipeline.mutate()} disabled={moveToPipeline.isPending}>
              {moveToPipeline.isPending ? "Léptetés…" : "Pipeline-ba"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Elveszett (pre_pipeline) */}
      <LostDialog
        open={lostOpen}
        onOpenChange={setLostOpen}
        busy={updateLead.isPending}
        onConfirm={(p) => updateLead.mutate(
          {
            status: "lost",
            // 2026-06-27 invariáns: a lost_stage a tényleges aktuális státusz.
            lost_stage: statusToLostStage(lead.data?.status),
            ...p,
          },
          { onSuccess: () => { setLostOpen(false); qc.invalidateQueries({ queryKey: ["leads"] }); } },
        )}
      />
    </div>
  );
}

function Block({ icon: Icon, title, children }: { icon: React.ComponentType<{ className?: string }>; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border p-3">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3 w-3" /> {title}
      </div>
      {children}
    </div>
  );
}

function Banner({ tone, children }: { tone: "success" | "destructive"; children: React.ReactNode }) {
  const cls = tone === "success"
    ? "border-emerald-300 bg-emerald-50 text-emerald-800"
    : "border-destructive/40 bg-destructive/10 text-destructive";
  return <div className={`rounded-md border px-2 py-1.5 text-[11px] ${cls}`}>{children}</div>;
}

function ActivityDialog({
  type, onClose, onSubmit, busy,
}: {
  type: "call" | "email" | null;
  onClose: () => void;
  onSubmit: (p: { type: "call" | "email"; result: string }) => void;
  busy?: boolean;
}) {
  const [result, setResult] = useState("");
  // Reset on type change
  const open = type !== null;
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (busy) return;
        if (!v) { onClose(); setResult(""); }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{type ? `${ACTIVITY_LABEL[type]} rögzítése` : "Aktivitás"}</DialogTitle>
          <DialogDescription>Megtörtént aktivitás rögzítése.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Eredmény / jegyzet</Label>
            <Textarea rows={3} value={result} onChange={(e) => setResult(e.target.value)} placeholder="Mi történt? Mit beszéltetek?" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Mégse</Button>
          <Button onClick={() => type && onSubmit({ type, result })} disabled={busy || !type}>
            {busy ? "Mentés…" : "Rögzítés"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
