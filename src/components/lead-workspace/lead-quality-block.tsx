import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, AlertTriangle, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { computeLeadScore, type LeadForScore } from "@/lib/dedupe/lead-scoring";

/**
 * Lead-szintű adatminőség blokk a középső oszlopba.
 * Csak olvasó — a meglévő `leads`, `contacts`, `companies` mezőkből számol.
 */
export function LeadQualityBlock({ lead }: { lead: LeadForScore | null }) {
  const aux = useQuery({
    queryKey: ["lead", lead?.id, "quality-aux", lead?.company_id, lead?.contact_id],
    enabled: !!lead?.id,
    queryFn: async () => {
      const [{ data: company }, { data: contact }] = await Promise.all([
        lead?.company_id
          ? supabase.from("companies").select("domain,website").eq("id", lead.company_id).maybeSingle()
          : Promise.resolve({ data: null } as any),
        lead?.contact_id
          ? supabase.from("contacts").select("email,phone").eq("id", lead.contact_id).maybeSingle()
          : Promise.resolve({ data: null } as any),
      ]);
      return { company, contact };
    },
  });

  if (!lead) return null;
  const score = computeLeadScore(lead, aux.data?.contact ?? null, aux.data?.company ?? null);
  const tone =
    score.band === "green"  ? { bar: "bg-emerald-500", text: "text-emerald-700", border: "border-emerald-200", label: "Átadható" } :
    score.band === "yellow" ? { bar: "bg-amber-500",   text: "text-amber-700",   border: "border-amber-200",   label: "Részleges" } :
                              { bar: "bg-destructive", text: "text-destructive", border: "border-destructive/30", label: "Hiányos" };
  const Icon = score.band === "green" ? ShieldCheck : AlertTriangle;

  return (
    <section className={`rounded-md border ${tone.border} p-3`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <Icon className={`h-3.5 w-3.5 ${tone.text}`} /> Adatminőség
        </div>
        <span className={`text-sm font-semibold tabular-nums ${tone.text}`}>{score.pct}%</span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className={`h-full ${tone.bar}`} style={{ width: `${score.pct}%` }} />
      </div>
      <div className={`mt-1 text-[11px] font-medium ${tone.text}`}>{tone.label}</div>
      <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[12px]">
        {score.items.map((it) => (
          <li key={it.key} className="flex items-center gap-1.5">
            {it.ok ? (
              <CheckCircle2 className="h-3 w-3 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="h-3 w-3 text-amber-600 shrink-0" />
            )}
            <span className={it.ok ? "text-foreground" : "text-muted-foreground"}>
              {it.ok ? it.label : `${it.label} hiányzik`}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}