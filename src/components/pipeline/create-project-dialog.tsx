import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { humanizeSupabaseError } from "@/lib/db-hooks";
import { logActivity } from "@/lib/activity-log";
import type { PipelineLead } from "./pipeline-types";

/**
 * Megnyert leadből projekt létrehozása. A backend trigger
 * (`projects_lead_handoff_guard`) ellenőrzi, hogy a lead.status='won',
 * ezért ezt a dialógust CSAK Won-jelölés után szabad megnyitni.
 */
export function CreateProjectDialog({
  lead,
  open,
  onOpenChange,
  previousStatus,
}: {
  lead: PipelineLead | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /**
   * A lead won-jelölés előtti státusza. Ha az értékesítő megszakítja a
   * projekt-létrehozást, ide állítjuk vissza a leadet — így nem maradhat
   * `won` állapotú lead projekt nélkül.
   */
  previousStatus?: string | null;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [managerId, setManagerId] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");

  // Projektvezető-választó: a v_sales_user_load minden listázott felhasználót
  // ad — sales szerepkörnél is engedélyezett, hogy önmagát is választhassa.
  const users = useQuery({
    queryKey: ["v_sales_user_load", "all"],
    staleTime: 5 * 60_000,
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_sales_user_load")
        .select("user_id, full_name, email")
        .order("full_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as { user_id: string; full_name: string | null; email: string | null }[];
    },
  });

  useEffect(() => {
    if (open && lead) {
      setTitle(lead.company_name ? `${lead.company_name} – projekt` : lead.summary ?? "Új projekt");
      setNotes(lead.summary ?? "");
      setManagerId("");
      setStartDate(new Date().toISOString().slice(0, 10));
    }
  }, [open, lead]);

  const create = useMutation({
    mutationFn: async () => {
      if (!lead) throw new Error("Nincs lead.");
      if (!managerId) throw new Error("Projektvezető megadása kötelező.");
      if (!startDate) throw new Error("Indulás dátuma megadása kötelező.");
      const payload: Record<string, any> = {
        title: title.trim() || "Új projekt",
        lead_id: lead.id,
        company_id: lead.company_id,
        start_date: startDate,
        handoff_payload: {
          source: lead.source,
          summary: lead.summary,
          notes: notes || null,
          won_at: lead.won_at,
          // A projektvezető-mező a projects táblán még nincs külön oszlopként,
          // ezért a handoff_payload-ban tároljuk — a projekt-detail átveheti.
          project_manager_user_id: managerId,
        },
      };
      const { data, error } = await supabase.from("projects").insert(payload).select("id").single();
      if (error) throw error;
      await logActivity("leads", "update", lead.id, {
        field: "project_created",
        project_id: data.id,
        project_manager_user_id: managerId,
        start_date: startDate,
      });
      await logActivity("projects", "create", data.id, { from_lead: lead.id });
      return data as { id: string };
    },
    onError: (e: any) => toast.error("Projekt létrehozás sikertelen", { description: humanizeSupabaseError(e) }),
    onSuccess: (data) => {
      toast.success("Projekt létrehozva");
      qc.invalidateQueries({ queryKey: ["pipeline"] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      // A lead won-né vált → a Ma oldal Workspace/Pipeline számlálói és a
      // Workspace lista (["leads", ...]) is változnak.
      qc.invalidateQueries({ queryKey: ["leads"] });
      onOpenChange(false);
      navigate({ to: "/projects/$id", params: { id: data.id } });
    },
  });

  /**
   * Megszakítás: visszaállítjuk a leadet a Megnyerés előtti állapotba, mert
   * `won` lead projekt nélkül tiltott állapot a folyamatban.
   */
  const revert = useMutation({
    mutationFn: async () => {
      if (!lead) return;
      const back = (previousStatus as any) || "contract";
      const { error } = await supabase
        .from("leads")
        .update({ status: back, won_at: null })
        .eq("id", lead.id);
      if (error) throw error;
      await logActivity("leads", "status_change", lead.id, { from: "won", to: back, reason: "project_creation_cancelled" });
    },
    onError: (e: any) => toast.error("Visszaállítás sikertelen", { description: humanizeSupabaseError(e) }),
    onSuccess: () => {
      toast.info("Lead visszaállítva — projekt nem jött létre.");
      qc.invalidateQueries({ queryKey: ["pipeline"] });
      // A lead visszakerült won-ból pipeline-szakaszba → a Ma oldal
      // ["leads", ...] alapú számlálói is változnak.
      qc.invalidateQueries({ queryKey: ["leads"] });
      onOpenChange(false);
    },
  });

  const busy = create.isPending || revert.isPending;

  return (
    <Dialog open={open} onOpenChange={() => { /* csak gombokkal zárható — won → projekt kötelező */ }}>
      <DialogContent
        className="sm:max-w-[520px]"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Projekt létrehozása a megnyert leadből</DialogTitle>
          <DialogDescription>
            A lead már <strong>megnyert</strong> állapotban van. Projekt nélkül
            ez tiltott állapot — vagy hozz létre projektet, vagy a „Mégse és
            visszaállít" gombbal vidd vissza a leadet a korábbi pipeline-szakaszra.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Projekt címe *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="pl. Társasház felújítás – 2026 Q3" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Projektvezető *</Label>
              <Select value={managerId} onValueChange={setManagerId}>
                <SelectTrigger>
                  <SelectValue placeholder={users.isLoading ? "Betöltés…" : "Válassz felhasználót"} />
                </SelectTrigger>
                <SelectContent>
                  {(users.data ?? []).map((u) => (
                    <SelectItem key={u.user_id} value={u.user_id}>
                      {u.full_name || u.email || u.user_id}
                    </SelectItem>
                  ))}
                  {!users.isLoading && (users.data ?? []).length === 0 && (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">Nincs választható felhasználó.</div>
                  )}
                </SelectContent>
              </Select>
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
          <div className="space-y-1.5">
            <Label>Átadási jegyzet</Label>
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Mit kell a PM-nek tudnia a leadről?" />
          </div>
          <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              A Megnyerés és a Projekt létrehozása atomi lépés a folyamatban.
              Lead = megnyert állapotban projekt nélkül nem maradhat.
            </span>
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => revert.mutate()}
            disabled={busy}
          >
            {revert.isPending ? "Visszaállítás…" : "Mégse és visszaállít"}
          </Button>
          <Button
            onClick={() => create.mutate()}
            disabled={!title.trim() || !managerId || !startDate || busy}
          >
            {create.isPending ? "Létrehozás…" : "Projekt létrehozása"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}