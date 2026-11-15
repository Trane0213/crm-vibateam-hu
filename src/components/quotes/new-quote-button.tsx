import { useCrmNavigate } from "@/components/workspace-v2/crm-link";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RecordCombobox } from "@/components/resource/record-combobox";
import { createQuoteForLead } from "@/lib/quotes/create";
import { supabase } from "@/integrations/supabase/client";
import { humanizeSupabaseError } from "@/lib/db-hooks";
import { logActivity } from "@/lib/activity-log";
import { quoteStatusLabel } from "@/lib/quotes/quote-status";
import { QuoteWorkflowChoice } from "./quote-workflow-choice";
import type { QuoteWorkflow } from "@/lib/quotes/workflow";

type Props = { leadId?: string | null; companyId?: string | null; label?: string; variant?: "default" | "secondary" | "outline"; openIn?: "legacy" | "v2" };

/**
 * Új ajánlat: kötelező ügy (lead) + ajánlattípus. Ha az ügynek már van ajánlata, nem hoz létre
 * másodikat — a meglévőt ajánlja fel (ott: Új verzió / Új alternatíva).
 */
export function NewQuoteButton({ leadId = null, companyId = null, label = "Új ajánlat", variant = "secondary", openIn = "legacy" }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<string>("");
  const navigate = useCrmNavigate();
  const qc = useQueryClient();
  const lead = leadId ?? (picked || null);
  const existing = useQuery({
    queryKey: ["quotes", "by-lead-for-new", lead],
    enabled: open && !!lead,
    queryFn: async () => {
      const { data, error } = await supabase.from("quotes").select("id,title,version,alternative_key,alternative_label,status,is_current").eq("lead_id", lead!).eq("is_current", true).order("alternative_key").limit(26);
      if (error) throw error;
      return data ?? [];
    },
  });
  const go = (id: string) => openIn === "v2" ? navigate({ to: "/munka/sales/ajanlat/$id", params: { id } }) : navigate({ to: "/quotes/$id", params: { id } });
  const choose = async (kind: QuoteWorkflow) => {
    if (!lead) return;
    setBusy(true);
    try {
      const id = await createQuoteForLead({ leadId: lead, kind });
      await logActivity("quotes", "create", String(id), { lead_id: lead, quote_kind: kind });
      toast.success("Új ajánlat létrehozva");
      qc.invalidateQueries({ queryKey: ["quotes"] });
      setOpen(false); setPicked("");
      go(id);
    } catch (error) { toast.error("Nem sikerült létrehozni", { description: humanizeSupabaseError(error) }); }
    finally { setBusy(false); }
  };
  const rows = existing.data ?? [];
  return <>
    <Button size="sm" variant={variant} onClick={() => setOpen(true)}><Plus className="mr-1.5 h-4 w-4" />{label}</Button>
    <Dialog open={open} onOpenChange={(value) => { if (!busy) { setOpen(value); if (!value) setPicked(""); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Új ajánlat</DialogTitle>
          <DialogDescription>Az ajánlat mindig egy ügyhöz tartozik: onnan jön az ügyfél, a kapcsolattartó és a felelős.</DialogDescription>
        </DialogHeader>
        {!leadId && <div className="grid gap-1.5">
          <Label htmlFor="nq-lead">1. Melyik ügyhöz?</Label>
          <RecordCombobox id="nq-lead" source="leads" value={picked || null} onChange={setPicked} label="Ügy" placeholder="Ügy vagy ügyfél keresése…"
            filters={companyId ? { company_id: companyId } : undefined} />
          <p className="text-xs text-muted-foreground">Ha még nincs ügy, előbb az ügyfél adatlapján vagy az érdeklődők között hozd létre.</p>
        </div>}
        {lead && existing.isLoading && <p className="text-sm text-muted-foreground">Ügy ellenőrzése…</p>}
        {lead && existing.isError && <p role="alert" className="text-sm text-destructive">Az ügy ajánlatai nem tölthetők be. <Button variant="link" size="sm" onClick={() => existing.refetch()}>Újra</Button></p>}
        {lead && existing.isSuccess && rows.length > 0 && <div className="space-y-2 rounded-md border bg-muted/30 p-3 text-sm">
          <p className="font-medium">Ehhez az ügyhöz már van ajánlat — nem készül második.</p>
          <ul className="space-y-1">{rows.map((q) => <li key={q.id}>
            <button type="button" className="text-left text-primary hover:underline" onClick={() => { setOpen(false); go(q.id); }}>
              {q.title?.trim() || "Ajánlat"} · {q.version}. változat{q.alternative_key !== "A" || q.alternative_label ? ` · ${q.alternative_label ?? `${q.alternative_key} alternatíva`}` : ""} · {quoteStatusLabel(q.status)}
            </button></li>)}</ul>
          <p className="text-xs text-muted-foreground">Nyisd meg: módosított ajánlathoz ott „Új verzió”, párhuzamos műszaki megoldáshoz „Új alternatíva”.</p>
        </div>}
        {lead && existing.isSuccess && rows.length === 0 && <div><p className="text-sm font-medium">{leadId ? "Ajánlat típusa" : "2. Ajánlat típusa"}</p><QuoteWorkflowChoice disabled={busy} onChoose={choose} /></div>}
      </DialogContent>
    </Dialog>
  </>;
}
