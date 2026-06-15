import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
}: {
  lead: PipelineLead | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open && lead) {
      setTitle(lead.company_name ? `${lead.company_name} – projekt` : lead.summary ?? "Új projekt");
      setNotes(lead.summary ?? "");
    }
  }, [open, lead]);

  const create = useMutation({
    mutationFn: async () => {
      if (!lead) throw new Error("Nincs lead.");
      const payload: Record<string, any> = {
        title: title.trim() || "Új projekt",
        status: "planning",
        lead_id: lead.id,
        company_id: lead.company_id,
        handoff_payload: {
          source: lead.source,
          summary: lead.summary,
          notes: notes || null,
          won_at: lead.won_at,
        },
      };
      const { data, error } = await supabase.from("projects").insert(payload).select("id").single();
      if (error) throw error;
      await logActivity("leads", "update", lead.id, { field: "project_created", project_id: data.id });
      await logActivity("projects", "create", data.id, { from_lead: lead.id });
      return data as { id: string };
    },
    onError: (e: any) => toast.error("Projekt létrehozás sikertelen", { description: humanizeSupabaseError(e) }),
    onSuccess: (data) => {
      toast.success("Projekt létrehozva");
      qc.invalidateQueries({ queryKey: ["pipeline"] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      onOpenChange(false);
      navigate({ to: "/projects/$id", params: { id: data.id } });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!create.isPending) onOpenChange(v); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Projekt létrehozása a megnyert leadből</DialogTitle>
          <DialogDescription>
            A backend csak <code>status=won</code> leadre engedi a projekt-átadást. A létrehozás után
            a projekt megnyílik.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Projekt címe *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="pl. Társasház felújítás – 2026 Q3" />
          </div>
          <div className="space-y-1.5">
            <Label>Átadási jegyzet</Label>
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Mit kell a PM-nek tudnia a leadről?" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={create.isPending}>
            Mégse
          </Button>
          <Button onClick={() => create.mutate()} disabled={!title.trim() || create.isPending}>
            {create.isPending ? "Létrehozás…" : "Projekt létrehozása"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}