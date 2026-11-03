import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createDraftQuote } from "@/lib/quotes/create";
import { supabase } from "@/integrations/supabase/client";
import { QuoteWorkflowChoice } from "./quote-workflow-choice";
import type { QuoteWorkflow } from "@/lib/quotes/workflow";

export function NewQuoteButton({ leadId = null, label = "Új ajánlat", variant = "secondary" }: { leadId?: string | null; label?: string; variant?: "default" | "secondary" | "outline" }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const choose = async (kind: QuoteWorkflow) => {
    setBusy(true);
    try {
      const id = await createDraftQuote({ leadId });
      const result = await supabase.from("quotes").update({ quote_kind: kind }).eq("id", id).select("id");
      if (result.error || result.data?.length !== 1) {
        toast.error("A piszkozat elkészült, de az ajánlattípust az adatlapon kell megadni.");
      } else toast.success("Új piszkozat létrehozva");
      qc.invalidateQueries({ queryKey: ["quotes"] });
      setOpen(false);
      navigate({ to: "/quotes/$id", params: { id } });
    } catch (error) { toast.error(error instanceof Error ? error.message : "Nem sikerült létrehozni."); }
    finally { setBusy(false); }
  };
  return <>
    <Button size="sm" variant={variant} onClick={() => setOpen(true)}><Plus className="mr-1.5 h-4 w-4" />{label}</Button>
    <Dialog open={open} onOpenChange={(value) => { if (!busy) setOpen(value); }}>
      <DialogContent><DialogHeader><DialogTitle>Új ajánlat</DialogTitle></DialogHeader><QuoteWorkflowChoice disabled={busy} onChoose={choose} /></DialogContent>
    </Dialog>
  </>;
}