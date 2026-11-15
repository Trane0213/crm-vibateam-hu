import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { humanizeSupabaseError } from "@/lib/db-hooks";
import { parseQuotePricingSettings, validatePricingSettings, type QuotePricingSettings } from "@/lib/quotes/pricing-settings";

const MODE_LABEL = { subcontractor_labor: "Csak munkadíj (anyag nélkül)", full_construction: "Anyag + munkadíj" } as const;
const str = (n: number | null) => (n == null ? "" : String(n));
const num = (v: string) => { const t = v.replace(/\s/g, "").replace(",", "."); if (!t) return null; const n = Number(t); return Number.isFinite(n) ? n : NaN; };

/**
 * Az ajánlat EGYETLEN árazási beállítása (belső adat, ügyfél nem látja).
 * A költségvetés-árazás, a tervellenőrzés, az ajánlatcsomag és Timothy is ezt használja.
 */
export function QuotePricingSettingsCard({ quote, showMode = true }: { quote: { id: string; locked_at?: string | null; pricing_settings?: unknown }; showMode?: boolean }) {
  const qc = useQueryClient();
  const saved = parseQuotePricingSettings(quote.pricing_settings);
  const locked = !!quote.locked_at;
  const [f, setF] = useState({ mode: saved.mode ?? "", rate: str(saved.laborRateHuf), cont: str(saved.contingencyPct), margin: str(saved.marginPct), step: str(saved.roundingStepHuf) });
  useEffect(() => { setF({ mode: saved.mode ?? "", rate: str(saved.laborRateHuf), cont: str(saved.contingencyPct), margin: str(saved.marginPct), step: str(saved.roundingStepHuf) }); }, [quote.id, JSON.stringify(quote.pricing_settings ?? null)]); // eslint-disable-line react-hooks/exhaustive-deps
  const next: QuotePricingSettings = { mode: (f.mode || null) as QuotePricingSettings["mode"], laborRateHuf: num(f.rate), contingencyPct: num(f.cont), marginPct: num(f.margin), roundingStepHuf: num(f.step) };
  const nan = Object.values(next).some((v) => typeof v === "number" && Number.isNaN(v));
  const errors = nan ? ["Csak szám adható meg."] : validatePricingSettings(next);
  const dirty = JSON.stringify(next) !== JSON.stringify(saved);
  const save = useMutation({
    mutationFn: async () => {
      if (locked) throw new Error("Kiküldött ajánlat nem módosítható.");
      if (errors.length) throw new Error(errors[0]);
      const { data, error } = await supabase.from("quotes").update({ pricing_settings: next as never }).eq("id", quote.id).select("id");
      if (error) throw error;
      if (!data || data.length !== 1) throw new Error("Az ajánlat nem módosítható (nincs jogosultság).");
    },
    onSuccess: () => { toast.success("Árazási beállítás mentve"); qc.invalidateQueries({ queryKey: ["quotes"] }); },
    onError: (e) => toast.error("Nem sikerült menteni", { description: humanizeSupabaseError(e) }),
  });
  return (
    <section className="rounded-md border bg-card p-4" aria-labelledby="qps-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 id="qps-title" className="text-sm font-semibold">Árazási beállítás ehhez az ajánlathoz</h3>
          <p className="text-xs text-muted-foreground">Belső adat. Minden számítás ezt használja; ha az óradíj üres, az óraalapú tételek ár nélkül maradnak.</p>
        </div>
        <Button size="sm" disabled={locked || !dirty || errors.length > 0 || save.isPending} onClick={() => save.mutate()}><Save className="mr-1.5 h-4 w-4" /> Mentés</Button>
      </div>
      <fieldset disabled={locked} className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {showMode && <div className="grid gap-1.5 sm:col-span-2 lg:col-span-1">
          <Label>Mit árazunk?</Label>
          <Select value={f.mode || "none"} onValueChange={(v) => setF((x) => ({ ...x, mode: v === "none" ? "" : v }))}>
            <SelectTrigger aria-label="Mit árazunk"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="none">Nincs megadva</SelectItem>{Object.entries(MODE_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
          </Select>
        </div>}
        <div className="grid gap-1.5"><Label htmlFor="qps-rate">Óradíj (Ft/óra)</Label><Input id="qps-rate" inputMode="decimal" placeholder="Nincs megadva" value={f.rate} onChange={(e) => setF((x) => ({ ...x, rate: e.target.value }))} /></div>
        <div className="grid gap-1.5"><Label htmlFor="qps-cont">Tartalék (%)</Label><Input id="qps-cont" inputMode="decimal" placeholder="0" value={f.cont} onChange={(e) => setF((x) => ({ ...x, cont: e.target.value }))} /></div>
        <div className="grid gap-1.5"><Label htmlFor="qps-margin">Haszon az anyagon (%)</Label><Input id="qps-margin" inputMode="decimal" placeholder="Nincs megadva" value={f.margin} onChange={(e) => setF((x) => ({ ...x, margin: e.target.value }))} /></div>
        <div className="grid gap-1.5"><Label htmlFor="qps-step">Kerekítés (Ft)</Label><Input id="qps-step" inputMode="numeric" placeholder="1" value={f.step} onChange={(e) => setF((x) => ({ ...x, step: e.target.value }))} /></div>
      </fieldset>
      {errors.length > 0 && <p role="alert" className="mt-2 text-xs text-destructive">{errors[0]}</p>}
      {locked && <p className="mt-2 text-xs text-muted-foreground">Kiküldött ajánlat — csak olvasható.</p>}
    </section>
  );
}
