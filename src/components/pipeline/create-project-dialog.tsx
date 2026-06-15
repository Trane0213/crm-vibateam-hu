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
}: {
  lead: PipelineLead | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
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
      // Atomi RPC: lead → won + projekt INSERT egy tranzakcióban.
      const { data, error } = await supabase.rpc("sales_mark_won_with_project", {
        p_lead_id:                 lead.id,
        p_title:                   title.trim() || "Új projekt",
        p_start_date:              startDate,
        p_project_manager_user_id: managerId,
        p_notes:                   notes || null,
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

  const busy = create.isPending;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy) onOpenChange(v); }}>
      <DialogContent
        className="sm:max-w-[520px]"
        onPointerDownOutside={(e) => { if (busy) e.preventDefault(); }}
        onEscapeKeyDown={(e) => { if (busy) e.preventDefault(); }}
      >
        <DialogHeader>
          <DialogTitle>Projekt létrehozása a megnyert leadből</DialogTitle>
          <DialogDescription>
            A Megnyerés és a Projekt létrehozása egyetlen atomi lépés. A lead
            csak akkor vált <strong>megnyert</strong> állapotra, ha a projekt
            sikeresen létrejön. A Mégse gomb biztonsággal bezárja a dialógust —
            a lead a jelenlegi pipeline-szakaszában marad.
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
              Backend invariáns: a lead csak az RPC útján kerülhet
              <code className="mx-1">won</code> állapotba — egyetlen projekt
              létrehozásával együtt, egy tranzakcióban.
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
            {create.isPending ? "Megnyerés és projekt…" : "Megnyerés és projekt"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}