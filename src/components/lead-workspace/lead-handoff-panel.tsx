import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRightCircle, UserCheck, ShieldCheck, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { humanizeSupabaseError } from "@/lib/db-hooks";
import { toast } from "sonner";
import { computeCompanyScore } from "@/lib/dedupe/scoring";

/**
 * Marketing → Sales lead átadás panel.
 *
 * Csak akkor jelenik meg, ha:
 *   - a leadnek `qualified` a státusza (a marketinges már „Átadható"-ra állította),
 *   - a leadnek van `company_id`-ja (a `followups.company_id` kötelező az idővonalhoz).
 *
 * Adatmodell érintetlen: az átadás egy `followups` rekord
 * (`followup_type='handoff'`, `result='Átadva: <név> — <megjegyzés>'`)
 * és a `leads.status` továbbra is `qualified` marad. Új mező/tábla NEM jön létre.
 */
export function LeadHandoffPanel({
  lead,
}: {
  lead: { id: string; status: string | null; company_id: string | null } | null;
}) {
  const qc = useQueryClient();
  const [salesId, setSalesId] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [override, setOverride] = useState(false);

  // Cégadat-minőség lekérdezése (csak ha van company_id) — minőségkapuhoz.
  const quality = useQuery({
    queryKey: ["handoff", "quality", lead?.company_id],
    enabled: !!lead?.company_id,
    queryFn: async () => {
      const [{ data: company }, { data: contacts }] = await Promise.all([
        supabase.from("companies").select("id,name,company_type,tax_number,website,domain,city").eq("id", lead!.company_id!).maybeSingle(),
        supabase.from("contacts").select("email,phone").eq("company_id", lead!.company_id!),
      ]);
      if (!company) return null;
      return computeCompanyScore(company as any, contacts ?? []);
    },
  });

  // Értékesítők lekérdezése: users_profile JOIN roles WHERE roles.name = 'sales'.
  const sales = useQuery({
    queryKey: ["users_profile", "by-role", "sales"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users_profile")
        .select("id, full_name, email, roles!inner(name)")
        .eq("roles.name", "sales");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>;
    },
  });

  const handoff = useMutation({
    mutationFn: async () => {
      if (!lead) throw new Error("Nincs kiválasztott érdeklődő.");
      if (!lead.company_id) throw new Error("Átadás előtt cég szükséges.");
      if (!salesId) throw new Error("Válassz egy értékesítőt.");
      const chosen = (sales.data ?? []).find((s) => s.id === salesId);
      const name = chosen?.full_name?.trim() || chosen?.email || "ismeretlen értékesítő";
      const note_ = note.trim();
      const payload: Record<string, any> = {
        followup_type: "handoff",
        result: note_ ? `Átadva: ${name} — ${note_}` : `Átadva: ${name}`,
        due_date: new Date().toISOString(),
        completed: true,
        company_id: lead.company_id,
      };
      const { error: fuErr } = await supabase.from("followups").insert(payload);
      if (fuErr) throw fuErr;
      // A státusz `qualified` marad — az értékesítő a saját listájában az
      // „Átadható" / „qualified" szűrővel megtalálja, és a handoff followup
      // megjelenik a lead idővonalán.
      const { error: lErr } = await supabase
        .from("leads")
        .update({ status: "qualified" })
        .eq("id", lead.id);
      if (lErr) throw lErr;
      return name;
    },
    onSuccess: (name) => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["followups"] });
      toast.success(`Átadva: ${name}`);
      setNote("");
    },
    onError: (e: any) =>
      toast.error("Átadás sikertelen", { description: humanizeSupabaseError(e) }),
  });

  if (!lead) return null;
  if (lead.status !== "qualified") return null;

  const score = quality.data ?? null;
  const isRed = score?.band === "red";
  const isYellow = score?.band === "yellow";
  const canSubmit = !!salesId && !handoff.isPending && (!isRed || override);
  const chosenSales = (sales.data ?? []).find((s) => s.id === salesId);
  const chosenName = chosenSales?.full_name?.trim() || chosenSales?.email || null;
  const scoreTone = !score
    ? "text-muted-foreground"
    : score.band === "green"
    ? "text-emerald-700"
    : score.band === "yellow"
    ? "text-amber-700"
    : "text-destructive";

  return (
    <div className="rounded-md border border-primary/30 bg-primary/[0.04] p-3">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-primary/80">
        <UserCheck className="h-3 w-3" /> Átadás értékesítőnek
      </div>

      {!lead.company_id ? (
        <div className="rounded-md border border-dashed bg-background p-2 text-[11px] text-muted-foreground">
          Átadás előtt cég hozzárendelése szükséges.
        </div>
      ) : (
        <div className="space-y-2">
          <div className="rounded-md border bg-background p-2 text-[11px] space-y-1">
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Lead állapot</span>
              <span className="font-medium text-emerald-700">Átadható</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Értékesítő</span>
              <span className="font-medium">{chosenName ?? <span className="text-muted-foreground italic">nincs kiválasztva</span>}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Adatminőség</span>
              <span className={`font-medium ${scoreTone}`}>{score ? `${score.pct}%` : "—"}</span>
            </div>
          </div>
          {score && (isRed || isYellow) && (
            <div className={
              "rounded-md border p-2 text-[11px] " +
              (isRed ? "border-destructive/40 bg-destructive/5 text-destructive"
                     : "border-amber-500/40 bg-amber-50 text-amber-900")
            }>
              <div className="flex items-center gap-1.5 font-medium">
                {isRed ? <AlertTriangle className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3" />}
                Adatminőség: {score.pct}% — {isRed ? "Hiányos" : "Részleges"}
              </div>
              <div className="mt-0.5">
                {isRed ? "Erősen javasolt az adatok pótlása átadás előtt." : "Figyelmeztetés: néhány alapadat hiányzik."}
              </div>
              {score.missing.length > 0 && (
                <div className="mt-0.5 opacity-80">Hiányzik: {score.missing.join(", ")}</div>
              )}
              {isRed && (
                <label className="mt-1.5 flex items-center gap-1.5">
                  <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} />
                  Mégis átadom (felülbírálás)
                </label>
              )}
            </div>
          )}
          <select
            value={salesId}
            onChange={(e) => setSalesId(e.target.value)}
            className="h-8 w-full rounded-md border bg-background px-2 text-xs"
            disabled={sales.isLoading || handoff.isPending}
          >
            <option value="">{sales.isLoading ? "Betöltés…" : "Válassz értékesítőt…"}</option>
            {(sales.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name?.trim() || s.email || s.id.slice(0, 8)}
              </option>
            ))}
          </select>
          <Textarea
            placeholder="Megjegyzés (opcionális)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="text-xs"
            disabled={handoff.isPending}
          />
          <Button
            size="sm"
            className="w-full"
            disabled={!canSubmit}
            onClick={() => handoff.mutate()}
          >
            <ArrowRightCircle className="mr-1.5 h-3.5 w-3.5" />
            {handoff.isPending ? "Átadás…" : "Átadás és lezárás"}
          </Button>
          <div className="text-[10px] text-muted-foreground">
            Egy „handoff" típusú utókövetés rögzül az idővonalon. Új mező nem jön létre.
          </div>
        </div>
      )}
    </div>
  );
}
