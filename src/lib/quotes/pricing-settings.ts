/**
 * Ajánlatonkénti árazási beállítás (quotes.pricing_settings).
 * Egy ajánlathoz EGY beállítás tartozik; minden árazó segédeszköz (költségvetés-árazás,
 * tervellenőrzés, ajánlatcsomag, Timothy) ezt használja. Nincs rejtett alapérték:
 * ha az óradíj nincs megadva, a normaórás tétel ára hiányzó marad.
 */
import type { PricingMode, ProfileOverrides } from "@/lib/pricing/profiles";

export type QuotePricingSettings = {
  mode: PricingMode | null;
  laborRateHuf: number | null;
  contingencyPct: number | null;
  marginPct: number | null;
  roundingStepHuf: number | null;
};

export const EMPTY_PRICING_SETTINGS: QuotePricingSettings = { mode: null, laborRateHuf: null, contingencyPct: null, marginPct: null, roundingStepHuf: null };

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

/** Tűrő olvasás a mentett JSON-ból: ismeretlen vagy hibás mező = nincs megadva. */
export function parseQuotePricingSettings(raw: unknown): QuotePricingSettings {
  if (!raw || typeof raw !== "object") return { ...EMPTY_PRICING_SETTINGS };
  const r = raw as Record<string, unknown>;
  const mode = r.mode === "subcontractor_labor" || r.mode === "full_construction" ? r.mode : null;
  return { mode, laborRateHuf: num(r.laborRateHuf), contingencyPct: num(r.contingencyPct), marginPct: num(r.marginPct), roundingStepHuf: num(r.roundingStepHuf) };
}

/** Mentés előtti ellenőrzés; hibalista üres = menthető. */
export function validatePricingSettings(s: QuotePricingSettings): string[] {
  const e: string[] = [];
  if (s.laborRateHuf != null && (s.laborRateHuf <= 0 || s.laborRateHuf > 200_000)) e.push("Az óradíj 1 és 200 000 Ft/óra között lehet.");
  if (s.contingencyPct != null && (s.contingencyPct < 0 || s.contingencyPct > 500)) e.push("A tartalék 0 és 500% között lehet.");
  if (s.marginPct != null && (s.marginPct < 0 || s.marginPct > 95)) e.push("A célfedezet 0 és 95% között lehet.");
  if (s.roundingStepHuf != null && (!Number.isInteger(s.roundingStepHuf) || s.roundingStepHuf < 1 || s.roundingStepHuf > 100_000)) e.push("A kerekítés 1 és 100 000 Ft közötti egész szám lehet.");
  return e;
}

/**
 * Számítási paraméterek: a hívó kifejezett értéke elsőbbséget kap, egyébként az ajánlat
 * mentett beállítása. Hiányzó óradíj kifejezetten null — a profil tervezet-alapértéke soha nem érvényesül csendben.
 */
export function mergePricingOverrides(settings: QuotePricingSettings, overrides: ProfileOverrides = {}): ProfileOverrides {
  const pick = <T,>(explicit: T | undefined, saved: T | null): T | null | undefined => (explicit !== undefined ? explicit : saved ?? undefined);
  return {
    ...overrides,
    laborRateHuf: overrides.laborRateHuf !== undefined ? overrides.laborRateHuf : settings.laborRateHuf,
    contingencyPct: pick(overrides.contingencyPct, settings.contingencyPct) ?? 0,
    marginPct: overrides.marginPct !== undefined ? overrides.marginPct : settings.marginPct,
    roundingStepHuf: pick(overrides.roundingStepHuf, settings.roundingStepHuf) ?? undefined,
  };
}

/** Rövid, ügyfélnek nem látható összefoglaló a panelekben. */
export function pricingSettingsSummary(s: QuotePricingSettings): string {
  const f = (n: number) => n.toLocaleString("hu-HU");
  return [
    s.laborRateHuf != null ? `óradíj ${f(s.laborRateHuf)} Ft/óra` : "óradíj nincs megadva",
    `tartalék ${f(s.contingencyPct ?? 0)}%`,
    s.marginPct != null ? `célfedezet ${f(s.marginPct)}%` : "célfedezet nincs megadva",
    `kerekítés ${f(s.roundingStepHuf ?? 1)} Ft`,
  ].join(" · ");
}
