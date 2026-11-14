/**
 * Determinisztikus pénzaritmetika: belül fillér (egész), százalék bázispontban (1% = 100 bp).
 * Minden kerekítés egy helyen, megnevezett szabállyal történik — így egy sor emberileg visszaszámolható.
 */

export type RoundingMode = "half_up" | "up" | "down";

/** Ft → fillér (egész), fél fillértől felfelé. */
export function toFiller(huf: number): number {
  if (!Number.isFinite(huf)) throw new Error("Érvénytelen összeg.");
  return Math.sign(huf) * Math.round(Math.abs(huf) * 100 + 1e-7);
}
export const fromFiller = (f: number) => f / 100;

/** Százalék → bázispont (két tizedesjegyig pontos, pl. 12.5% = 1250 bp). */
export function toBp(pct: number): number {
  if (!Number.isFinite(pct)) throw new Error("Érvénytelen százalék.");
  return Math.round(pct * 100);
}

function divRound(num: number, den: number, mode: RoundingMode = "half_up"): number {
  if (den <= 0) throw new Error("Érvénytelen osztó.");
  const sign = num < 0 ? -1 : 1, n = Math.abs(num);
  const q = Math.floor(n / den), r = n - q * den;
  if (r === 0) return sign * q;
  if (mode === "down") return sign * q;
  if (mode === "up") return sign * (q + 1);
  return sign * (2 * r >= den ? q + 1 : q);
}

/** amount × (1 + bp/10000), fillérre kerekítve. */
export function addPct(filler: number, bp: number): number {
  return divRound(filler * (10000 + bp), 10000);
}

/** Célfedezet: amount / (1 − bp/10000). 100% vagy több nem értelmezhető. */
export function grossUpMargin(filler: number, bp: number): number {
  if (bp < 0 || bp >= 10000) throw new Error("A célfedezet 0 és 100% közötti lehet.");
  return divRound(filler * 10000, 10000 - bp);
}

/** Egységár kerekítése a megadott Ft-lépcsőre (pl. 10 Ft), a kért irányba. */
export function roundToStep(filler: number, stepHuf: number, mode: RoundingMode = "half_up"): number {
  const step = Math.max(1, Math.round(stepHuf)) * 100;
  return divRound(filler, step, mode) * step;
}

/** Óra × óradíj → fillér (az óra tizedes, ezért itt egyszer, nevesítetten kerekítünk). */
export function hoursTimesRate(hours: number, rateHuf: number): number {
  return toFiller(hours * rateHuf);
}

/** Sorösszeg: egységár (fillér) × mennyiség, fillérre kerekítve. */
export function lineTotal(unitFiller: number, qty: number): number {
  return toFiller((unitFiller / 100) * qty);
}
