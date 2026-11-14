import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RecordCombobox } from "@/components/resource/record-combobox";
import { AlertTriangle, CheckCircle2, CircleDashed, ArrowRightCircle } from "lucide-react";
import { winHandoffPreview } from "@/lib/handoff/sales-pm-handoff";
import { budapestYmd } from "@/lib/pm/pm-day-flow";
import { LEAD_SOURCE_LABEL } from "@/lib/marketing-status";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { humanizeSupabaseError } from "@/lib/db-hooks";
import { logActivity } from "@/lib/activity-log";
import type { PipelineLead } from "./pipeline-types";

/**
 * Megnyert leadből projekt létrehozása.
 *
 * 2026-06-27 invariáns: a lead `won`-ra állítása ÉS a projekt létrehozása
 * EGY tranzakció — a `public.sales_mark_won_with_project` RPC hívja
 * mindkettőt SECURITY DEFINER-rel. A guard trigger minden más won-átmenetet
 * elutasít, így nem maradhat „won lead projekt nélkül" állapot.
 *
 * Ebből következik: a dialógus megnyitásakor a lead státusza MÉG NEM 'won' —
 * a Mégse gomb egyszerűen bezárja a dialógust, semmilyen visszaállítás
 * nem szükséges.
 */
export function CreateProjectDialog({
  lead,
  open,
  onOpenChange,
  currentQuoteCount = null,
}: {
  lead: PipelineLead | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Az ügy aktuális ajánlatainak száma (null = nem ismert) — csak az előnézethez. */
  currentQuoteCount?: number | null;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [managerId, setManagerId] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");

  useEffect(() => {
    if (open && lead) {
      setTitle(lead.company_name ? `${lead.company_name} – projekt` : lead.summary ?? "Új projekt");
      // Az ügy összefoglalója automatikusan átkerül (handoff_payload.summary) —
      // a jegyzetbe nem másoljuk be újra, hogy ne legyen kettős adat.
      setNotes("");
      setManagerId("");
      setStartDate(budapestYmd());
    }
  }, [open, lead]);

  const create = useMutation({
    mutationFn: async () => {
      if (!lead) throw new Error("Nincs lead.");
      if (!managerId) throw new Error("Projektvezető megadása kötelező.");
      if (!startDate) throw new Error("Indulás dátuma megadása kötelező.");
      // Atomi RPC: lead → won + projekt INSERT egy tranzakcióban.
      const { data, error } = await supabase.rpc("sales_mark_won_with_project", {
        p_lead_id:                 lead.id,
        p_title:                   title.trim() || "Új projekt",
        p_start_date:              startDate,
        p_project_manager_user_id: managerId,
        p_notes:                   notes || undefined,
      });
      if (error) throw error;
      const projectId = data as unknown as string;
      await logActivity("leads", "status_change", lead.id, { from: lead.status, to: "won", project_id: projectId });
      await logActivity("projects", "create", projectId, {
        from_lead: lead.id,
        project_manager_user_id: managerId,
        start_date: startDate,
      });
      return { id: projectId };
    },
    onError: (e: any) => toast.error("A megnyerés nem sikerült — semmi nem módosult", { description: humanizeSupabaseError(e) }),
    onSuccess: (data) => {
      toast.success("Megnyert ügy — a projekt létrejött és átadva a projektvezetőnek");
      qc.invalidateQueries({ queryKey: ["pipeline"] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      // A lead won-né vált → a Ma oldal Workspace/Pipeline számlálói és a
      // Workspace lista (["leads", ...]) is változnak.
      qc.invalidateQueries({ queryKey: ["leads"] });
      onOpenChange(false);
      // Közvetlenül az Átadás fülre: ott látszik, mi ment át és mi hiányzik.
      navigate({ to: "/projects/$id", params: { id: data.id }, search: { tab: "handover" } });
    },
  });

  const busy = create.isPending;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy) onOpenChange(v); }}>
      <DialogContent
        className="sm:max-w-[520px]"
        onPointerDownOutside={(e) => { if (busy) e.preventDefault(); }}
        onEscapeKeyDown={(e) => { if (busy) e.preventDefault(); }}
      >
        <DialogHeader>
          <DialogTitle>Megnyertük → projektátadás</DialogTitle>
          <DialogDescription>
            Add meg a projektvezetőt és az indulást. A Mégse gomb semmit nem
            módosít — az ügy a Szerződés szakaszban marad.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Projekt címe *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="pl. Társasház felújítás – 2026 Q3" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Projektvezető *</Label>
              <RecordCombobox source="v_sales_user_load" value={managerId} onChange={setManagerId} label="Projektvezető" disabled={busy} />
            </div>
            <div className="space-y-1.5">
              <Label>Indulás dátuma *</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
          </div>
          {lead && <WinPreview lead={lead} currentQuoteCount={currentQuoteCount} />}
          <div className="space-y-1.5">
            <Label>Átadási jegyzet (csak ami az összefoglalóban nincs)</Label>
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Pl. szerződéses feltételek, ügyfél kérései, helyszíni tudnivalók, ígért határidő." />
          </div>
          <div className="flex items-start gap-2 rounded-md border border-[color:var(--status-warning)]/40 bg-[color:var(--status-warning)]/10 px-3 py-2 text-[11px]">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[color:var(--status-warning)]" />
            <span>
              Visszavonhatatlan lépés: a megnyert ügy később nem nyitható újra. A projekt és a
              „Megnyert” állapot egyszerre jön létre — ha bármelyik hibára fut, egyik sem.
              Az ajánlatok, utánkövetések és a kapcsolattartó automatikusan a projekthez kapcsolódnak.
            </span>
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Mégse
          </Button>
          <Button
            onClick={() => create.mutate()}
            disabled={!title.trim() || !managerId || !startDate || busy}
          >
            {create.isPending ? "Mentés…" : "Megnyertük, projekt létrehozása"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
const PREVIEW_ICON = { auto: CheckCircle2, missing: AlertTriangle, later: ArrowRightCircle } as const;
const PREVIEW_TONE = { auto: "text-[color:var(--status-success)]", missing: "text-[color:var(--status-warning)]", later: "text-muted-foreground" } as const;
const PREVIEW_LABEL = { auto: "Automatikusan átkerül", missing: "Hiányzik", later: "Később, a projektvezető" } as const;

/** Mi kerül át a megnyeréskor és mit kell pótolni — a meglévő RPC/trigger viselkedése alapján, írás nélkül. */
function WinPreview({ lead, currentQuoteCount }: { lead: PipelineLead; currentQuoteCount: number | null }) {
  const rows = winHandoffPreview(lead, currentQuoteCount);
  return (
    <section aria-label="Átadás előnézete" className="rounded-md border bg-muted/20 p-2">
      <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"><CircleDashed className="h-3 w-3" />Mi kerül át a projektvezetőhöz?</div>
      <ul className="space-y-1 text-xs">
        {rows.map((r) => { const I = PREVIEW_ICON[r.state]; return (
          <li key={r.key} data-preview={r.key} data-state={r.state} className="flex items-start gap-1.5">
            <I className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${PREVIEW_TONE[r.state]}`} aria-label={PREVIEW_LABEL[r.state]} />
            <span><span className="font-medium">{r.label}</span>{r.key === "source" && lead.source ? ` (${(LEAD_SOURCE_LABEL as Record<string, string>)[lead.source] ?? lead.source})` : ""}: <span className="text-muted-foreground">{r.detail}</span></span>
          </li>
        ); })}
      </ul>
      {lead.summary && <p className="mt-1.5 line-clamp-3 rounded bg-background p-1.5 text-[11px] text-muted-foreground">„{lead.summary}”</p>}
    </section>
  );
}
