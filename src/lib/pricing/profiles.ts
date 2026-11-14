/**
 * P3 — vállalati és alvállalkozói kalkulációs profilok alapjai.
 * Az alapértékek NEM tulajdonos által jóváhagyott üzleti paraméterek: kiinduló tervezetek,
 * amelyeket a számítás minden futásnál kiír (értéknap, deviza, nettó, kerekítés).
 */
import type { RoundingMode } from "./money";

export type PricingMode = "subcontractor_labor" | "full_construction";
export const PRICING_MODE_LABEL: Record<PricingMode, string> = { subcontractor_labor: "Alvállalkozói munkadíj (anyag nélkül)", full_construction: "Teljes kivitelezés (anyag + munkadíj)" };

export type CalculationProfile = {
  id: string; label: string; mode: PricingMode; currency: "HUF"; netOnly: true;
  /** Óradíj (Ft/óra) normaórás munkadíjhoz; basis: eladási díj vagy belső önköltség. */
  laborRateHuf: number | null; laborRateBasis: "sell" | "cost";
  /** Korábbi ajánlati munkadíj: változatlanul, vagy visszaszámolt normaórával az aktuális óradíjra skálázva (becslés). */
  historicalLaborPolicy: "as_quoted" | "rate_scaled"; historicalBaseRateHuf: number | null;
  /** Önköltség-alapú árakra: anyag- és munkajárulék (organizáció, szállítás stb.), tartalék és célfedezet %. */
  materialSurchargePct: number; laborSurchargePct: number; contingencyPct: number; marginPct: number | null;
  rounding: { stepHuf: number; mode: RoundingMode };
  maxPriceAgeDays: number; allowHistoricalAuto: boolean; allowUnapprovedTemplate: boolean;
  priceZeroQty: boolean; overwriteExistingPrices: boolean;
  approval: "draft_default" | "owner_approved";
};

const COMMON = { currency: "HUF" as const, netOnly: true as const, rounding: { stepHuf: 1, mode: "half_up" as const }, maxPriceAgeDays: 365, priceZeroQty: false, overwriteExistingPrices: false, approval: "draft_default" as const };

export const DEFAULT_PROFILES: Record<PricingMode, CalculationProfile> = {
  subcontractor_labor: { ...COMMON, id: "viba_subcontractor_labor_draft", label: "VIBA alvállalkozói munkadíj (tervezet)", mode: "subcontractor_labor",
    laborRateHuf: 6500, laborRateBasis: "sell", historicalLaborPolicy: "as_quoted", historicalBaseRateHuf: 5800,
    materialSurchargePct: 0, laborSurchargePct: 0, contingencyPct: 0, marginPct: null, allowHistoricalAuto: true, allowUnapprovedTemplate: true },
  full_construction: { ...COMMON, id: "viba_full_construction_draft", label: "VIBA teljes kivitelezés (tervezet)", mode: "full_construction",
    laborRateHuf: 6500, laborRateBasis: "sell", historicalLaborPolicy: "as_quoted", historicalBaseRateHuf: 5800,
    materialSurchargePct: 0, laborSurchargePct: 0, contingencyPct: 0, marginPct: null, allowHistoricalAuto: true, allowUnapprovedTemplate: true },
};

export type ProfileOverrides = Partial<Pick<CalculationProfile, "laborRateHuf" | "laborRateBasis" | "historicalLaborPolicy" | "historicalBaseRateHuf" | "materialSurchargePct" | "laborSurchargePct" | "contingencyPct" | "marginPct" | "maxPriceAgeDays" | "allowHistoricalAuto" | "allowUnapprovedTemplate" | "priceZeroQty">> & { roundingStepHuf?: number; roundingMode?: RoundingMode };

export function resolveProfile(mode: PricingMode, o: ProfileOverrides = {}): CalculationProfile {
  const base = DEFAULT_PROFILES[mode];
  const p: CalculationProfile = { ...base, ...Object.fromEntries(Object.entries(o).filter(([k, v]) => v !== undefined && k !== "roundingStepHuf" && k !== "roundingMode")),
    rounding: { stepHuf: o.roundingStepHuf ?? base.rounding.stepHuf, mode: o.roundingMode ?? base.rounding.mode } } as CalculationProfile;
  const pct = (x: number | null, name: string, max = 500) => { if (x != null && (!Number.isFinite(x) || x < 0 || x > max)) throw new Error(`Érvénytelen ${name}.`); };
  pct(p.materialSurchargePct, "anyagjárulék"); pct(p.laborSurchargePct, "munkajárulék"); pct(p.contingencyPct, "tartalék"); pct(p.marginPct, "célfedezet", 95);
  if (p.laborRateHuf != null && (!Number.isFinite(p.laborRateHuf) || p.laborRateHuf <= 0 || p.laborRateHuf > 200_000)) throw new Error("Érvénytelen óradíj.");
  if (p.historicalBaseRateHuf != null && (!Number.isFinite(p.historicalBaseRateHuf) || p.historicalBaseRateHuf <= 0)) throw new Error("Érvénytelen viszonyítási óradíj.");
  if (!Number.isFinite(p.rounding.stepHuf) || p.rounding.stepHuf < 1 || p.rounding.stepHuf > 100_000) throw new Error("Érvénytelen kerekítési lépcső.");
  if (!Number.isInteger(p.maxPriceAgeDays) || p.maxPriceAgeDays < 1 || p.maxPriceAgeDays > 3650) throw new Error("Érvénytelen árfrissességi korlát.");
  return p;
}
